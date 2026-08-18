import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

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
    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        refreshToken,
        refreshTokenExpiresAt: { gt: now }
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: "REFRESH_TOKEN_INVALID", message: "refresh token 无效或已过期" },
        { status: 401 }
      );
    }

    // 账号状态校验
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "账号已禁用" },
        { status: 403 }
      );
    }

    // 生成新 sessionToken
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 续期默认 2 小时

    // 生成新 refreshToken
    const newRefreshToken = crypto.randomUUID();
    const newRefreshTokenExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 默认 7 天

    // 更新 User 表
    await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionToken,
        sessionExpiresAt,
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt
      }
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

    // 生成新 JWT
    const newAccessToken = await new SignJWT({
      userId: user.id,
      email: user.email || "",
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email || "",
        role: user.role
      }
    });

    // 设置 cookies
    response.cookies.set("auth_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    response.cookies.set("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
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