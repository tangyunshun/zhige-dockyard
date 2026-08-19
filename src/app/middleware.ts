import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

// 仅对需要鉴权的页面/接口做预校验，放行登录、登出、静态资源与公开接口
// 说明：/api/auth 下除 me / touch 外均属于未登录即可访问的认证流程接口
const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/api/health",
  "/_next",
  "/favicon",
  "/public",
];

// /api/auth 下仍需登录态的接口（例外名单）
const PROTECTED_AUTH_PATHS = ["/api/auth/me", "/api/auth/touch"];

function isPublic(pathname: string): boolean {
  if (PROTECTED_AUTH_PATHS.some((p) => pathname === p)) {
    return false;
  }
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径直接放行，由后端各自鉴权
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  // 无 token：API 返回 401，页面重定向到登录
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 将已校验的用户 ID 透传给下游（validateUser 读取 x-user-id 以跳过重复解密）
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // token 无效/过期
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  // 作用于所有页面路由与 API 路由
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
