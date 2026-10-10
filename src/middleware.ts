import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-config";

// 仅对需要鉴权的页面/接口做预校验，放行登录、登出、静态资源与公开接口
// 说明：/api/auth 下除 me / touch 外均属于未登录即可访问的认证流程接口
// 说明：/solutions /security /pricing /developers /docs 为公共营销页面，未登录可直接浏览，
//      仅页面内的操作（工单、诊断、升级、配置等）由各自 API 鉴权拦截
const PUBLIC_PREFIXES = [
  "/auth",
  "/api/auth",
  "/api/health",
  "/api/components",
  // 开放接口：使用 API Key（而非会话 JWT）鉴权，由各路由自行完成鉴权
  "/api/open",
  // 公共营销页面 - 未登录可查看（与客户端 AuthCheck / RouterGuards 保持一致）
  "/solutions",
  "/security",
  "/pricing",
  "/models",
  "/developers",
  "/docs",
  "/init",
  // 营销页面与注册登录未登录展示所需的公开数据接口
  "/api/membership/levels",
  "/api/model-pricing/public",
  // 首页「用户评价」公开读取（未登录访客可见；后台维护接口 /api/admin/testimonials 仍需鉴权）
  "/api/testimonials",
  "/api/documents/list",
  "/api/system-documents",
  "/api/account-appeal",
  "/api/system/public-config",
  "/api/system/site-routes",
  "/api/system/maintenance",
  "/api/system/check-maintenance",
  "/api/system/check-update",
  "/api/system/status",
  "/privacy-policy",
  "/terms-of-service",
  "/help",
  "/maintenance",
  "/releases",
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

/* ============================================================================
 * 接口权限「规则层」统一拦截
 * ----------------------------------------------------------------------------
 * 目的：后台注册新模块后，其接口鉴权可「配置即生效」，无需修改每个接口代码。
 * 策略（故障安全 fail-closed，不再有 fail-open）：
 *   1. 只覆盖 /api/admin/**（后台管理接口）；
 *   2. 只校验**已启用**的规则 —— 自动生成的草稿默认 enabled=false；
 *   3. 超级管理员无条件放行（其权限上下文不依赖权限包读取，故不受权限服务异常影响）；
 *   4. **规则服务或权限上下文服务异常时，一律返回 503 阻断后台接口**，
 *      绝不放行 —— 宁可短暂不可用，也不允许"权限服务挂了就人人可过"；
 *   5. 「读取成功但确实没有启用规则」属正常情况，正常放行（与故障严格区分）。
 *
 * 观测：503 响应带 `x-permission-gate`（rules-unavailable / context-unavailable）与 Retry-After 头，
 *      便于网关、日志与前端定位故障来源。
 * ==========================================================================*/
interface CachedRule {
  pathPrefix: string;
  methods: string[];
  permission: string;
}

let ruleCache: { rules: CachedRule[]; at: number } | null = null;
// 规则缓存压到 3 秒：管理员在「接口权限规则」页保存后**几乎立即生效**（人感觉就是秒级），
// 同时避免每个请求都发起一次内部读取（后台接口 QPS 很低，3 秒窗口足够）。
const RULE_TTL_MS = 3 * 1000;
const CONTEXT_TTL_MS = 10 * 1000;
const contextCache = new Map<string, { isSuperAdmin: boolean; permissions: string[]; at: number }>();

async function loadEnabledRules(origin: string, token: string): Promise<CachedRule[]> {
  if (ruleCache && Date.now() - ruleCache.at < RULE_TTL_MS) return ruleCache.rules;

  const res = await fetch(`${origin}/api/system/api-permission-rules`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rules ${res.status}`);
  const data = await res.json();
  // 明确区分「成功但为空」与「读取失败/响应异常」：后者必须抛错，交由调用方 503 阻断
  if (data?.success === false) throw new Error(`rules ${data?.error || "unavailable"}`);
  if (!Array.isArray(data?.rules)) throw new Error("rules malformed");
  const rules: CachedRule[] = data.rules as CachedRule[];
  ruleCache = { rules, at: Date.now() };
  return rules;
}

/** 权限服务不可用：统一 503（不是 403，因为这不是"权限不足"，而是服务故障） */
function permissionServiceUnavailable(reason: "rules" | "context") {
  const code = reason === "rules" ? "PERMISSION_RULES_UNAVAILABLE" : "PERMISSION_CONTEXT_UNAVAILABLE";
  return NextResponse.json(
    {
      error: "PERMISSION_SERVICE_UNAVAILABLE",
      reason: code,
      message: "后台权限校验服务暂时不可用，请稍后重试。",
    },
    {
      status: 503,
      headers: {
        "x-permission-gate": reason === "rules" ? "rules-unavailable" : "context-unavailable",
        "Retry-After": "3",
        "Cache-Control": "no-store",
      },
    }
  );
}

async function loadPermissionContext(origin: string, token: string, userId: string) {
  const cached = contextCache.get(userId);
  if (cached && Date.now() - cached.at < CONTEXT_TTL_MS) return cached;

  const res = await fetch(`${origin}/api/system/permission-context`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`context ${res.status}`);
  const data = await res.json();
  // 权限包读取失败时，上下文接口会返回 success:false（503），此处必须抛错而非降级为空权限
  if (data?.success === false) throw new Error(`context ${data?.error || "unavailable"}`);
  const ctx = {
    isSuperAdmin: Boolean(data?.isSuperAdmin),
    permissions: Array.isArray(data?.permissions) ? (data.permissions as string[]) : [],
    at: Date.now(),
  };
  contextCache.set(userId, ctx);
  return ctx;
}

async function enforceApiPermissionRules(
  request: NextRequest,
  pathname: string,
  token: string,
  userId: string
): Promise<NextResponse | null> {
  // 灰度范围：仅后台管理接口；且绝不拦截拦截层自身依赖的系统接口（防递归）
  if (!pathname.startsWith("/api/admin")) return null;
  if (pathname.startsWith("/api/system")) return null;

  const origin = request.nextUrl.origin;
  let rules: CachedRule[];
  try {
    rules = await loadEnabledRules(origin, token);
  } catch (error) {
    // 故障安全（fail-closed）：规则服务异常时必须阻断后台接口，绝不放行
    console.error("[permission-gate] 规则读取失败，对 /api/admin/** 返回 503:", error);
    return permissionServiceUnavailable("rules");
  }
  if (rules.length === 0) return null;

  const method = request.method.toUpperCase();
  // 按「路径段边界」匹配：/api/admin/users/batch 不应命中 /api/admin/users/batch-logout
  const hitPath = (prefix: string) => {
    if (!prefix) return false;
    const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === normalized || pathname.startsWith(normalized + "/");
  };
  const matched = rules
    .filter((r) => hitPath(r.pathPrefix))
    .filter(
      (r) => !r.methods?.length || r.methods.map((m) => String(m).toUpperCase()).includes(method)
    )
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0];
  if (!matched) return null;

  let ctx: { isSuperAdmin: boolean; permissions: string[] };
  try {
    ctx = await loadPermissionContext(origin, token, userId);
  } catch (error) {
    // 故障安全（fail-closed）：权限包服务异常时必须阻断后台接口，绝不放行
    console.error("[permission-gate] 权限上下文读取失败，对 /api/admin/** 返回 503:", error);
    return permissionServiceUnavailable("context");
  }

  if (ctx.isSuperAdmin) return null;
  if (ctx.permissions.includes(matched.permission)) return null;

  return NextResponse.json(
    { error: "FORBIDDEN", message: `缺少接口权限：${matched.permission}` },
    { status: 403 }
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
      const { payload } = await jwtVerify(token, getJwtSecretKey());
      userId = payload.userId as string;
    } else {
      throw new Error("INVALID_TOKEN_FORMAT");
    }

    // 将已校验的用户 ID 透传给下游（validateUser 读取 x-user-id 以跳过重复解密）
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);

    // 「接口权限规则层」统一拦截（仅对已启用的规则生效；无启用规则时立即返回 null，零开销）
    const denied = await enforceApiPermissionRules(request, pathname, token, userId);
    if (denied) return denied;

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
