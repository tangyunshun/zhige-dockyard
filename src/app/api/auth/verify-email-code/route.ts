﻿import { NextRequest, NextResponse } from "next/server";
import { verifySmsCode } from "@/lib/sms-store";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * 验证邮箱验证码（用于找回密码等场景）
 * 验证通过后下发一次性 resetToken（5 分钟有效），与 verify-sms-code 行为一致。
 */
export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: "缺少邮箱或验证码" },
        { status: 400 }
      );
    }

    // 复用 sms-store 校验邮箱验证码（key=邮箱）
    const result = verifySmsCode(email, code);
    if (!result.valid) {
      return NextResponse.json(
        { message: result.error || "验证码错误" },
        { status: 400 }
      );
    }

    // 下发一次性 resetToken
    const resetToken = await new SignJWT({ email, purpose: "reset_password" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(JWT_SECRET);

    return NextResponse.json({
      success: true,
      message: "验证码正确",
      resetToken,
    });
  } catch (error) {
    console.error("Verify email code error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 }
    );
  }
}
