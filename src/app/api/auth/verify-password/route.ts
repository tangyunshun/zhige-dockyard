﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";
import { verifyPassword } from "@/lib/auth";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 二次鉴权API
 * 用于高危操作（如删除工作空间、修改支付密码、注销账号）前的身份验证
 *
 * 场景33：二次风控鉴权
 */
export async function POST(request: NextRequest) {
  try {
    // 从 Cookie 或 Authorization header 获取 token
    let token = request.cookies.get("auth_token")?.value;
    const authHeader = request.headers.get("Authorization");

    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    // 验证 token
    let payload: any;
    try {
      const { payload: p } = await jwtVerify(token, JWT_SECRET);
      payload = p;
    } catch (error) {
      return NextResponse.json(
        { error: "TOKEN_INVALID", message: "登录已过期，请重新登录" },
        { status: 401 }
      );
    }

    const userId = payload.userId as string;
    const { password, action } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: "请输入密码" },
        { status: 400 }
      );
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 检查用户状态
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号状态异常，请联系管理员" },
        { status: 403 }
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: "密码错误" },
        { status: 400 }
      );
    }

    // 密码验证成功，生成二次验证 token（5分钟内有效）
    const verifyToken = await new SignJWT({
      userId,
      verified: true,
      action: action || "high_risk_operation",
      timestamp: Date.now(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(JWT_SECRET);

    console.log(`[二次鉴权] 用户 ${userId} 完成${action || '高危操作'}的二次验证`);

    return NextResponse.json({
      success: true,
      message: "验证成功",
      verifyToken,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("[API /auth/verify-password] 二次鉴权失败:", error);
    return NextResponse.json(
      { error: "验证失败" },
      { status: 500 }
    );
  }
}

/**
 * 验证二次验证 token
 * 用于高危操作前验证 token 是否有效
 */
export async function PUT(request: NextRequest) {
  try {
    const { verifyToken, action } = await request.json();

    if (!verifyToken) {
      return NextResponse.json(
        { error: "缺少验证令牌" },
        { status: 400 }
      );
    }

    // 验证 token
    let payload: any;
    try {
      const { payload: p } = await jwtVerify(verifyToken, JWT_SECRET);
      payload = p;
    } catch (error) {
      return NextResponse.json(
        { error: "TOKEN_INVALID", message: "验证令牌无效或已过期" },
        { status: 401 }
      );
    }

    // 检查验证标记
    if (!payload.verified) {
      return NextResponse.json(
        { error: "未完成身份验证" },
        { status: 401 }
      );
    }

    // 如果指定了 action，检查 action 是否匹配
    if (action && payload.action !== action) {
      return NextResponse.json(
        { error: "验证类型不匹配，请重新验证" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "验证令牌有效",
      userId: payload.userId,
    });
  } catch (error) {
    console.error("[API /auth/verify-password] 验证令牌失败:", error);
    return NextResponse.json(
      { error: "验证失败" },
      { status: 500 }
    );
  }
}
