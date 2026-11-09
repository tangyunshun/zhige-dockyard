import { NextRequest, NextResponse } from "next/server";
import { verifyEmailCode } from "@/lib/email-code-store";
import { SignJWT } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-config";

/**
 * 验证邮箱验证码（用于注册校验与找回密码等场景）。
 *
 * - 注册场景：仅做校验，由调用方（register 接口）在创建账号成功后删除验证码；
 * - 找回密码场景：验证通过后下发一次性 resetToken（5 分钟有效），前端凭该 token
 *   调用 /api/auth/reset-password 完成改密（与 verify-sms-code 完全对称）。
 *
 * 注意：注册与找回密码共用本接口做“校验”，但注册不在本接口消费验证码，
 * 而是交由 register 接口在账号创建成功后 deleteEmailCode，避免注册中途失败导致验证码失效。
 * 找回密码则在 reset-password 接口中 consumeEmailCode（一次性使用）。
 */
export async function POST(request: NextRequest) {
  try {
    const { email, code, type = "reset-password" } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: "缺少邮箱或验证码" },
        { status: 400 },
      );
    }

    // 校验验证码（注册场景不立即消费，避免验证与落库之间 token 丢失）
    const result = await verifyEmailCode(email, code, type as any);
    if (!result.valid) {
      return NextResponse.json(
        { message: result.error || "验证码错误" },
        { status: 400 },
      );
    }

    // 找回密码场景：下发一次性 resetToken
    if (type === "reset-password" || type === "reset-password-email") {
      const resetToken = await new SignJWT({ email, purpose: "reset_password" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("5m")
        .sign(getJwtSecretKey());

      return NextResponse.json({
        success: true,
        message: "验证码正确",
        resetToken,
      });
    }

    // 注册场景：仅返回校验通过
    return NextResponse.json({
      success: true,
      message: "验证码正确",
    });
  } catch (error) {
    console.error("Verify email code error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 },
    );
  }
}
