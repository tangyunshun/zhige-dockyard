import { NextRequest, NextResponse } from "next/server";
import { verifySmsCode } from "@/lib/sms-store";

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { message: "缺少手机号或验证码" },
        { status: 400 }
      );
    }

    const result = verifySmsCode(phone, code);

    return NextResponse.json({
      valid: result.valid,
      message: result.error,
    });
  } catch (error) {
    console.error("Verify SMS error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 }
    );
  }
}
