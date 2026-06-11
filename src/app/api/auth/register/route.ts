﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { verifySmsCode, deleteSmsCode } from "@/lib/sms-store";

export async function POST(request: NextRequest) {
  try {
    const { phone, username, email, smsCode, password, accountType } =
      await request.json();

    // 手机号注册
    if (accountType === "phone") {
      // 验证手机号
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "请输入正确的手机号" },
          { status: 400 },
        );
      }

      // 验证验证码
      if (!smsCode || smsCode.length !== 6) {
        return NextResponse.json(
          { message: "请输入正确的验证码" },
          { status: 400 },
        );
      }

      // 验证验证码
      const smsVerification = verifySmsCode(phone, smsCode);
      if (!smsVerification.valid) {
        return NextResponse.json(
          { 
            message: smsVerification.error === "请先获取验证码" 
              ? "验证码已失效，请重新获取" 
              : smsVerification.error || "验证码错误",
            field: "smsCode"
          },
          { status: 400 },
        );
      }

      // 检查用户是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUser) {
        return NextResponse.json(
          { message: "该手机号已注册" },
          { status: 400 },
        );
      }

      // 加密密码
      const hashedPassword = await hashPassword(password);

      // 使用 Prisma 创建用户
      const user = await prisma.user.create({
        data: {
          phone,
          password: hashedPassword,
          name: `用户${phone.slice(-4)}`, // 用户名为手机号后 4 位
          role: "user",
          status: "active",
        },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          role: true,
        },
      });

      // 删除验证码
      deleteSmsCode(phone);

      return NextResponse.json({
        success: true,
        message: "注册成功，请登录",
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
        },
        redirectUrl: "/auth/login",
      });
    } else if (accountType === "username") {
      // 用户名注册
      if (!username || !/^[a-zA-Z0-9_@#\-]{3,20}$/.test(username)) {
        return NextResponse.json(
          {
            message:
              "用户名格式不正确，请使用 3-20 位字母、数字或特殊字符",
          },
          { status: 400 },
        );
      }

      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "请输入正确的手机号" },
          { status: 400 },
        );
      }

      // 验证验证码
      if (!smsCode || smsCode.length !== 6) {
        return NextResponse.json(
          { message: "请输入正确的验证码" },
          { status: 400 },
        );
      }

      // 验证验证码
      const smsVerification = verifySmsCode(phone, smsCode);
      if (!smsVerification.valid) {
        return NextResponse.json(
          { 
            message: smsVerification.error || "验证码错误",
            field: "smsCode"
          },
          { status: 400 },
        );
      }

      // 检查用户名是否已存在
      const existingUserByUsername = await prisma.user.findFirst({
        where: { name: username },
      });

      if (existingUserByUsername) {
        return NextResponse.json(
          { message: "用户名已存在" },
          { status: 400 },
        );
      }

      // 检查手机号是否已存在
      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUserByPhone) {
        return NextResponse.json(
          { message: "该手机号已注册" },
          { status: 400 },
        );
      }

      // 加密密码
      const hashedPassword = await hashPassword(password);

      // 使用 Prisma 创建用户
      const user = await prisma.user.create({
        data: {
          phone,
          password: hashedPassword,
          name: username,
          role: "user",
          status: "active",
        },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          role: true,
        },
      });

      // 删除验证码
      deleteSmsCode(phone);

      return NextResponse.json({
        success: true,
        message: "注册成功，请登录",
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
        },
        redirectUrl: "/auth/login",
      });
    } else if (accountType === "email") {
      // 邮箱注册
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { message: "请输入正确的邮箱地址" },
          { status: 400 },
        );
      }

      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "请输入正确的手机号" },
          { status: 400 },
        );
      }

      // 验证验证码
      if (!smsCode || smsCode.length !== 6) {
        return NextResponse.json(
          { message: "请输入正确的验证码" },
          { status: 400 },
        );
      }

      // 验证验证码
      const smsVerification = verifySmsCode(phone, smsCode);
      if (!smsVerification.valid) {
        return NextResponse.json(
          { 
            message: smsVerification.error || "验证码错误",
            field: "smsCode"
          },
          { status: 400 },
        );
      }

      // 检查邮箱是否已存在
      const existingUserByEmail = await prisma.user.findFirst({
        where: { email },
      });

      if (existingUserByEmail) {
        return NextResponse.json({ message: "邮箱已被注册" }, { status: 400 });
      }

      // 检查手机号是否已存在
      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUserByPhone) {
        return NextResponse.json(
          { message: "该手机号已注册" },
          { status: 400 },
        );
      }

      // 加密密码
      const hashedPassword = await hashPassword(password);

      // 使用 Prisma 创建用户
      const user = await prisma.user.create({
        data: {
          phone,
          password: hashedPassword,
          name: email.split("@")[0], // 用户名为邮箱前缀
          email,
          role: "user",
          status: "active",
        },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          role: true,
        },
      });

      // 删除验证码
      deleteSmsCode(phone);

      return NextResponse.json({
        success: true,
        message: "注册成功，请登录",
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
        },
        redirectUrl: "/auth/login",
      });
    } else {
      return NextResponse.json(
        { message: "不支持的注册方式" },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "服务器内部错误" }, { status: 500 });
  }
}
