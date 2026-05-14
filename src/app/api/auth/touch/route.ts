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

    // 检查用户当前的活跃时间和会话过期时间
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastLoginAt: true,
        status: true,
        lastForcedLogoutAt: true,
        sessionToken: true,
        sessionExpiresAt: true,
        role: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // ========== 最优先检查：账号状态 ==========
    if (user.status === "deleted") {
      return NextResponse.json(
        { error: "ACCOUNT_DELETED", message: "您的账号已被注销" },
        { status: 401 },
      );
    }

    if (user.status === "banned") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号已被永久封禁" },
        { status: 403 },
      );
    }

    if (user.status === "inactive") {
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "您的账号已被禁用，请联系管理员" },
        { status: 403 },
      );
    }

    // 保存当前sessionToken用于后续挤线检测
    const currentSessionToken = user.sessionToken;

    // 检查用户是否真的登录过（有有效的会话）
    // 如果sessionToken为空，说明用户从未登录或会话已失效
    if (!currentSessionToken || !user.sessionExpiresAt) {
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " 没有有效的会话（sessionToken为空）",
      );
      return NextResponse.json(
        { error: "SESSION_TIMEOUT", message: "您已长时间未操作，请重新登录" },
        { status: 401 },
      );
    }

    // 验证当前请求中的sessionToken是否与数据库中的一致（挤线检测）
    const requestSessionToken = request.cookies.get("session_token")?.value;

    if (currentSessionToken && requestSessionToken && requestSessionToken !== currentSessionToken) {
      // sessionToken不匹配，说明被其他设备挤下线
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " sessionToken 不匹配，被其他设备挤下线",
      );
      return NextResponse.json(
        { error: "MULTI_LOGIN_CONFLICT", message: "您的账号在另一处登录，您已被下线" },
        { status: 401 },
      );
    }

    if (!currentSessionToken && requestSessionToken) {
      // 数据库sessionToken被清空但请求中仍有session_token cookie，说明被管理员强制下线
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " sessionToken已被清空，被管理员强制下线",
      );
      return NextResponse.json(
        { error: "FORCED_LOGOUT", message: "您已被管理员强制下线，请重新登录" },
        { status: 401 },
      );
    }

    // 检查用户是否被强制下线（2分钟宽限期）
    if (user.lastForcedLogoutAt) {
      const now = new Date().getTime();
      const forcedLogoutTime = new Date(user.lastForcedLogoutAt).getTime();
      const timeSinceForcedLogout = (now - forcedLogoutTime) / 1000 / 60;

      if (timeSinceForcedLogout < 2) {
        console.log(
          "[API /auth/touch] 用户 " +
            userId +
            " 被强制下线" +
            timeSinceForcedLogout.toFixed(1) +
            " 分钟，仍在宽限期内",
        );
      } else {
        console.log(
          "[API /auth/touch] 用户 " +
            userId +
            " 被强制下线" +
            timeSinceForcedLogout.toFixed(1) +
            " 分钟，已超过宽限期",
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

    // 检查角色是否变更（场景22：角色权限变更强制重登）
    // 如果角色发生变化，说明权限被修改，需要重新登录刷新权限
    // 注意：这个检测需要前端配合，前端应该存储role并在每次请求时验证
    // 这里我们只检测，如果需要可以扩展为完整的权限验证
    const tokenRole = payload.role as string;
    if (user.role !== tokenRole) {
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " 角色已变更 (" +
          tokenRole +
          " -> " +
          user.role +
          ")，要求重新登录",
      );
      return NextResponse.json(
        { error: "ROLE_CHANGED", message: "您的账号权限已变更，请重新登录" },
        { status: 401 },
      );
    }

    // 检查会话是否已过期（固定时效过期）
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) < new Date()) {
      console.log(
        "[API /auth/touch] 用户 " +
          userId +
          " 会话已过期（固定时效）",
      );
      return NextResponse.json(
        { error: "SESSION_EXPIRED", message: "会话已过期，请重新登录" },
        { status: 401 },
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
