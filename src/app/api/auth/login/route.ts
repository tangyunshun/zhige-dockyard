import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { account, password, rememberMe } = await request.json();

    // 查找用户（支持邮箱/手机号/账号）
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { phone: account }, { name: account }],
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: "账号或密码错误",
          accountExists: false,
          remainingAttempts: 5,
        },
        { status: 401 },
      );
    }

    // 检查账号状态
    if (user.status !== "active") {
      let statusMessage = "账号状态异常";
      let statusCode = 403;
      
      if (user.status === "inactive") {
        statusMessage = "账号未激活，请先验证邮箱或手机号";
        statusCode = 403;
      } else if (user.status === "banned") {
        statusMessage = "账号已被封禁，无法登录";
        statusCode = 403;
      } else if (user.status === "deleted") {
        statusMessage = "账号已被注销";
        statusCode = 403;
      }
      
      return NextResponse.json(
        {
          message: statusMessage,
          accountExists: true,
          status: user.status,
        },
        { status: statusCode },
      );
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        {
          message: `账号已锁定，请${minutes}分钟后再试`,
          accountExists: true,
          lockedUntil: user.lockedUntil.toISOString(),
          minutesRemaining: minutes,
        },
        { status: 423 },
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      // 增加失败次数
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= 5) {
        // 锁定 5 分钟
        const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil,
          },
        });

        return NextResponse.json(
          {
            message: "密码错误次数过多，账号已锁定 5 分钟",
            accountExists: true,
            lockedUntil: lockedUntil.toISOString(),
            remainingAttempts: 0,
          },
          { status: 423 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      return NextResponse.json(
        {
          message: `账号或密码错误（剩余${5 - newAttempts}次尝试机会）`,
          accountExists: true,
          remainingAttempts: 5 - newAttempts,
        },
        { status: 401 },
      );
    }

    // 登录成功，重置失败次数并记录登录历史
    const now = new Date();

    // 生成会话令牌（用于强制下线检查）
    const sessionToken = `sess_${user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 天
      : new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 小时（但 cookie 是 session 的，关闭浏览器就失效）

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        lastForcedLogoutAt: null, // 清除强制下线记录，重新计算在线状态
        sessionToken,
        sessionExpiresAt,
      },
    });

    // 记录登录历史
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        loginAt: now,
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // 检查用户是否有个人空间，如果没有则创建
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            description: true,
            logo: true,
          },
        },
      },
    });

    // 查找是否有个人空间
    const personalWorkspace = workspaceMembers.find(
      (member) => member.workspace.type === "PERSONAL",
    );

    // 如果没有个人空间，自动创建一个
    if (!personalWorkspace) {
      const workspaceName = `个人空间 - ${user.name || user.phone || user.email}`;
      const newWorkspace = await prisma.workspace.create({
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
          workspaceId: newWorkspace.id,
          role: "OWNER",
        },
      });

      // 更新用户的 lastWorkspaceId
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastWorkspaceId: newWorkspace.id,
        },
      });

      // 刷新 workspaceMembers 列表
      workspaceMembers.push({
        id: newWorkspace.id,
        userId: user.id,
        workspaceId: newWorkspace.id,
        role: "OWNER",
        joinedAt: new Date(),
        workspace: {
          id: newWorkspace.id,
          name: workspaceName,
          type: "PERSONAL",
          ownerId: user.id,
          description: `${user.name || "用户"}的个人工作空间`,
          logo: null,
        },
      });
    }

    const workspaces = workspaceMembers.map((member) => ({
      id: member.id,
      userId: member.userId,
      workspaceId: member.workspaceId,
      role: member.role,
      workspace: member.workspace,
    }));

    // 如果用户没有任何工作空间，自动创建一个个人空间
    if (workspaceMembers.length === 0) {
      const personalWorkspace = await prisma.workspace.create({
        data: {
          name: `${user.name || user.email || "个人空间"}`,
          type: "PERSONAL",
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });

      // 更新用户的 lastWorkspaceId
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastWorkspaceId: personalWorkspace.id,
        },
      });

      workspaces.push({
        id: personalWorkspace.id,
        userId: user.id,
        workspaceId: personalWorkspace.id,
        role: "OWNER",
        workspace: personalWorkspace,
      });
    }

    // 获取用户的 lastWorkspaceId
    const lastWorkspaceId = user.lastWorkspaceId;

    // 计算建议的重定向 URL
    let redirectUrl = "/workspace-hub";
    if (
      lastWorkspaceId &&
      workspaceMembers.some((m) => m.workspaceId === lastWorkspaceId)
    ) {
      redirectUrl = `/dashboard?wid=${lastWorkspaceId}`;
    } else if (workspaceMembers.length > 0) {
      // 如果有工作空间，直接进入 workspace-hub 或最后一个工作空间
      redirectUrl = "/workspace-hub";
    }

    // 生成 JWT Token
    const expiresIn = rememberMe ? "7d" : "24h";
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);

    // 生成 Refresh Token（仅当记住我时）
    let refreshToken = null;
    if (rememberMe) {
      refreshToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(JWT_SECRET);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });
    }

    // 设置 Cookie
    const response = NextResponse.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        sessionToken, // 返回会话令牌用于前端存储
      },
      workspaces,
      lastWorkspaceId,
      redirectUrl,
    });

    // 设置 auth_token cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60, // 记住我：7 天，不记住我：24 小时
    };

    response.cookies.set("auth_token", token, cookieOptions);

    if (refreshToken) {
      response.cookies.set("refresh_token", refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60, // 30 天
      });
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
