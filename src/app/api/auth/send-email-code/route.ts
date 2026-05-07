import { NextRequest, NextResponse } from "next/server";

// TODO: 实现邮箱验证码发送逻辑
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: "请输入正确的邮箱地址" },
        { status: 400 }
      );
    }

    // TODO: 生成并发送邮箱验证码
    // const code = generateEmailCode();
    // await sendEmail(email, code);

    return NextResponse.json({
      success: true,
      message: "验证码已发送到邮箱",
    });
  } catch (error) {
    console.error("Send email code error:", error);
    return NextResponse.json(
      { message: "发送失败" },
      { status: 500 }
    );
  }
}
