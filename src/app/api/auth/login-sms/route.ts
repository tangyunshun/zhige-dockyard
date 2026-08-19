import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { verifySmsCode, deleteSmsCode } from "@/lib/sms-store";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";
import { maybeFinalizeDeletionIfDue } from "@/lib/account-deletion";

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

    // D-02：账号注销冷静期——允许重新登录以便撤销注销（与密码登录行为一致）
    if (user.status === "deleting") {
      // 冷静期已过则执行最终注销，不再允许撤销
      const deletionFinalized = await maybeFinalizeDeletionIfDue(user.id);
      if (deletionFinalized) {
        return NextResponse.json(
          { error: "账号注销冷静期已过，账号已被永久注销", status: "deleted" },
          { status: 403 },
        );
      }

      const now = new Date();
      // 刷新活跃时间，避免撤销流程中的 /api/auth/me 被空闲超时拦截
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, lastActivityAt: now },
      });

      // 消耗验证码，防止重复使用
      deleteSmsCode(phone);

      const deletionEnd = user.deletionRequestedAt
        ? new Date(user.deletionRequestedAt).getTime()
        : Date.now();
      const remainingDays = Math.max(
        0,
        Math.ceil((deletionEnd - Date.now()) / (1000 * 60 * 60 * 24)),
      );

      // 生成临时 token，仅允许撤销注销（不授予业务会话）
      const token = await new SignJWT({
        userId: user.id,
        email: user.email,
        role: user.role,
        deletionStatus: "cancelling",
        issuedAt: now.toISOString(),
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(JWT_SECRET);

      const response = NextResponse.json({
        success: true,
        message: `账号正在注销中，${remainingDays}天后正式生效，可撤销注销`,
        status: user.status,
        deletionDaysRemaining: remainingDays,
        canCancelDeletion: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });

      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60,
        path: "/",
      });
      response.cookies.set("userId", user.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60,
        path: "/",
      });

      return response;
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

    // 生成 session 与 刷新令牌
    const now = new Date();
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30天
      : new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2小时

    const refreshToken = crypto.randomUUID();
    const refreshTokenExpiresAt = rememberMe
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 检查是否存在活跃的旧会话（挤线检测）
    const hasExistingSession = user.sessionToken && user.sessionExpiresAt && new Date(user.sessionExpiresAt) > now;

    // 记录审计日志
    if (hasExistingSession) {
      await prisma.operationlog.create({
        data: {
          id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
          userId: user.id,
          action: "SESSION_CONFLICT_LOGOUT",
          resource: "auth/session",
          ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
          details: JSON.stringify({
            message: "短信验证登录挤退旧会话",
            oldSessionToken: user.sessionToken,
            newSessionToken: sessionToken,
          }),
        },
      });
      console.log(`[挤线检测] 短信登录：用户 ${user.id} 的旧会话已被挤掉`);
    }

    // 内存踢除并注册新 session
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === user.id) {
        sessionCache.delete(key);
      }
    }
    sessionCache.set(sessionToken, {
      userId: user.id,
      expiresAt: sessionExpiresAt,
    });

    // 删除验证码
    deleteSmsCode(phone);

    // 更新用户信息
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now,
        loginAttempts: 0,
        lockedUntil: null,
        lastForcedLogoutAt: hasExistingSession ? now : null,
        sessionToken,
        sessionExpiresAt,
        refreshToken,
        refreshTokenExpiresAt,
      },
    });

    // 生成 JWT Token，写入 sessionToken 和 issuedAt 签发时刻以对齐网关
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
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
    // auth_token
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
      path: '/',
    });

    // session_token
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
      path: '/',
    });

    // refresh_token
    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
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
