import { NextRequest, NextResponse } from "next/server";
import { validateUser, AuthenticatedUser } from "@/lib/auth";
import { assertCSRF } from "@/lib/csrf";

/**
 * P0-2 修复：统一鉴权 + CSRF HOF
 *
 * 用法：
 *   export const POST = withAuth(async (req, user) => { ... });
 *   export const POST = withAuth({ requireAdmin: true }, async (req, user) => { ... });
 *
 * 行为：
 *   1. CSRF Origin/Referer 校验（写接口）
 *   2. validateUser 全量状态机校验（封禁/注销/维护/挤线/超时…）
 *   3. 可选管理员校验
 *
 * 避免业务接口裸用 x-user-id 跳过状态机。
 */

type Handler<T = any> = (
  req: NextRequest,
  user: AuthenticatedUser
) => Promise<T>;

interface Options {
  requireAdmin?: boolean;
  /** 跳过 CSRF 校验（如登录、注册等无登录态的写接口） */
  skipCSRF?: boolean;
  /** 允许注销中（deleting）用户访问，默认 false */
  allowDeleting?: boolean;
}

function ok() {
  return { ok: true } as const;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * 形态1：withAuth(handler)
 */
export function withAuth(handler: Handler): (req: NextRequest) => Promise<any>;
/**
 * 形态2：withAuth({ requireAdmin, skipCSRF, allowDeleting }, handler)
 */
export function withAuth(
  options: Options,
  handler: Handler
): (req: NextRequest) => Promise<any>;
export function withAuth(
  optionsOrHandler: Options | Handler,
  maybeHandler?: Handler
): (req: NextRequest) => Promise<any> {
  const options: Options =
    typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
  const handler: Handler =
    typeof optionsOrHandler === "function"
      ? (optionsOrHandler as Handler)
      : maybeHandler!;

  return async (req: NextRequest) => {
    // 1. CSRF
    if (!options.skipCSRF) {
      const csrf = assertCSRF(req);
      if (!csrf.ok) {
        return fail(csrf.error, csrf.status);
      }
    }

    // 2. 鉴权
    const authHeader = req.headers.get("authorization");
    const authResult = await validateUser(authHeader, req);
    if (!authResult.valid || !authResult.user) {
      return fail(authResult.error || "UNAUTHORIZED", 401);
    }

    const user = authResult.user;

    // 3. 注销中拦截
    if (user.status === "deleting" && !options.allowDeleting) {
      return fail("ACCOUNT_DELETING", 403);
    }

    // 4. 管理员校验
    if (options.requireAdmin) {
      const adminRoles = [
        "admin",
        "super_admin",
        "superadmin",
        "ADMIN",
        "SUPERADMIN",
        "SUPER_ADMIN",
      ];
      if (!adminRoles.includes(user.role)) {
        return fail("FORBIDDEN", 403);
      }
    }

    return handler(req, user);
  };
}

/**
 * 仅做 CSRF + 鉴权校验，不执行业务逻辑，返回 { user }。
 * 用于不想用 HOF 包装、但仍需统一校验的场景。
 */
export async function checkAuth(
  req: NextRequest,
  options: { skipCSRF?: boolean } = {}
): Promise<
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse }
> {
  if (!options.skipCSRF) {
    const csrf = assertCSRF(req);
    if (!csrf.ok) {
      return { ok: false, response: fail(csrf.error, csrf.status) };
    }
  }
  const authHeader = req.headers.get("authorization");
  const authResult = await validateUser(authHeader, req);
  if (!authResult.valid || !authResult.user) {
    return { ok: false, response: fail(authResult.error || "UNAUTHORIZED", 401) };
  }
  return { ok: true, user: authResult.user };
}
