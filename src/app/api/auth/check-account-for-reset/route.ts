﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { account, accountType } = await request.json();

    if (!account) {
      return NextResponse.json({ message: "账号不能为空" }, { status: 400 });
    }

    // 查找用户（支持邮箱、手机号、用户名）
    const users = (await prisma.$queryRaw`SELECT id, email, phone, name, status FROM User WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}`) as any[];
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      return NextResponse.json({ message: "该账号未注册" }, { status: 404 });
    }

    // 已注销 / 封禁 / 禁用 / 注销中 / 锁定 等状态复用 check-account 的语义
    if (user.status === "deleted") {
      return NextResponse.json({ message: "该账号未注册" }, { status: 404 });
    }
    if (user.status === "banned") {
      return NextResponse.json({ message: "该账号已被永久封禁" }, { status: 403 });
    }
    if (user.status === "inactive") {
      return NextResponse.json({ message: "账号已被禁用，请联系管理员" }, { status: 403 });
    }

    const hasPhone = !!user.phone;
    const hasEmail = !!user.email;

    if (!hasPhone && !hasEmail) {
      return NextResponse.json({
        bindInfo: { hasPhone: false, hasEmail: false },
        message: "该账号未绑定手机号或邮箱",
      });
    }

    return NextResponse.json({
      bindInfo: {
        hasPhone,
        hasEmail,
        phone: user.phone || undefined,
        email: user.email || undefined,
      },
      message: "ok",
    });
  } catch (error) {
    console.error("Check account for reset error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
