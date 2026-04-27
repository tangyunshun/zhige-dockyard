import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { phone, username, email, smsCode, password, accountType } =
      await request.json();

    // 根据账号类型验证
    if (accountType === "phone") {
      // 手机号注册
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "手机号格式不正确" },
          { status: 400 },
        );
      }

      // 验证验证码
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
        return NextResponse.json(
          { message: "该手机号已注册" },
          { status: 400 },
        );
      }

      // 哈希密码
      const hashedPassword = await hashPassword(password);

      // 插入数据
      const result = await prisma.$executeRaw`
        INSERT INTO user (id, phone, password, name, role, createdAt, updatedAt)
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
          email: true,
          role: true,
        },
      });

      if (!user) {
        return NextResponse.json({ message: "注册失败" }, { status: 500 });
      }

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
              "用户名格式不正确，支持 3-20 位字母、数字、@、#、-、下划线",
          },
          { status: 400 },
        );
      }

      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "绑定手机号格式不正确" },
          { status: 400 },
        );
      }

      // 验证验证码
      if (!smsCode || smsCode.length !== 6) {
        return NextResponse.json(
          { message: "验证码格式不正确" },
          { status: 400 },
        );
      }

      // 检查用户名是否已存在
      const existingUserByUsername = await prisma.user.findFirst({
        where: { name: username },
      });

      if (existingUserByUsername) {
        return NextResponse.json(
          { message: "该用户名已存在" },
          { status: 400 },
        );
      }

      // 检查手机号是否已注册
      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUserByPhone) {
        return NextResponse.json(
          { message: "该手机号已被注册" },
          { status: 400 },
        );
      }

      // 哈希密码
      const hashedPassword = await hashPassword(password);

      // 插入数据
      const result = await prisma.$executeRaw`
        INSERT INTO user (id, phone, password, name, role, createdAt, updatedAt)
        VALUES (UUID(), ${phone}, ${hashedPassword}, ${username}, 'user', NOW(), NOW())
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
          email: true,
          role: true,
        },
      });

      if (!user) {
        return NextResponse.json({ message: "注册失败" }, { status: 500 });
      }

      // 自动创建个人空间
      const workspaceName = `个人空间 - ${user.name || user.phone}`;
      const workspace = await prisma.workspace.create({
        data: {
          name: workspaceName,
          type: "PERSONAL",
          ownerId: user.id,
          description: `${user.name || "用户"}的个人工作空间`,
        },
      });

      // 创建 WorkspaceMember 记录
      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: "OWNER",
        },
      });

      // 更新用户的 lastWorkspaceId
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastWorkspaceId: workspace.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "注册成功，请登录",
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type,
        },
        redirectUrl: "/auth/login",
      });
    } else if (accountType === "email") {
      // 邮箱注册
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { message: "邮箱格式不正确" },
          { status: 400 },
        );
      }

      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { message: "绑定手机号格式不正确" },
          { status: 400 },
        );
      }

      // 验证验证码
      if (!smsCode || smsCode.length !== 6) {
        return NextResponse.json(
          { message: "验证码格式不正确" },
          { status: 400 },
        );
      }

      // 检查邮箱是否已存在
      const existingUserByEmail = await prisma.user.findFirst({
        where: { email },
      });

      if (existingUserByEmail) {
        return NextResponse.json({ message: "该邮箱已存在" }, { status: 400 });
      }

      // 检查手机号是否已注册
      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone },
      });

      if (existingUserByPhone) {
        return NextResponse.json(
          { message: "该手机号已被注册" },
          { status: 400 },
        );
      }

      // 哈希密码
      const hashedPassword = await hashPassword(password);

      // 插入数据
      const result = await prisma.$executeRaw`
        INSERT INTO user (id, phone, password, name, email, role, createdAt, updatedAt)
        VALUES (UUID(), ${phone}, ${hashedPassword}, ${email.split("@")[0]}, ${email}, 'user', NOW(), NOW())
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
          email: true,
          role: true,
        },
      });

      if (!user) {
        return NextResponse.json({ message: "注册失败" }, { status: 500 });
      }

      // 自动创建个人空间
      const workspaceName = `个人空间 - ${user.name || user.phone}`;
      const workspace = await prisma.workspace.create({
        data: {
          name: workspaceName,
          type: "PERSONAL",
          ownerId: user.id,
          description: `${user.name || "用户"}的个人工作空间`,
        },
      });

      // 创建 WorkspaceMember 记录
      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: "OWNER",
        },
      });

      // 更新用户的 lastWorkspaceId
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastWorkspaceId: workspace.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "注册成功，请登录",
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type,
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
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
