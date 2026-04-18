import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { account, password, rememberMe } = await request.json();

    // 查找用户（支持邮箱/手机号/账号）
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { phone: account }, { name: account }],
      },
    });

    if (!user) {
      return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
    }

    // 检查账号状态
    if (user.status !== "active") {
      return NextResponse.json({ message: "账号已被禁用" }, { status: 403 });
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        { message: `账号已锁定，请${minutes}分钟后再试` },
        { status: 423 },
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      // 增加失败次数
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= 5) {
        // 锁定 15 分钟
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil,
          },
        });

        return NextResponse.json(
          { message: "密码错误次数过多，账号已锁定 15 分钟" },
          { status: 423 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      return NextResponse.json(
        { message: `账号或密码错误（剩余${5 - newAttempts}次尝试机会）` },
        { status: 401 },
      );
    }

    // 登录成功，重置失败次数
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 生成 JWT Token
    const expiresIn = rememberMe ? "7d" : "24h";
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);

    // 生成 Refresh Token（仅当记住我时）
    let refreshToken = null;
    if (rememberMe) {
      refreshToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(JWT_SECRET);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });
    }

    return NextResponse.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
