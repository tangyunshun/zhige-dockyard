import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

// 仅对需要鉴权的页面/接口做预校验，放行登录、登出、静态资源与公开接口
// 说明：/api/auth 下除 me / touch 外均属于未登录即可访问的认证流程接口
// 说明：/solutions /security /pricing /developers /docs 为公共营销页面，未登录可直接浏览，
//      仅页面内的操作（工单、诊断、升级、配置等）由各自 API 鉴权拦截
const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/api/health",
  "/api/components",
  // 公共营销页面 - 未登录可查看（与客户端 AuthCheck / RouterGuards 保持一致）
  "/solutions",
  "/security",
  "/pricing",
  "/developers",
  "/docs",
  "/init",
  // 营销页面与注册登录未登录展示所需的公开数据接口
  "/api/membership/levels",
  "/api/documents/list",
  "/api/system-documents",
  "/api/account-appeal",
  "/studio",
  "/_next",
  "/favicon",
  "/public",
  "/icons",
  "/uploads",
  "/favicon.svg",
  "/favicon.ico",
];

// /api/auth 下仍需登录态的接口（例外名单）
const PROTECTED_AUTH_PATHS = ["/api/auth/me", "/api/auth/touch"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  if (PROTECTED_AUTH_PATHS.some((p) => pathname === p)) {
    return false;
  }
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 所有认证页面 (/auth/*) 优先绝对直接放行，物理杜绝死循环重定向引发的 404 错误
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 公开路径与静态文件直接放行，由后端各自鉴权
  const isPublicStudioCatalog =
    pathname === "/api/studio" &&
    request.nextUrl.searchParams.get("action") === "catalog";
  if (isPublic(pathname) || isPublicStudioCatalog) {
    return NextResponse.next();
  }

  // 兼顾 Cookie (auth_token) 与 Header (Authorization: Bearer <token>) 双重凭证来源
  // 说明：前端已开始优先传 Authorization，这里也优先信任它，避免 cookie / localStorage 分叉。
  const authHeader = request.headers.get("authorization");
  const authToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : "";
  let token = "";
  if (authToken && authToken !== "null" && authToken !== "undefined") {
    token = authToken;
  } else {
    token = request.cookies.get("auth_token")?.value || "";
  }

  // 无 token：API 严格返回 401 JSON，页面重定向到登录页
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: "未提供身份凭证" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  try {
    let userId = "";
    // 仅接受 JWT 格式凭证；明文 token（如裸 userId）一律视为无效身份，严禁放行
    if (token.includes(".")) {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      userId = payload.userId as string;
    } else {
      throw new Error("INVALID_TOKEN_FORMAT");
    }

    // 将已校验的用户 ID 透传给下游（validateUser 读取 x-user-id 以跳过重复解密）
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // token 无效/过期：API 严格返回 401 JSON，页面重定向到登录页
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "INVALID_TOKEN", message: "身份凭证无效或已过期" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  // 作用于所有页面路由与 API 路由，自动排除静态资源与 Next.js 图片优化
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|icons/|uploads/).*)"],
};
