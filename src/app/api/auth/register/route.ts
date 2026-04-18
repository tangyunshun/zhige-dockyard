import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { phone, smsCode, password } = await request.json();

    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: "手机号格式不正确" },
        { status: 400 },
      );
    }

    // TODO: 验证短信验证码（需要接入短信服务商）
    // 这里暂时跳过验证，生产环境需要调用短信服务商 API 验证
    if (!smsCode || smsCode.length !== 6) {
      return NextResponse.json(
        { message: "验证码格式不正确" },
        { status: 400 },
      );
    }

    // 检查手机号是否已注册
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      return NextResponse.json({ message: "该手机号已注册" }, { status: 400 });
    }

    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 使用 executeRaw 插入数据
    const result = await prisma.$executeRaw`
      INSERT INTO user (id, phone, password, name, role, created_at, updated_at)
      VALUES (UUID(), ${phone}, ${hashedPassword}, ${`用户${phone.slice(-4)}`}, 'user', NOW(), NOW())
    `;

    if (result < 0) {
      throw new Error("Failed to create user");
    }

    // 获取创建的用户
    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    });

    if (!user) {
      throw new Error("Failed to retrieve created user");
    }

    return NextResponse.json({
      success: true,
      message: "注册成功",
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
