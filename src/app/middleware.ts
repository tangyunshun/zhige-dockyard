﻿import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

console.log("[Middleware] Middleware started");

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// 公开路径，不需要认证
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/callback",
  "/",
  "/workspace-hub",
  "/init",
  "/terms-of-service",
  "/privacy-policy",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const startTime = Date.now();

  console.log(`[Middleware] Processing pathname: ${pathname}`);

  // 对于 API 路由，先执行请求，然后记录使用情况
  if (pathname.startsWith("/api")) {
    const response = await handleApiRequest(request, startTime);
    return response;
  }

  // 公开路径，直接放行
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    console.log(`[Middleware] Public path, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // 获取 Token，优先从 auth_token 获取，其次从 token 获取，最后从 Authorization header 获取
  const token =
    request.cookies.get("auth_token")?.value ||
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    // 如果是 API 请求，返回 401
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    // 否则重定向到登录页
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    // 验证 JWT Token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 验证用户是否在数据库中存储（关键修复：检查用户是否存在）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletionRequestedAt: true },
    });

    if (!user) {
      console.log(
        `[Middleware] User ${userId} not found in database, clearing auth`,
      );
      // 用户不存在，清除认证信息并重定向到登录页
      const response = NextResponse.redirect(
        new URL("/auth/login", request.url),
      );
      response.cookies.set("auth_token", "", { maxAge: 0 });
      response.cookies.set("token", "", { maxAge: 0 });
      return response;
    }

    // 检查用户是否在冷静期内（使用 any 类型避免 Prisma 类型问题）
    const userAny = user as any;
    if (userAny.deletionRequestedAt) {
      const deletionDate = new Date(userAny.deletionRequestedAt);
      const now = new Date();
      const daysUntilDeletion = 7;
      const deletionDeadline = new Date(
        deletionDate.getTime() + daysUntilDeletion * 24 * 60 * 60 * 1000,
      );

      if (now < deletionDeadline) {
        // 冷静期内，允许访问首页，但禁止访问其他页面
        if (pathname === "/" || pathname === "/workspace-hub") {
          console.log(
            `[Middleware] User ${userId} in deletion cooldown, allowing access to ${pathname}`,
          );
          const response = NextResponse.next();
          response.headers.set("x-user-id", userId);
          return response;
        } else {
          // 冷静期内访问其他页面，重定向到首页
          console.log(
            `[Middleware] User ${userId} in deletion cooldown, redirecting to homepage`,
          );
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }

    // 检查用户状态
    if (user.status !== "active") {
      console.log(
        `[Middleware] User ${userId} is not active, status: ${user.status}`,
      );
      const response = NextResponse.redirect(
        new URL("/auth/login", request.url),
      );
      response.cookies.set("auth_token", "", { maxAge: 0 });
      response.cookies.set("token", "", { maxAge: 0 });
      return response;
    }

    // 验证成功，将用户信息添加到请求头
    const response = NextResponse.next();
    response.headers.set("x-user-id", userId);
    response.headers.set("x-user-email", payload.email as string);
    response.headers.set("x-user-role", payload.role as string);

    console.log(`[Middleware] User ${userId} authenticated successfully`);
    return response;
  } catch (error) {
    console.error("[Middleware] Token validation failed:", error);

    // Token 无效
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
    }

    // 清除无效的 cookie
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.set("auth_token", "", { maxAge: 0 });
    response.cookies.set("token", "", { maxAge: 0 });
    return response;
  }
}

async function handleApiRequest(
  request: NextRequest,
  startTime: number,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 公开 API 路径，不需要认证
  const PUBLIC_API_PATHS = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/send-sms",
    "/api/auth/verify-sms",
    "/api/auth/send-email-code",
    "/api/auth/verify-email-code",
    "/api/auth/check-account",
    "/api/auth/check-phone",
    "/api/system-documents",
  ];

  if (PUBLIC_API_PATHS.some((path) => pathname.startsWith(path))) {
    console.log(`[Middleware] Public API path, allowing: ${pathname}`);
    const response = NextResponse.next();
    await recordApiUsage(request, response, startTime, null);
    return response;
  }

  // 获取 Token
  const authHeader = request.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    request.cookies.get("auth_token")?.value;

  if (!token) {
    const response = NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 },
    );
    await recordApiUsage(request, response, startTime, null);
    return response;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 验证用户是否在数据库中存储（关键修复：检查用户是否存在）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      console.log(`[Middleware] API User ${userId} not found in database`);
      const response = NextResponse.json(
        { error: "USER_NOT_FOUND" },
        { status: 401 },
      );
      await recordApiUsage(request, response, startTime, null);
      return response;
    }

    // 检查用户状态
    if (user.status !== "active") {
      console.log(`[Middleware] API User ${userId} is not active`);
      const response = NextResponse.json(
        { error: "ACCOUNT_DISABLED" },
        { status: 401 },
      );
      await recordApiUsage(request, response, startTime, null);
      return response;
    }

    // 验证成功，记录 API 使用
    const response = NextResponse.next();
    response.headers.set("x-user-id", userId);
    response.headers.set("x-user-email", payload.email as string);
    response.headers.set("x-user-role", payload.role as string);

    await recordApiUsage(request, response, startTime, userId);

    console.log(`[Middleware] API User ${userId} authenticated successfully`);
    return response;
  } catch (error) {
    console.warn("[Middleware] API Token validation failed:", error);
    const response = NextResponse.json(
      { error: "INVALID_TOKEN" },
      { status: 401 },
    );
    await recordApiUsage(request, response, startTime, null);
    return response;
  }
}

async function recordApiUsage(
  request: NextRequest,
  response: NextResponse,
  startTime: number,
  userId: string | null,
) {
  // 不需要记录的路径
  const EXCLUDED_PATHS = [
    "/api/auth/me",
    "/api/auth/verify",
    "/api/auth/touch",
    "/api/user/workspace-hub/quota",
  ];

  const pathname = request.nextUrl.pathname;
  if (EXCLUDED_PATHS.includes(pathname)) {
    return;
  }

  try {
    if (userId) {
      const latencyMs = Date.now() - startTime;

      // API响应时间监控告警
      if (latencyMs > 3000) {
        console.warn(`[API监控] ⚠️ 慢API告警: ${pathname} 耗时 ${latencyMs}ms (阈值: 3000ms)`);
      } else if (latencyMs > 1000) {
        console.log(`[API监控] 📊 ${pathname} 耗时 ${latencyMs}ms`);
      }

      // 记录到数据库
      await prisma.apiUsage.create({
        data: {
          userId,
          endpoint: pathname,
          method: request.method,
          responseCode: response.status,
          latencyMs,
        },
      });

      // 如果响应时间超过5秒，记录为性能问题
      if (latencyMs > 5000) {
        console.error(`[API监控] 🔴 严重性能问题: ${pathname} 耗时 ${latencyMs}ms，超过5秒阈值！`);
      }
    }
  } catch (error) {
    console.warn("记录 API 使用失败:", error);
    // 记录失败不影响主流程
  }
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，包括 API 路由：
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
