import { NextRequest, NextResponse } from "next/server";
import { generateSmsCode, storeSmsCode } from "@/lib/sms-store";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: "请输入正确的手机号" },
        { status: 400 }
      );
    }

    // 生成验证码
    const code = generateSmsCode();

    // 存储验证码
    storeSmsCode(phone, code);

    // TODO: 发送短信
    console.log(`发送短信验证码到 ${phone}: ${code}`);

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      debugCode: process.env.NODE_ENV === "development" ? code : undefined,
    });
  } catch (error) {
    console.error("Send SMS error:", error);
    return NextResponse.json(
      { message: "发送失败" },
      { status: 500 }
    );
  }
}
