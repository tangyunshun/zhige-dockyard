import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 用户申请注销账号API
 * 设置冷静期（7天），期间可撤销
 */
export async function POST(request: NextRequest) {
  try {
    // 获取用户ID
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const { verifyToken } = await request.json().catch(() => ({}));

    // 验证二次鉴权令牌 (SCENARIO_033)
    if (!verifyToken) {
      return NextResponse.json({ error: "SEC_AUTH_REQUIRED", message: "此高危操作需要进行二次身份验证" }, { status: 403 });
    }

    try {
      const { payload: verifyPayload } = await jwtVerify(verifyToken, JWT_SECRET);
      if (!verifyPayload.verified || verifyPayload.userId !== userId || verifyPayload.action !== "cancel_account") {
        return NextResponse.json({ error: "SEC_AUTH_INVALID", message: "验证令牌不匹配，请重新验证" }, { status: 403 });
      }
    } catch (err) {
      return NextResponse.json({ error: "SEC_AUTH_EXPIRED", message: "验证令牌已过期，请重新验证" }, { status: 403 });
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

    // 设置冷静期（7天）- 使用 deletionRequestedAt 字段
    const deletionRequestedAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

    console.log(`[账号注销申请] 用户 ${userId} 申请注销，冷静期至 ${deletionRequestedAt}`);

    // 清除Cookie
    const response = NextResponse.json({
      success: true,
      message: "注销申请已提交，7天后正式生效，期间可撤销",
      deletionRequestedAt: deletionRequestedAt.toISOString(),
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