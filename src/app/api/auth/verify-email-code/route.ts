import { NextRequest, NextResponse } from "next/server";

// TODO: 实现邮箱验证码验证逻辑
export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: "缺少邮箱或验证码" },
        { status: 400 }
      );
    }

    // TODO: 实现验证码验证逻辑
    // const result = verifyEmailCode(email, code);

    return NextResponse.json({
      success: true,
      message: "验证码正确",
    });
  } catch (error) {
    console.error("Verify email code error:", error);
    return NextResponse.json(
      { message: "验证失败" },
      { status: 500 }
    );
  }
}
