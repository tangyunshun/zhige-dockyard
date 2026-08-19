import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { requireStepUp } from "@/lib/step-up";
import { assertCSRF } from "@/lib/csrf";
import { getDeletionCooldownDays, getDeletionCooldownMs } from "@/lib/account-deletion";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

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

    // 获取用户ID
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const { verifyToken } = await request.json().catch(() => ({}));

    // 验证二次鉴权令牌 (SCENARIO_033 / PRD E-04，DB 化一次性令牌)
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

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true },
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

    // 清除Cookie
    const response = NextResponse.json({
      success: true,
      message: `注销申请已提交，${cooldownDays} 天后正式生效，期间可撤销`,
      deletionRequestedAt: deletionRequestedAt.toISOString(),
      daysRemaining: cooldownDays,
    });

    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

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