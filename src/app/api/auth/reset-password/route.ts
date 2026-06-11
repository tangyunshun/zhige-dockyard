﻿import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { account, newPassword } = await request.json();

    if (!account || !newPassword) {
      return NextResponse.json(
        { message: "缺少账号或新密码" },
        { status: 400 }
      );
    }

    // 验证密码长度
    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 查找用户
    let user;
    const isPhone = /^1[3-9]\d{9}$/.test(account);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account);

    if (isPhone) {
      user = await prisma.user.findUnique({
        where: { phone: account },
      });
    } else if (isEmail) {
      user = await prisma.user.findUnique({
        where: { email: account },
      });
    } else {
      // 用户名
      user = await prisma.user.findFirst({
        where: { name: account },
      });
    }

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 }
      );
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 更新密码
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    return NextResponse.json({
      success: true,
      message: "密码重置成功",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
