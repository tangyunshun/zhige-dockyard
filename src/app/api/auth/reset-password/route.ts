import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { account, smsCode, password } = await request.json();

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { phone: account }],
      },
    });

    if (!user) {
      return NextResponse.json({ message: "账号不存在" }, { status: 404 });
    }

    // TODO: 验证验证码（生产环境需要验证）
    if (!smsCode || smsCode.length !== 6) {
      return NextResponse.json(
        { message: "验证码格式不正确" },
        { status: 400 },
      );
    }

    // 哈希新密码
    const hashedPassword = await hashPassword(password);

    // 更新密码
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "密码重置成功",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
