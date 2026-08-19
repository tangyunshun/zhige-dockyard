﻿import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * 发送邮箱验证码（用于找回密码等场景）
 * 当前为开发环境模拟实现：日志输出 + 返回 devCode。
 * 生产环境应接入真实邮件服务商。
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: "请输入正确的邮箱地址" },
        { status: 400 }
      );
    }

    // 校验邮箱是否对应真实用户（仅允许已注册邮箱发起找回密码）
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { message: "该邮箱未注册" },
        { status: 404 }
      );
    }

    // 生成 6 位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // 复用 sms-store 的内存结构存储邮箱验证码（key=邮箱），含限流
    const { storeSmsCode } = await import("@/lib/sms-store");
    const sendResult = storeSmsCode(email, code);
    if (!sendResult.ok) {
      return NextResponse.json(
        { message: sendResult.error || "发送失败" },
        { status: 429 }
      );
    }

    // TODO: 接入真实邮件服务商
    console.log(`[邮箱验证码] 发送到 ${email}: ${code}（5分钟内有效）`);

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      devCode: process.env.NODE_ENV === "development" ? code : undefined,
    });
  } catch (error) {
    console.error("Send email code error:", error);
    return NextResponse.json(
      { message: "发送失败" },
      { status: 500 }
    );
  }
}
