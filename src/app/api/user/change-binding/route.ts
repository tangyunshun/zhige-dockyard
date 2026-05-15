import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 绑定变更（手机号/邮箱）API
 * 变更后强制当前会话下线
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const { type, value, verificationCode } = await request.json();

    if (!type || !value) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    if (!["phone", "email"].includes(type)) {
      return NextResponse.json(
        { error: "无效的绑定类型" },
        { status: 400 }
      );
    }

    // 验证验证码（实际应用中需要验证短信/邮箱验证码）
    // 这里简化处理，实际需要对接短信/邮箱服务商
    if (!verificationCode) {
      return NextResponse.json(
        { error: "请输入验证码" },
        { status: 400 }
      );
    }

    // 检查新绑定是否已被其他用户使用
    const existingUser = await prisma.user.findFirst({
      where: {
        [type]: value,
        id: { not: userId },
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: `${type === "phone" ? "手机号" : "邮箱"}已被其他账号使用` },
        { status: 400 }
      );
    }

    // 更新绑定
    const updateData: any = {};
    updateData[type] = value;

    // 变更绑定后强制当前会话下线
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    console.log(`[绑定变更] 用户 ${userId} 变更了${type === "phone" ? "手机号" : "邮箱"}，当前会话已下线`);

    // 清除Cookie
    const response = NextResponse.json({
      success: true,
      message: `${type === "phone" ? "手机号" : "邮箱"}绑定已变更，请重新登录`,
      needReLogin: true,
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
    console.error("Change binding error:", error);
    return NextResponse.json(
      { error: "绑定变更失败" },
      { status: 500 }
    );
  }
}