import { NextRequest, NextResponse } from "next/server";
import { verifySmsCode, consumeSmsCode } from "@/lib/sms-store";
import { SignJWT } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-config";
import type { VerifyPurpose } from "@/lib/verification-backend";

/**
 * 验证短信验证码（用于找回密码等场景）
 * 验证通过后下发一次性 resetToken（5 分钟有效），前端凭该 token 调用 /api/auth/reset-password 完成改密。
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();
    // 本接口专用于找回密码：只接受并签发 reset-password 用途的凭证，
    // 注册/登录/绑定验证码不能在此换取改密 token（用途严格隔离）。
    const type: VerifyPurpose = "reset-password";

    if (!phone || !code) {
      return NextResponse.json(
        { message: "缺少手机号或验证码" },
        { status: 400 }
      );
    }

    // 校验验证码（不立即消费，由 reset-password 接口消费，避免验证与改密之间 token 丢失）
    const result = await verifySmsCode(phone, code, type);
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
      .sign(getJwtSecretKey());

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
