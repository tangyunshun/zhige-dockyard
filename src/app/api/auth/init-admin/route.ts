import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { name, email, phone, password } = await request.json();

    // 验证系统是否已经初始化
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { message: "系统已初始化，无法创建创世管理员" },
        { status: 400 },
      );
    }

    // 验证密码强度
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          message: "密码强度不足",
          error: passwordValidation.error,
        },
        { status: 400 },
      );
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return NextResponse.json(
          { message: "该邮箱已被使用" },
          { status: 400 },
        );
      }
    }

    // 检查手机号是否已存在
    if (phone) {
      const existingUser = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUser) {
        return NextResponse.json(
          { message: "该手机号已被使用" },
          { status: 400 },
        );
      }
    }

    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 使用 executeRaw 插入数据以绕过类型检查
    const result = await prisma.$executeRaw`
      INSERT INTO user (id, name, email, phone, password, role, created_at, updated_at)
      VALUES (UUID(), ${name}, ${email}, ${phone}, ${hashedPassword}, 'SUPER_ADMIN', NOW(), NOW())
    `;

    if (result < 0) {
      throw new Error("Failed to create user");
    }

    // 获取创建的用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: email || undefined }, { phone: phone || undefined }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new Error("Failed to retrieve created user");
    }

    // 不返回敏感信息
    return NextResponse.json({
      success: true,
      message: "创世管理员创建成功",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Init admin error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
