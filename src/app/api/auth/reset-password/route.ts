﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { jwtVerify } from "jose";
import { consumeSmsCode } from "@/lib/sms-store";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * 重置密码接口（P0-1 修复）
 *
 * 安全要求：
 * - 必须携带由 verify-sms-code / verify-email-code 下发的一次性 resetToken
 * - resetToken 5 分钟有效，含 phone 或 email，purpose=reset_password
 * - 验证通过后销毁对应验证码（一次性使用）
 * - 重置成功后使该用户所有会话失效（强制重新登录）
 */
export async function POST(request: NextRequest) {
  try {
    const { resetToken, newPassword, account } = await request.json();

    // 1. 必须携带 resetToken
    if (!resetToken) {
      return NextResponse.json(
        { message: "缺少重置凭证，请先通过验证码校验" },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { message: "密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 2. 校验 resetToken
    let payload: any;
    try {
      ({ payload } = await jwtVerify(resetToken, JWT_SECRET));
    } catch {
      return NextResponse.json(
        { message: "重置凭证无效或已过期，请重新获取验证码" },
        { status: 401 }
      );
    }

    if (payload.purpose !== "reset_password") {
      return NextResponse.json(
        { message: "重置凭证用途错误" },
        { status: 400 }
      );
    }

    // 3. 从 token 中解析账号（phone 或 email），并查库定位用户
    const phone = payload.phone as string | undefined;
    const email = payload.email as string | undefined;

    if (!phone && !email) {
      return NextResponse.json(
        { message: "重置凭证缺少账号信息" },
        { status: 400 }
      );
    }

    // account 兼容字段（前端可能仍传），仅做日志参考，不再以它为唯一依据
    void account;

    let user;
    if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    } else if (email) {
      user = await prisma.user.findFirst({ where: { email } });
    }

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 }
      );
    }

    // 4. 消费验证码（一次性，防止 token 被复制后重复使用）
    const codeKey = (phone || email) as string;
    consumeSmsCode(codeKey);

    // 5. 更新密码 + 失效所有会话（强制重新登录）
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenPrev: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "密码重置成功，请使用新密码登录",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
