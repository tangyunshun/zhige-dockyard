import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function GET(request: NextRequest) {
  try {
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
        console.log("[/api/auth/me] 从 Authorization header 获取 token");
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "请先登录", message: "未登录" },
        { status: 401 },
      );
    }

    // 验证 token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 从数据库获取用户信息（包含会话状态）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: true,
        membershipLevel: true,
        status: true,
        sessionToken: true,
        sessionExpiresAt: true,
        lastForcedLogoutAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "用户不存在" }, { status: 404 });
    }

    // 检查用户状态
    if (user.status !== "active") {
      console.log(
        `[API /auth/me] ❌ 用户 ${userId} 状态为 ${user.status}，拒绝访问`,
      );
      return NextResponse.json(
        { error: "账号已被禁用", message: "账号已被禁用" },
        { status: 403 },
      );
    }

    // 检查会话是否过期
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) < new Date()) {
      console.log(`[API /auth/me] ❌ 用户 ${userId} 会话已过期，拒绝访问`);
      return NextResponse.json(
        { error: "会话已过期，请重新登录", message: "会话已过期" },
        { status: 401 },
      );
    }

    // 检查用户是否被强制下线
    if (user.lastForcedLogoutAt) {
      const now = new Date().getTime();
      const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
      const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60; // 分钟

      // 2 分钟宽限期：被强制下线后 2 分钟内仍然允许访问
      if (timeSinceForcedLogout < 2) {
        console.log(
          `[API /auth/me] ⏳ 用户 ${userId} 被强制下线 ${timeSinceForcedLogout.toFixed(1)} 分钟，仍在宽限期内，允许访问`,
        );
      } else {
        // 超过 2 分钟宽限期，拒绝访问
        console.log(
          `[API /auth/me] ❌ 用户 ${userId} 被强制下线 ${timeSinceForcedLogout.toFixed(1)} 分钟，已超过宽限期，拒绝访问`,
        );
        return NextResponse.json(
          { error: "您已被管理员强制下线，请重新登录", message: "强制下线" },
          { status: 401 },
        );
      }
    }

    // 检查用户是否超过 5 分钟未活跃（300 秒）
    const now = Date.now();
    const lastLoginTime = user.lastLoginAt
      ? new Date(user.lastLoginAt).getTime()
      : 0;
    const timeSinceLastLogin = (now - lastLoginTime) / 1000; // 秒

    if (timeSinceLastLogin > 300) {
      // 超过 5 分钟未操作，显示离线，拒绝访问
      console.log(
        `[API /auth/me] ⏰ 用户 ${userId} 超过 ${Math.round(timeSinceLastLogin / 60)} 分钟未操作，显示离线，拒绝访问`,
      );
      return NextResponse.json(
        { error: "您已长时间未操作，请重新登录", message: "超时" },
        { status: 401 },
      );
    }

    // 验证通过，返回用户信息
    // 注意：不更新 lastLoginAt，只有用户真正操作时才更新
    // 这样关闭浏览器后重新打开，lastLoginAt 还是关闭前的时间，显示离线状态

    console.log(`[API /auth/me] ✅ 用户 ${userId} 认证通过`);

    // 返回用户信息（包含角色、手机号和会员等级）
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || user.phone || user.email,
        email: user.email,
        phone: user.phone,
        role: user.role,
        membershipLevel: user.membershipLevel || "FREE",
      },
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
