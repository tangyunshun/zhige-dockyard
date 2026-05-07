import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 更新用户活跃时间
 * 只在用户真正操作时调用（如加载数据、提交表单等）
 * 用于判断用户在线状态
 *
 * 返回错误码说明：
 * - 401: 未登录或会话超时（超过 5 分钟未操作）
 * - 403: 被强制下线或账号状态异常
 * - 404: 用户不存在
 */
export async function POST(request: NextRequest) {
  try {
    // 优先从 Cookie 中获取 token，其次从 Authorization header 获取
    let token = request.cookies.get("auth_token")?.value;

    if (!token) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // 验证 token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 先检查用户当前的活跃时间
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastLoginAt: true,
        status: true,
        lastForcedLogoutAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查用户是否被强制下线
    if (user.lastForcedLogoutAt) {
      const now = new Date().getTime();
      const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
      const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60; // 分钟

      // 2 分钟宽限期：被强制下线后 2 分钟内仍然允许更新
      if (timeSinceForcedLogout < 2) {
        console.log(
          "[API /auth/touch] 用户 " +
            userId +
            " 被强制下线" +
            timeSinceForcedLogout.toFixed(1) +
            " 分钟，仍在宽限期内，允许更新活跃时间",
        );
      } else {
        // 超过 2 分钟宽限期，拒绝访问
        console.log(
          "[API /auth/touch] 用户 " +
            userId +
            " 被强制下线" +
            timeSinceForcedLogout.toFixed(1) +
            " 分钟，已超过宽限期，拒绝更新",
        );
        return NextResponse.json(
          {
            error: "FORCED_LOGOUT",
            message: "您已被管理员强制下线，请重新登录",
          },
          { status: 403 },
        );
      }
    }

    // 检查用户状态
    if (user.status !== "active") {
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " 状态异常 (" +
          user.status +
          ")，拒绝更新",
      );
      return NextResponse.json(
        {
          error: "ACCOUNT_DISABLED",
          message: "您的账号状态异常，请联系管理员",
        },
        { status: 403 },
      );
    }

    // 检查是否超过 5 分钟未操作（300 秒）
    const now = Date.now();
    const lastLoginTime = user.lastLoginAt
      ? new Date(user.lastLoginAt).getTime()
      : 0;
    const timeSinceLastLogin = (now - lastLoginTime) / 1000; // 秒
    if (timeSinceLastLogin > 300) {
      // 超过 5 分钟未操作，会话已失效，需要重新登录
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " 超过 " +
          Math.round(timeSinceLastLogin / 60) +
          " 分钟未操作，会话已失效",
      );
      return NextResponse.json(
        { error: "SESSION_TIMEOUT", message: "您已长时间未操作，请重新登录" },
        { status: 401 },
      );
    }

    // 更新用户活跃时间
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });

    console.log(
      "[API /auth/touch] 用户 " +
        userId +
        " 活跃时间已更新（上次活跃 " +
        Math.round(timeSinceLastLogin) +
        "秒前）",
    );

    return NextResponse.json({
      success: true,
      message: "活跃时间已更新",
    });
  } catch (error) {
    console.error("[API /auth/touch] 更新活跃时间失败:", error);
    return NextResponse.json({ error: "更新活跃时间失败" }, { status: 500 });
  }
}
