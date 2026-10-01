import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";
import { ACCESS_TOKEN_TTL_SECONDS, ABSOLUTE_TIMEOUT_REMEMBER_MS, SESSION_ERROR_CODES } from "@/lib/session-constants";
import { toAccountStatus, isLoginBlocked, isFullyBlocked } from "@/lib/account-status";
import { getJwtSecretKey } from "@/lib/jwt-config";

// E-06 RT 防重放：记录"上一代已废弃 RT"，若被重放则判定盗用
// PRD 原意用 Redis；本仓库以 user 表的 refreshTokenPrev 字段等价实现
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // 优先取请求体；兼容 httpOnly refresh_token cookie（前端 fetch credentials:"include" 自动携带）
    let refreshToken: string | undefined = body?.refreshToken;
    if (!refreshToken) refreshToken = request.cookies.get("refresh_token")?.value || undefined;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "REFRESH_TOKEN_INVALID", message: "refresh token 不能为空" },
        { status: 401 }
      );
    }

    const now = new Date();
    const user = await prisma.user.findFirst({
      where: {
        refreshToken,
        refreshTokenExpiresAt: { gt: now },
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        sessionRememberMe: true, // 显式标记判定「记住我」长会话（与 validateUser 一致，不靠时长推断）
        sessionToken: true,
        sessionExpiresAt: true,
        refreshToken: true,
        refreshTokenPrev: true,
        refreshTokenExpiresAt: true,
      },
    });

    if (!user) {
      // E-06：检测旧 RT 重放 —— 若提供的 RT 是"上一代已废弃 Token"，判定为盗用，永久封禁
      const replayed = await prisma.user.findFirst({
        where: { refreshTokenPrev: refreshToken },
        select: { id: true },
      });
      if (replayed) {
        await prisma.user.update({
          where: { id: replayed.id },
          data: { status: "banned", bannedUntil: null }, // PERM_BANNED 永久封禁
        });
        console.warn(`[RT防重放] 账号 ${replayed.id} 检测到旧 refreshToken 重放，已永久封禁`);
        return NextResponse.json(
          { error: "ACCOUNT_DISABLED", message: "检测到令牌重放，账号已封禁" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "REFRESH_TOKEN_INVALID", message: "refresh token 无效或已过期" },
        { status: 401 }
      );
    }

    // 账号状态机校验（PRD I-05 / 模块 C）
    const accountStatus = toAccountStatus(user.status);
    if (isFullyBlocked(accountStatus) || isLoginBlocked(accountStatus)) {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "账号已禁用" },
        { status: 403 }
      );
    }

    // A-02/A-03：绝对硬超时不可滑动续期，沿用原 sessionExpiresAt / RT 过期
    const sessionExpiresAt = user.sessionExpiresAt && user.sessionExpiresAt > now
      ? user.sessionExpiresAt
      : new Date(now.getTime() + 8 * 60 * 60 * 1000); // 兜底 8h
    const refreshTokenExpiresAt = user.refreshTokenExpiresAt && user.refreshTokenExpiresAt > now
      ? user.refreshTokenExpiresAt
      : new Date(now.getTime() + 8 * 60 * 60 * 1000);

    // E-06：生成新 RT，旧 RT 降为 prev（支持重放检测）
    const newRefreshToken = crypto.randomUUID();
    const prevRefreshToken = user.refreshToken;

    const sessionToken = crypto.randomUUID();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionToken,
        sessionExpiresAt,
        refreshToken: newRefreshToken,
        refreshTokenPrev: prevRefreshToken, // 废弃旧 RT 留存用于防重放
        refreshTokenExpiresAt,
      },
    });

    // 内存同步
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === user.id) {
        sessionCache.delete(key);
      }
    }
    sessionCache.set(sessionToken, {
      userId: user.id,
      expiresAt: sessionExpiresAt,
    });

    // 「记住我」长会话（绝对超时长于 24h）：AT 有效期与 cookie 一并持久化为会话剩余时长
    // （封顶 7 天），使关浏览器后重开时中间件 / 前端凭该长效令牌直接放行（落实「7 天内免登录」）；
    // 非记住我短会话仍保持 5 分钟短 AT（A-06 安全设计），由前端无感刷新续期。
    const sessionRemainingMs = Math.max(0, sessionExpiresAt.getTime() - now.getTime());
    // 与 validateUser 一致：以显式 sessionRememberMe 标记判定「记住我」长会话，
    // 不靠「剩余时长 > 24h」推断（管理员可配 sessionTimeoutHours > 24h，推断会误判普通会话为记住我）。
    const isLongSession = user.sessionRememberMe === true;
    const atTtlSeconds = isLongSession
      ? Math.max(Math.min(Math.floor(sessionRemainingMs / 1000), Math.floor(ABSOLUTE_TIMEOUT_REMEMBER_MS / 1000)), ACCESS_TOKEN_TTL_SECONDS)
      : ACCESS_TOKEN_TTL_SECONDS;

    // A-06：AT 有效期 5 分钟，前端在过期前静默调用本接口
    const newAccessToken = await new SignJWT({
      userId: user.id,
      email: user.email || "",
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(`${atTtlSeconds}s`)
      .sign(getJwtSecretKey());

    const response = NextResponse.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      // 告知前端 AT 有效期，便于调度提前刷新（A-06 无感刷新）
      expiresIn: atTtlSeconds,
      user: {
        id: user.id,
        email: user.email || "",
        role: user.role,
      },
    });

    // AT cookie 持久化策略与上方 JWT 有效期保持一致（长会话=会话剩余时长，短会话=5 分钟），
    // 确保中间件 jwtVerify 在「关浏览器再开」时仍认可该长效令牌，直接进入首页。
    response.cookies.set("auth_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(isLongSession
        ? { maxAge: Math.max(Math.floor(sessionRemainingMs / 1000), ACCESS_TOKEN_TTL_SECONDS) }
        : { maxAge: ACCESS_TOKEN_TTL_SECONDS }),
    });

    response.cookies.set("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor((refreshTokenExpiresAt.getTime() - now.getTime()) / 1000),
    });

    return response;
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json(
      { error: "TOKEN_REFRESH_FAILED", message: "token刷新失败" },
      { status: 500 }
    );
  }
}
