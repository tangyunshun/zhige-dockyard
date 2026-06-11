﻿import { NextRequest, NextResponse } from "next/server";
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

    if (!result.valid) {
      return NextResponse.json(
        { message: result.error || "验证码错误" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "验证码正确",
    });
  } catch (error) {
    console.error("Verify SMS code error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 }
    );
  }
}
