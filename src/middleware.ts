import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const PUBLIC_FILES = ["/favicon.svg", "/_next/static", "/_next/image", "/init"];

const AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/forgot-password"];
const PROTECTED_ROUTES = ["/dashboard", "/admin", "/settings", "/profile"];
const SKIP_WORKSPACE_HUB_ROUTES = ["/workspace-hub"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 允许访问静态资源
  if (PUBLIC_FILES.some((file) => pathname.startsWith(file))) {
    return NextResponse.next();
  }

  try {
    // 检查系统是否需要初始化
    const userCount = await prisma.user.count();

    if (userCount === 0) {
      // 系统未初始化，重定向到初始化页面
      if (pathname !== "/init") {
        return NextResponse.redirect(new URL("/init", request.url));
      }
    } else {
      // 系统已初始化，禁止访问初始化页面
      if (pathname === "/init") {
        return NextResponse.redirect(new URL("/auth/login", request.url));
      }
    }

    // 检查认证状态
    const token = request.cookies.get("auth_token")?.value;
    const isLoggedIn = !!token;

    // 邀请链接免打扰逻辑：如果用户携带 invite_token，直接加入企业并跳转
    const inviteToken = request.nextUrl.searchParams.get("invite_token");
    if (inviteToken && isLoggedIn) {
      // 如果用户正在访问 workspace-hub，直接重定向到邀请的企业空间
      if (SKIP_WORKSPACE_HUB_ROUTES.some((route) => pathname.startsWith(route))) {
        // 这里可以添加处理邀请逻辑的代码
        // 例如：验证 inviteToken，将用户加入对应企业，然后重定向
        return NextResponse.redirect(new URL("/workspace", request.url));
      }
    }

    // 认证路由无需登录即可访问
    if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
      if (isLoggedIn) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    // 保护路由需要登录才能访问
    if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
      if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * 匹配所有请求路径，除了：
     * - api (Next.js 后端 API)
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.svg (网站图标)
     */
    "/((?!api|_next/static|_next/image|favicon.svg).*)",
  ],
};
