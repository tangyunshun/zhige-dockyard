﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json({ message: "账号不能为空" }, { status: 400 });
    }

    // 查找用户（支持邮箱、手机号、账号名）
    // 使用 Prisma 的 raw 查询来实现真正的大小写敏感匹配
    const users = await prisma.$queryRaw`SELECT id, email, phone, name, status, loginAttempts, lockedUntil FROM User WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}`;
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      return NextResponse.json({
        exists: false,
        message: "该账号未注册",
      });
    }

    // 检查账号状态：先处理deleted，因为已注销账号不应该显示为"存在"
    if (user.status === "deleted") {
      return NextResponse.json({
        exists: false, // 已注销账号，视为不存在
        message: "该账号未注册",
      });
    }

    // 检查是否被永久封禁
    if (user.status === "banned") {
      return NextResponse.json({
        exists: true,
        status: "banned",
        message: "该账号已被永久封禁",
      });
    }

    // 检查是否被禁用
    if (user.status === "inactive") {
      return NextResponse.json({
        exists: true,
        status: "disabled",
        message: "账号已被禁用，请联系管理员",
      });
    }

    // 检查是否正在注销中
    if (user.status === "deleting") {
      return NextResponse.json({
        exists: true,
        status: "deleting",
        message: "账号正在注销中",
      });
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json({
        exists: true,
        status: "locked",
        lockedUntil: user.lockedUntil.toISOString(),
        minutesRemaining: minutes,
        message: "账号已锁定，" + minutes + "分钟后再试",
      });
    }

    return NextResponse.json({
      exists: true,
      status: "active",
      message: "账号存在",
    });
  } catch (error) {
    console.error("Check account error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
