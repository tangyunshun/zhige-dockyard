﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";
import { getClientIP, recordLoginIP } from "@/lib/ip-risk";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// 异地登录验证码临时存储（进程内，生产应替换为 Redis）
const crossRegionCodes = new Map<string, { code: string; expiresAt: number }>();

const CODE_TTL_MS = 5 * 60 * 1000;

async function readVerifyToken(verifyToken: string) {
  const { payload } = await jwtVerify(verifyToken, JWT_SECRET);
  if (payload.action !== "cross_region_verify") {
    throw new Error("TOKEN_TYPE_MISMATCH");
  }
  return payload as { userId: string };
}

function maskTarget(value?: string | null): string {
  if (!value) return "";
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return value.length > 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

/**
 * 发送异地登录验证码
 * 前端仅需携带登录接口下发的 verifyToken，无需暴露 userId
 */
export async function PUT(request: NextRequest) {
  try {
    const { verifyToken } = await request.json();
    if (!verifyToken) {
      return NextResponse.json({ error: "缺少验证令牌" }, { status: 400 });
    }

    let userId: string;
    try {
      ({ userId } = await readVerifyToken(verifyToken));
    } catch {
      return NextResponse.json({ error: "验证令牌无效或已过期" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    crossRegionCodes.set(userId, { code, expiresAt: Date.now() + CODE_TTL_MS });

    console.log(`[异地登录] 用户 ${userId} 验证码: ${code}（5分钟内有效）`);

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      target: maskTarget(user.phone || user.email),
      devCode: process.env.NODE_ENV === "development" ? code : undefined,
      expiresIn: CODE_TTL_MS / 1000,
    });
  } catch (error) {
    console.error("[API /auth/confirm-crossregion-login] 发送验证码失败:", error);
    return NextResponse.json({ error: "发送验证码失败" }, { status: 500 });
  }
}

/**
 * 异地登录确认API
 * 用户完成验证码验证后，调用此API确认登录并挤掉旧会话
 *
 * 场景21：异地登录验证+挤线
 */
export async function POST(request: NextRequest) {
  try {
    const { verifyToken, code, rememberMe } = await request.json();

    if (!verifyToken) {
      return NextResponse.json({ error: "缺少验证令牌" }, { status: 400 });
    }

    // 验证verifyToken（来自登录接口的临时token）
    let payload: { userId: string };
    try {
      payload = await readVerifyToken(verifyToken);
    } catch (error) {
      const msg =
        error instanceof Error && error.message === "TOKEN_TYPE_MISMATCH"
          ? "验证令牌类型不匹配"
          : "验证令牌无效或已过期";
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    const userId = payload.userId as string;

    // 校验验证码（场景21/33二次鉴权）
    if (!code) {
      return NextResponse.json({ error: "请输入验证码" }, { status: 400 });
    }
    const stored = crossRegionCodes.get(userId);
    if (!stored || stored.expiresAt < Date.now()) {
      crossRegionCodes.delete(userId);
      return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
    }
    if (stored.code !== String(code).trim()) {
      return NextResponse.json({ error: "验证码错误" }, { status: 400 });
    }
    crossRegionCodes.delete(userId);

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查用户状态
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号状态异常，请联系管理员" },
        { status: 403 }
      );
    }

    const now = new Date();
    const clientIP = getClientIP(request);

    // 生成新的会话令牌
    const sessionToken = "sess_" + user.id + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 挤掉旧会话
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken,
        sessionExpiresAt,
        lastLoginAt: now,
        lastActivityAt: now,
        lastForcedLogoutAt: now,
        loginAttempts: 0,
      },
    });

    // 记录登录IP
    await recordLoginIP(userId, clientIP, request.headers.get("user-agent") || undefined);

    // 记录登录历史
    const loginHistoryId = "lh_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    await prisma.loginhistory.create({
      data: {
        id: loginHistoryId,
        userId: user.id,
        loginAt: now,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // 生成JWT Token
    const expiresIn = rememberMe ? "7d" : "24h";
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);

    // 生成Refresh Token（仅当记住我时）
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
          refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // 创建设备记录
    try {
      const userAgent = request.headers.get("user-agent") || "unknown";
      let deviceType: "web" | "mobile" | "tablet" = "web";
      let browser = "unknown";
      let os = "unknown";

      if (userAgent.includes("Mobile")) deviceType = "mobile";
      else if (userAgent.includes("Tablet")) deviceType = "tablet";
      if (userAgent.includes("Chrome")) browser = "Chrome";
      else if (userAgent.includes("Safari")) browser = "Safari";
      else if (userAgent.includes("Firefox")) browser = "Firefox";
      else if (userAgent.includes("Edge")) browser = "Edge";
      if (userAgent.includes("Windows")) os = "Windows";
      else if (userAgent.includes("Mac")) os = "Mac";
      else if (userAgent.includes("Linux")) os = "Linux";
      else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
      else if (userAgent.includes("Android")) os = "Android";

      const deviceId = "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      await prisma.userdevice.create({
        data: {
          id: deviceId,
          userId: user.id,
          deviceName: `${browser} on ${os}`,
          deviceType,
          browser,
          os,
          ipAddress: clientIP,
          isCurrent: true,
        },
      });
    } catch (deviceError) {
      console.error("[异地登录确认] 创建设备记录失败:", deviceError);
    }

    // 创建响应
    const response = NextResponse.json({
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
        sessionToken,
      },
      redirectUrl: "/",
    });

    // 设置Cookie：未勾选“记住我”时不写 maxAge，浏览器关闭即失效（场景24）
    const persistentMaxAge = rememberMe ? 7 * 24 * 60 * 60 : undefined;

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: persistentMaxAge,
    });

    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: persistentMaxAge,
    });

    if (refreshToken) {
      response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    console.log(`[异地登录确认] 用户 ${userId} 异地登录验证通过，旧会话已被挤掉`);

    return response;
  } catch (error) {
    console.error("[API /auth/confirm-crossregion-login] 异地登录确认失败:", error);
    return NextResponse.json({ error: "确认失败" }, { status: 500 });
  }
}
