import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function GET(request: NextRequest) {
  // 检查 prisma 客户端是否可用
  if (!prisma) {
    console.error("Prisma client is not initialized in /api/auth/me");
    return NextResponse.json(
      {
        message: "数据库连接失败",
        error: "Prisma client is not initialized",
      },
      { status: 500 },
    );
  }

  // 从 Cookie 中获取 token
  let token = request.cookies.get("auth_token")?.value;

  // 如果 Cookie 中没有，尝试从 Authorization header 获取（支持 localStorage 方案）
  if (!token) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: "请先登录", message: "未登录" },
      { status: 401 },
    );
  }

  // 验证 token
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 从数据库获取用户信息（包含会话状态）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        status: true,
        lastLoginAt: true,
        lastForcedLogoutAt: true,
        sessionToken: true,
        sessionExpiresAt: true,
      },
    });

      if (!user) {
        return NextResponse.json(
          { error: "用户不存在", message: "用户不存在" },
          { status: 404 },
        );
      }

      // 检查用户是否被强制下线
      if (user.lastForcedLogoutAt) {
        const now = new Date().getTime();
        const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
        const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60; // 分钟

        // 2 分钟宽限期：被强制下线后 2 分钟内仍然允许访问
        if (timeSinceForcedLogout >= 2) {
          return NextResponse.json(
            {
              error: "FORCED_LOGOUT",
              message: "您已被管理员强制下线，请重新登录",
            },
            { status: 401 },
          );
        }
      }

      // 检查用户状态
      if (user.status !== "active") {
        return NextResponse.json(
          {
            error: "ACCOUNT_DISABLED",
            message: "您的账号状态异常，请联系管理员",
          },
          { status: 403 },
        );
      }

      // 检查是否超过 5 分钟未操作（300 秒）
      // 注意：这个检查需要结合 sessionToken 和 sessionExpiresAt
      // 如果会话未过期，即使用户超过 5 分钟未操作，也允许访问
      const now = Date.now();
      const sessionExpired = user.sessionExpiresAt 
        ? new Date(user.sessionExpiresAt).getTime() < now
        : true;
      
      if (sessionExpired) {
        // 会话已过期，需要重新登录
        return NextResponse.json(
          { error: "SESSION_EXPIRED", message: "会话已过期，请重新登录" },
          { status: 401 },
        );
      }
      
      // 会话未过期，检查用户是否被强制下线
      if (user.lastForcedLogoutAt) {
        const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
        const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60; // 分钟
        
        // 如果被强制下线且超过 2 分钟，需要重新登录
        if (timeSinceForcedLogout >= 2) {
          return NextResponse.json(
            {
              error: "FORCED_LOGOUT",
              message: "您已被管理员强制下线，请重新登录",
            },
            { status: 401 },
          );
        }
      }

    // 返回用户信息
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
      sessionToken: user.sessionToken,
      sessionExpiresAt: user.sessionExpiresAt,
    });
  } catch (error) {
    console.error("Token 验证失败:", error);
    return NextResponse.json(
      {
        message: "Token 无效",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 401 },
    );
  }
}
