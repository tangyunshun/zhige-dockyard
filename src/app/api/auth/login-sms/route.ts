import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { verifySmsCode, deleteSmsCode } from "@/lib/sms-store";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { phone, smsCode, rememberMe } = await request.json();

    if (!phone || !smsCode) {
      return NextResponse.json(
        { error: "请输入手机号和验证码" },
        { status: 400 },
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "请输入正确的手机号" },
        { status: 400 },
      );
    }

    // 验证验证码格式
    if (!smsCode || smsCode.length !== 6 || !/^\d{6}$/.test(smsCode)) {
      return NextResponse.json(
        { error: "请输入正确的验证码" },
        { status: 400 },
      );
    }

    // 验证验证码
    const smsVerification = verifySmsCode(phone, smsCode);
    if (!smsVerification.valid) {
      return NextResponse.json(
        { error: smsVerification.error || "验证码错误" },
        { status: 400 },
      );
    }

    // 查找用户
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

    // 如果用户状态是 inactive，激活用户
    if (user.status === "inactive") {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "active" },
      });
      user.status = "active";
    }

    // 检查用户状态
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "账号已被禁用", status: "disabled" },
        { status: 403 },
      );
    }

    // 检查用户是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        {
          error: `账号已被锁定，请${minutes}分钟后再试`,
          status: "locked",
          minutesRemaining: minutes,
        },
        { status: 423 },
      );
    }

    // 生成 session
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = rememberMe
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 天
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时
    
    // 删除验证码
    deleteSmsCode(phone);

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginAttempts: 0,
        lockedUntil: null,
        sessionToken,
        sessionExpiresAt,
      },
    });

    // 生成 JWT Token
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(rememberMe ? '7d' : '24h')
      .sign(JWT_SECRET);

    // 准备用户数据
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      sessionToken,
    };

    const response = NextResponse.json({
      success: true,
      message: "登录成功",
      user: userData,
    });

    // 设置 Cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error("SMS login error:", error);
    return NextResponse.json(
      { error: "登录失败" },
      { status: 500 }
    );
  }
}
