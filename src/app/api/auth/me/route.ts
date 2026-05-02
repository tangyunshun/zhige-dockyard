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
    const token = request.cookies.get("auth_token")?.value;

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
      return NextResponse.json(
        { error: "账号已被禁用", message: "账号已被禁用" },
        { status: 403 },
      );
    }

    // 检查会话是否过期
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: "会话已过期，请重新登录", message: "会话已过期" },
        { status: 401 },
      );
    }

    // 检查用户是否被强制下线（给 2 分钟宽限期）
    if (user.lastForcedLogoutAt) {
      const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
      const gracePeriod = 2 * 60 * 1000; // 2 分钟宽限期（毫秒）
      const timeSinceForcedLogout = Date.now() - forcedLogoutTime;
      const minutesRemaining = Math.max(
        0,
        (gracePeriod - timeSinceForcedLogout) / 60000,
      ).toFixed(2);

      console.log(`[API /auth/me] 用户 ${userId} 强制下线检查开始`);
      console.log(
        `  - forcedLogoutTime: ${forcedLogoutTime} (${new Date(forcedLogoutTime).toISOString()})`,
      );
      console.log(
        `  - timeSinceForcedLogout: ${timeSinceForcedLogout}ms (${(timeSinceForcedLogout / 60000).toFixed(2)}分钟)`,
      );
      console.log(`  - gracePeriod: ${gracePeriod}ms (2 分钟)`);
      console.log(`  - 剩余宽限期：${minutesRemaining}分钟`);

      // 只有在超过宽限期后，才返回错误
      if (timeSinceForcedLogout > gracePeriod) {
        console.log(`[API /auth/me] ❌ 用户 ${userId} 已超过宽限期，返回 401`);
        return NextResponse.json(
          { error: "您已被强制下线，请重新登录", message: "强制下线" },
          { status: 401 },
        );
      } else {
        console.log(`[API /auth/me] ✅ 用户 ${userId} 在宽限期内，允许访问`);
      }
    }

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
