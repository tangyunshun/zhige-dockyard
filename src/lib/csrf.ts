import { NextRequest } from "next/server";

/**
 * I-04 CSRF 防护
 *
 * 本项目为同源单体（Next.js App Router），auth cookie 使用 SameSite=Lax，
 * 跨站请求默认不携带 cookie。但为对齐 PRD I-04，对关键写操作额外校验
 * Origin/Referer 与本站 Host 一致，杜绝剩余 CSRF 面。
 *
 * 规则：
 * - GET/HEAD/OPTIONS 不校验（只读安全）
 * - 无 Origin 且无 Referer 的请求（服务端直调 / curl）跳过，避免破坏合法调用
 * - Origin 或 Referer 的 host 必须与本站 Host（或 NEXT_PUBLIC_APP_URL）一致
 */
export function assertCSRF(
  request: NextRequest
): { ok: true } | { ok: false; error: string; status: number } {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!origin && !referer) {
    return { ok: true };
  }

  const source = (origin || referer || "").trim();
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return { ok: false, error: "CSRF_INVALID", status: 403 };
  }

  const allowedHosts = new Set<string>();
  const requestHost = request.headers.get("host");
  if (requestHost) allowedHosts.add(requestHost);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowedHosts.add(new URL(appUrl).host);
    } catch {
      // 忽略非法配置
    }
  }

  if (!allowedHosts.has(sourceHost)) {
    return { ok: false, error: "CSRF_INVALID", status: 403 };
  }

  return { ok: true };
}
