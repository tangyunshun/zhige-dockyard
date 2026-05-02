import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

console.log("[Middleware] 文件已加载！！！");

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// 不需要检查会话的路径
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/",
  "/init",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log(`[Middleware] 函数被调用！pathname: ${pathname}`);

  // 跳过公共路径
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    console.log(`[Middleware] 跳过公共路径：${pathname}`);
    return NextResponse.next();
  }

  // 获取 Token（检查 auth_token 和 token 两种 cookie 名称）
  const token =
    request.cookies.get("auth_token")?.value ||
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    // 如果是 API 请求，返回 401
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    // 否则重定向到登录页
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    // 验证 JWT Token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    if (!userId) {
      throw new Error("Invalid token");
    }

    // 对于所有受保护的路径，检查用户会话是否有效
    // 包括：所有 API 请求、管理后台、工作空间相关页面、studio、docs 等所有需要登录的页面
    // 排除公开页面（已经在 PUBLIC_PATHS 中排除）
    console.log(
      `[Middleware] 检查用户会话，pathname: ${pathname}, userId: ${userId}`,
    );

    // 导入 Prisma（只在需要时导入，避免影响性能）
    const prisma = (await import("@/lib/prisma")).default;

    // 检查用户是否存在且状态正常
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        sessionToken: true,
        sessionExpiresAt: true,
        lastForcedLogoutAt: true,
        lastLoginAt: true,
      },
    });

    console.log(`[Middleware] 用户 ${userId} 数据:`, user);

    if (!user) {
      console.log(`[Middleware] 用户 ${userId} 不存在`);
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "用户不存在" }, { status: 401 });
      }
      return NextResponse.redirect(
        new URL(
          `/auth/login?error=${encodeURIComponent("用户不存在，请重新登录")}`,
          request.url,
        ),
      );
    }

    // 检查用户状态
    if (user.status !== "active") {
      console.log(`[Middleware] 用户 ${userId} 状态异常：${user.status}`);
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });
      }
      // 清除 cookie 并重定向到登录页
      const response = NextResponse.redirect(
        new URL(
          `/auth/login?error=${encodeURIComponent("账号已被禁用，请联系管理员")}`,
          request.url,
        ),
      );
      response.cookies.delete("token");
      return response;
    }

    // 检查管理员权限（只针对管理后台 API 和页面）
    if (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) {
      if (user.role !== "admin" && user.role !== "super_admin") {
        console.log(
          `[Middleware] 用户 ${userId} 没有管理员权限，role: ${user.role}`,
        );
        if (pathname.startsWith("/api")) {
          return NextResponse.json({ error: "权限不足" }, { status: 403 });
        }
        return NextResponse.redirect(
          new URL(
            `/auth/login?error=${encodeURIComponent("权限不足，需要管理员账号")}`,
            request.url,
          ),
        );
      }
    }

    // 检查会话是否过期（仅针对有 sessionToken 的用户）
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) < new Date()) {
      console.log(`[Middleware] 用户 ${userId} 会话已过期`);
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "会话已过期，请重新登录" },
          { status: 401 },
        );
      }
      const response = NextResponse.redirect(
        new URL(
          `/auth/login?error=${encodeURIComponent("会话已过期，请重新登录")}`,
          request.url,
        ),
      );
      response.cookies.delete("token");
      return response;
    }

    // 检查用户是否被强制下线
    // 只在 API 层面检查，middleware 不拦截，让用户在宽限期内可以正常操作
    // 宽限期逻辑由 /api/auth/me 和其他 API 自己处理

    // 对于老用户（没有 sessionToken），如果最近 2 小时没有登录，要求重新登录
    if (!user.sessionToken && user.lastLoginAt) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (new Date(user.lastLoginAt) < twoHoursAgo) {
        console.log(`[Middleware] 用户 ${userId} 登录时间过长`);
        if (pathname.startsWith("/api")) {
          return NextResponse.json(
            { error: "登录时间过长，请重新登录" },
            { status: 401 },
          );
        }
        const response = NextResponse.redirect(
          new URL(
            `/auth/login?error=${encodeURIComponent("登录时间过长，请重新登录")}`,
            request.url,
          ),
        );
        response.cookies.delete("token");
        return response;
      }
    }

    // 验证通过，继续请求
    return NextResponse.next();
  } catch (error) {
    console.error("Middleware auth error:", error);

    // Token 无效或过期
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    return NextResponse.redirect(
      new URL(
        `/auth/login?error=${encodeURIComponent("会话无效，请重新登录")}`,
        request.url,
      ),
    );
  }
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - 静态资源 (_next, favicon.ico, etc.)
     * - 公开页面已经在 PUBLIC_PATHS 中排除
     */
    "/((?!_next|static|.*\\..*|_next/static|_next/image|favicon.ico).*)",
  ],
};
