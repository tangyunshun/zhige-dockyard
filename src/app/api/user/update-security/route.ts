import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const {
      phone,
      email,
      currentPassword,
      newPassword,
      twoFactorEnabled,
    } = await req.json();

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const updateData: any = {};

    // 验证当前密码（如果需要修改密码）
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "请输入当前密码" },
          { status: 400 }
        );
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return NextResponse.json(
          { error: "当前密码错误" },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "新密码长度不能少于 6 位" },
          { status: 400 }
        );
      }

      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // 更新手机号
    if (phone !== undefined && phone !== user.phone) {
      if (phone) {
        const phoneExists = await prisma.user.findUnique({
          where: { phone },
        });
        if (phoneExists) {
          return NextResponse.json(
            { error: "手机号已被使用" },
            { status: 400 }
          );
        }
      }
      updateData.phone = phone;
    }

    // 更新邮箱
    if (email !== undefined && email !== user.email) {
      if (email) {
        const emailExists = await prisma.user.findUnique({
          where: { email },
        });
        if (emailExists) {
          return NextResponse.json(
            { error: "邮箱已被使用" },
            { status: 400 }
          );
        }
      }
      updateData.email = email;
    }

    // 更新双因素认证
    if (twoFactorEnabled !== undefined) {
      updateData.twoFactorEnabled = twoFactorEnabled;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "安全设置已更新",
    });
  } catch (error) {
    console.error("更新安全设置失败:", error);
    return NextResponse.json(
      { error: "更新失败，请稍后重试" },
      { status: 500 }
    );
  }
}
