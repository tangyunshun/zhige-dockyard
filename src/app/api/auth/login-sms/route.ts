import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { phone, smsCode } = await request.json();

    if (!phone || !smsCode) {
      return NextResponse.json(
        { error: "手机号和验证码不能为空" },
        { status: 400 },
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "手机号格式不正确" },
        { status: 400 },
      );
    }

    // 验证验证码（开发环境使用 debugCode）
    if (process.env.NODE_ENV === "development") {
      // 开发环境：验证码固定为 6 位数字即可
      if (!/^\d{6}$/.test(smsCode)) {
        return NextResponse.json(
          { error: "验证码格式不正确" },
          { status: 400 },
        );
      }
    } else {
      // 生产环境：需要从 Redis 或其他存储中验证验证码
      // TODO: 实现生产环境的验证码验证逻辑
      return NextResponse.json(
        { error: "生产环境验证码验证暂未实现" },
        { status: 501 },
      );
    }

    // 查找用户（支持手机号）
    const user = await prisma.user.findFirst({
      where: {
        phone: phone,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "该手机号未注册" },
        { status: 404 },
      );
    }

    // 检查账号状态
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "账号已被禁用", status: "disabled" },
        { status: 403 },
      );
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        {
          error: `账号已锁定，请${minutes}分钟后再试`,
          status: "locked",
          minutesRemaining: minutes,
        },
        { status: 423 },
      );
    }

    // 生成会话 token
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时后过期

    // 生成 JWT token
    const token = await new SignJWT({
      userId: user.id,
      userRole: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    // 更新用户登录时间和会话信息
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        sessionToken,
        sessionExpiresAt,
      },
    });
    
    console.log(
      `[Login SMS] 用户 ${user.id} 登录成功，lastLoginAt 已更新为:`,
      updatedUser.lastLoginAt,
      `sessionToken: ${sessionToken}`,
      `sessionExpiresAt: ${sessionExpiresAt}`,
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        sessionToken, // 返回会话令牌用于前端存储
      },
    });
  } catch (error) {
    console.error("Login SMS error:", error);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 },
    );
  }
}
