import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";
import { requireStepUp } from "@/lib/step-up";
import { assertCSRF } from "@/lib/csrf";
import { getDeletionCooldownDays, getDeletionCooldownMs } from "@/lib/account-deletion";
import { getJwtSecretKey } from "@/lib/jwt-config";

/**
 * 用户申请注销账号API（D-02）
 * 设置冷静期（默认 7 天，可通过 systemconfig 配置），期间可撤销
 */
export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json({ error: "CSRF_INVALID", message: "请求来源校验失败" }, { status: 403 });
    }

    // 获取用户ID：优先从 Cookie 获取，Cookie 缺省时从 Authorization Header 获取
    let token = request.cookies.get("auth_token")?.value;
    if (!token) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
    }
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const userId = payload.userId as string;

    const { verifyToken } = await request.json().catch(() => ({}));

    // 读取「删除与吊销操作强制二次确认」偏好（默认开启）。
    // 开关开启（requireDeleteConfirm !== false）时强制二次身份验证；
    // 关闭时免除 step-up，但仍保留 CSRF、冷静期与审计留痕等其余防护。
    let requireDeleteConfirm = true;
    try {
      const prefRows = await prisma.$queryRawUnsafe<Array<{ uiSettings: string | null }>>(
        `SELECT uiSettings FROM userpreference WHERE userId = ?`,
        userId
      );
      const raw = prefRows[0]?.uiSettings;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && parsed.requireDeleteConfirm === false) requireDeleteConfirm = false;
      }
    } catch {
      /* 偏好读取失败按默认开启处理，不阻断主流程 */
    }

    // 验证二次鉴权令牌 (SCENARIO_033 / PRD E-04，DB 化一次性令牌)
    if (requireDeleteConfirm) {
      const stepUp = await requireStepUp(request, "cancel_account", userId, { verifyToken });
      if (!stepUp.ok) {
        return NextResponse.json(
          {
            error: stepUp.error,
            message:
              stepUp.error === "SEC_AUTH_REQUIRED"
                ? "此高危操作需要进行二次身份验证"
                : "验证令牌无效或已过期，请重新验证",
          },
          { status: stepUp.status }
        );
      }
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查用户状态
    if (user.status === "deleted") {
      return NextResponse.json({ error: "账号已注销" }, { status: 400 });
    }

    if (user.status === "deleting") {
      return NextResponse.json({ error: "账号正在注销中" }, { status: 400 });
    }

    // 设置冷静期（PRD D-02：默认 7 天，可通过 systemconfig 配置 account_deletion_cooldown_days）
    const cooldownDays = await getDeletionCooldownDays();
    const deletionRequestedAt = new Date(Date.now() + await getDeletionCooldownMs());

    // 更新用户状态为"正在注销"
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "deleting",
        deletionRequestedAt: deletionRequestedAt,
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    // 记录审计日志（D-02：注销申请）
    await prisma.operationlog.create({
      data: {
        id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
        userId,
        action: "ACCOUNT_DELETION_REQUESTED",
        resource: "user/account",
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          "unknown",
        details: {
          message: "用户提交注销申请，进入冷静期",
          cooldownDays,
          deletionDeadline: deletionRequestedAt.toISOString(),
        },
      },
    });

    console.log(`[账号注销申请] 用户 ${userId} 申请注销，冷静期至 ${deletionRequestedAt}`);

    const now = new Date();
    // 签发冷静期临时撤销令牌（供首页遮罩弹窗或撤销页直接一键撤销恢复，不携带 sessionToken，无法进入业务工作台）
    const tempToken = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      deletionStatus: "cancelling",
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(getJwtSecretKey());

    const response = NextResponse.json({
      success: true,
      message: `注销申请已提交，${cooldownDays} 天后正式生效，期间可随时撤销`,
      deletionRequestedAt: deletionRequestedAt.toISOString(),
      daysRemaining: cooldownDays,
      token: tempToken,
      userId: user.id,
    });

    // 写入临时撤销凭证（24小时有效）
    response.cookies.set("auth_token", tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });

    // 彻底销毁正式业务会话与刷新令牌
    response.cookies.set("session_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set("refresh_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Account deletion request error:", error);
    return NextResponse.json(
      { error: "提交注销申请失败" },
      { status: 500 }
    );
  }
}