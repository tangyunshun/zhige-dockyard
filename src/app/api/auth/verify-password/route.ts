﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { verifyPassword } from "@/lib/auth";
import { issueStepUpToken, verifyStepUpToken, STEP_UP_TTL_MS } from "@/lib/step-up";
import { assertCSRF } from "@/lib/csrf";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 二次鉴权API
 * 用于高危操作（如删除工作空间、修改支付密码、注销账号）前的身份验证
 *
 * 场景33：二次风控鉴权（PRD E-04）
 * 密码验证成功后签发一次性 Step-up 令牌（DB 持久化，3 分钟有效），
 * 高危 API 通过 requireStepUp 消费该令牌。
 */
export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json(
        { error: "CSRF_INVALID", message: "请求来源校验失败" },
        { status: 403 },
      );
    }

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

    // 密码验证成功，签发 DB 化的一次性二次鉴权令牌（PRD E-04：3 分钟有效）
    const operation = action || "high_risk_operation";
    const verifyToken = await issueStepUpToken(userId, operation);

    console.log(`[二次鉴权] 用户 ${userId} 完成${operation}的二次验证`);

    // 审计日志：二次鉴权签发属于安全敏感事件
    try {
      const { writeAuditLog } = await import("@/lib/security");
      await writeAuditLog(userId, "stepup:issued", { operation }, null, null, request);
    } catch (err) {
      console.error("[二次鉴权] 写入审计日志失败:", err);
    }

    return NextResponse.json({
      success: true,
      message: "验证成功",
      verifyToken,
      expiresIn: Math.floor(STEP_UP_TTL_MS / 1000),
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
 * 校验二次鉴权令牌（DB 校验，一次性消费）
 * 供高危操作前验证令牌有效性
 */
export async function PUT(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json(
        { error: "CSRF_INVALID", message: "请求来源校验失败" },
        { status: 403 },
      );
    }

    // 解析当前登录态
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

    const { verifyToken, action } = await request.json();

    if (!verifyToken) {
      return NextResponse.json(
        { error: "缺少验证令牌" },
        { status: 400 }
      );
    }

    // DB 校验一次性令牌
    const operation = action || "high_risk_operation";
    const ok = await verifyStepUpToken(payload.userId as string, operation, verifyToken);

    if (!ok) {
      return NextResponse.json(
        { error: "SEC_AUTH_INVALID", message: "验证令牌无效、已过期或已被使用" },
        { status: 403 }
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
