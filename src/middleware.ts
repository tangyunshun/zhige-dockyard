import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_FILES = ["/favicon.svg", "/_next/static", "/_next/image", "/init"];

const AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/forgot-password"];
const PROTECTED_ROUTES = ["/dashboard", "/admin", "/settings", "/profile", "/workspace-hub", "/studio", "/workspace"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 允许访问静态资源
  if (PUBLIC_FILES.some((file) => pathname.startsWith(file))) {
    return NextResponse.next();
  }

  try {
    // 检查认证状态
    const token = request.cookies.get("auth_token")?.value;
    const isLoggedIn = !!token;

    // 邀请链接免打扰逻辑：如果用户携带 invite_token，直接加入企业并跳转
    const inviteToken = request.nextUrl.searchParams.get("invite_token");
    if (inviteToken && isLoggedIn) {
      // 如果用户正在访问 workspace-hub，直接重定向到邀请的企业空间
      if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
        // 这里可以添加处理邀请逻辑的代码
        // 例如：验证 inviteToken，将用户加入对应企业，然后重定向
        return NextResponse.redirect(new URL("/workspace", request.url));
      }
    }

    // 认证路由无需登录即可访问
    if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
      if (isLoggedIn) {
        return NextResponse.redirect(new URL("/workspace-hub", request.url));
      }
      return NextResponse.next();
    }

    // 保护路由需要登录才能访问
    if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
      if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
      }
      
      // 额外验证：检查用户是否在数据库中存在
      // 通过调用 API 验证用户有效性
      const verifyUrl = new URL("/api/auth/verify", request.url);
      const verifyRequest = new Request(verifyUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      try {
        const verifyResponse = await fetch(verifyRequest);
        if (!verifyResponse.ok) {
          // 用户不存在或 token 无效，清除 cookie 并重定向到登录页
          const response = NextResponse.redirect(new URL("/auth/login", request.url));
          response.cookies.delete("auth_token");
          return response;
        }
      } catch (error) {
        console.error("User verification failed:", error);
        // 验证失败，重定向到登录页
        const response = NextResponse.redirect(new URL("/auth/login", request.url));
        response.cookies.delete("auth_token");
        return response;
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);
    // 发生错误时，重定向到登录页
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.delete("auth_token");
    return response;
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
