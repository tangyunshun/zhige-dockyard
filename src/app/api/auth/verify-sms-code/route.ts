﻿import { NextRequest, NextResponse } from "next/server";
import { verifySmsCode, consumeSmsCode } from "@/lib/sms-store";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * 验证短信验证码（用于找回密码等场景）
 * 验证通过后下发一次性 resetToken（5 分钟有效），前端凭该 token 调用 /api/auth/reset-password 完成改密。
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, code, type = "reset-password" } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { message: "缺少手机号或验证码" },
        { status: 400 }
      );
    }

    // 校验验证码（不立即消费，由 reset-password 接口消费，避免验证与改密之间 token 丢失）
    const result = verifySmsCode(phone, code);
    if (!result.valid) {
      return NextResponse.json(
        { message: result.error || "验证码错误" },
        { status: 400 }
      );
    }

    // 下发一次性 resetToken
    const resetToken = await new SignJWT({ phone, purpose: "reset_password" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(JWT_SECRET);

    return NextResponse.json({
      success: true,
      message: "验证码正确",
      resetToken,
    });
  } catch (error) {
    console.error("Verify SMS code error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 }
    );
  }
}
