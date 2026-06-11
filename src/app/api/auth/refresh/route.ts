﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * Token刷新接口
 * 用于在Access Token过期前静默刷新，实现用户无感知的会话续期
 */
export async function POST(request: NextRequest) {
  try {
    // 从Cookie获取refresh token
    const refreshToken = request.cookies.get("refresh_token")?.value;
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: "REFRESH_TOKEN_REQUIRED", message: "需要refresh token" },
        { status: 400 }
      );
    }

    // 验证refresh token
    let userId: string;
    try {
      const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
      userId = payload.userId as string;
    } catch (error) {
      return NextResponse.json(
        { error: "INVALID_REFRESH_TOKEN", message: "refresh token无效" },
        { status: 401 }
      );
    }

    // 检查用户是否存在且状态正常
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        refreshToken: true,
        refreshTokenExpiresAt: true,
        lastForcedLogoutAt: true,
        sessionToken: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "用户不存在" },
        { status: 404 }
      );
    }

    // ========== 最优先检查：账号状态 ==========
    if (user.status === "deleted") {
      return NextResponse.json(
        { error: "ACCOUNT_DELETED", message: "您的账号已被注销" },
        { status: 401 }
      );
    }

    if (user.status === "banned") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号已被永久封禁" },
        { status: 403 }
      );
    }

    if (user.status === "inactive") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号已被禁用，请联系管理员" },
        { status: 403 }
      );
    }

    // 检查用户是否被强制下线（2分钟宽限期）
    if (user.lastForcedLogoutAt) {
      const now = Date.now();
      const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
      const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60; // 分钟

      if (timeSinceForcedLogout >= 2) {
        // 超过2分钟宽限期，拒绝刷新token
        return NextResponse.json(
          { error: "FORCED_LOGOUT", message: "您已被强制下线，请重新登录" },
          { status: 401 }
        );
      }
    }

    // 检查refresh token是否匹配（防止token泄露后被滥用）
    if (user.refreshToken !== refreshToken) {
      return NextResponse.json(
        { error: "TOKEN_MISMATCH", message: "refresh token不匹配" },
        { status: 401 }
      );
    }

    // 检查refresh token是否过期
    if (user.refreshTokenExpiresAt && new Date(user.refreshTokenExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: "REFRESH_TOKEN_EXPIRED", message: "refresh token已过期" },
        { status: 401 }
      );
    }

    // 生成新的access token（24小时有效期）
    const newAccessToken = await new SignJWT({
      userId: user.id,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    // 生成新的refresh token（30天有效期）
    const newRefreshToken = await new SignJWT({ userId: user.id })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(JWT_SECRET);

    // 更新用户数据库中的refresh token
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 创建响应
    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
    });

    // 设置新的cookies
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
      maxAge: 30 * 24 * 60 * 60,
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