import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";
import { ACCESS_TOKEN_TTL_SECONDS, SESSION_ERROR_CODES } from "@/lib/session-constants";
import { toAccountStatus, isLoginBlocked, isFullyBlocked } from "@/lib/account-status";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// E-06 RT 防重放：记录"上一代已废弃 RT"，若被重放则判定盗用
// PRD 原意用 Redis；本仓库以 user 表的 refreshTokenPrev 字段等价实现
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

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

    // A-06：AT 有效期 5 分钟，前端在过期前静默调用本接口
    const newAccessToken = await new SignJWT({
      userId: user.id,
      email: user.email || "",
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      // 告知前端 AT 有效期，便于调度提前刷新（A-06 无感刷新）
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email || "",
        role: user.role,
      },
    });

    response.cookies.set("auth_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
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
