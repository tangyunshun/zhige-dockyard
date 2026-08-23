import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import {
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_NO_REMEMBER_MS,
  ABSOLUTE_TIMEOUT_REMEMBER_MS,
} from "@/lib/session-constants";
import { toAccountStatus, isLoginBlocked, isFullyBlocked } from "@/lib/account-status";
import { isMaintenanceMode } from "@/lib/maintenance";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

// 空闲超时从统一常量导出（A-01：10 分钟）
export { IDLE_TIMEOUT_MS };

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return { valid: false, error: "密码长度至少 8 个字符" };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "密码必须包含至少一个大写字母" };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "密码必须包含至少一个小写字母" };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "密码必须包含至少一个数字" };
  }

  return { valid: true };
}

export async function validateUser(
  authHeader: string | null,
  request?: any
): Promise<{
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}> {
  let token = "";

  // 1. 仅接受合法 JWT：从 Authorization 提取 Bearer token。
  //    明文 userId、Bearer null / undefined / 空 Bearer 一律拒绝（不是 JWT 形态 → 不留 token）。
  if (authHeader) {
    const raw = authHeader.replace("Bearer ", "").trim();
    if (raw && raw !== "null" && raw !== "undefined" && raw.includes(".")) {
      token = raw;
    }
  }

  // 2. Authorization 缺省时，从 Cookie auth_token 提取（同样必须为合法 JWT 形态）
  if (!token && request) {
    let cookieToken = "";
    if ("cookies" in request && typeof request.cookies?.get === "function") {
      cookieToken = request.cookies.get("auth_token")?.value || "";
    } else if (request.headers) {
      const cookieHeader =
        typeof request.headers.get === "function"
          ? request.headers.get("cookie") || ""
          : "";
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      if (match) cookieToken = match[1];
    }
    const ct = cookieToken.trim();
    if (ct && ct !== "null" && ct !== "undefined" && ct.includes(".")) {
      token = ct;
    }
  }

  // 3. 无任何合法 JWT 凭证 → UNAUTHORIZED（明文 userId 无法到达第 4 步）
  if (!token) {
    return { valid: false, error: "UNAUTHORIZED" };
  }

  try {
    let userId = "";
    let jwtSessionToken: string | undefined;
    let jwtIssuedAtStr: string | undefined;

    // 4. 强制 JWT 验签：任何非 JWT 明文（裸 userId / 伪造串）都会在此抛错 → INVALID_TOKEN
    const { payload } = await jwtVerify(token, JWT_SECRET);
    userId = payload.userId as string;
    if (!userId) {
      return { valid: false, error: "INVALID_TOKEN" };
    }
    jwtSessionToken = payload.sessionToken as string | undefined;
    jwtIssuedAtStr = payload.issuedAt as string | undefined;

    // 5. x-user-id 仅作为交叉校验：若请求头携带该字段，必须与已验签 JWT 载荷中的 userId 完全一致，
    //    防止业务 API 直接信任客户端伪造的 x-user-id。
    if (request) {
      const headers = "headers" in request ? request.headers : null;
      if (headers && typeof headers.get === "function") {
        const xUserId = headers.get("x-user-id");
        if (xUserId && xUserId !== userId) {
          return { valid: false, error: "INVALID_TOKEN" };
        }
      }
    }

    // 验证用户是否在数据库中存储，一并带出高级鉴权字段
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        sessionToken: true,
        lastForcedLogoutAt: true,
        bannedUntil: true,
        lastActivityAt: true,
        sessionExpiresAt: true, // A-02 绝对过期强踢
        passwordExpireDate: true, // C-04 密码过期拦截
      },
    });

    if (!user) {
      return { valid: false, error: "USER_NOT_FOUND" };
    }

    // D-02 账号注销冷静期：deleting 用户禁止访问任何业务接口，
    // 仅允许在「状态查询 / 撤销注销」流程（/api/auth/me、/api/user/cancel-deletion）中通过校验。
    // 修复：此前 toAccountStatus("deleting") 返回 ACTIVE，导致注销中的账号被当作正常用户放行，
    // 用户重新登录后可以正常操作系统（注销弹窗闪烁后即进入系统）。
    if (user.status === "deleting") {
      const requestPath =
        typeof (request as any)?.nextUrl?.pathname === "string"
          ? (request as any).nextUrl.pathname
          : "";
      const isDeletionRecoveryPath =
        requestPath === "/api/auth/me" ||
        requestPath === "/api/user/cancel-deletion" ||
        requestPath === "/auth/cancel-deletion";

      if (!isDeletionRecoveryPath) {
        return { valid: false, error: "ACCOUNT_DELETING" };
      }

      // 冷静期内仅放行状态查询/撤销流程（不发放业务会话权限），跳过常规状态机与空闲校验
      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email || "",
          name: user.name || "",
          role: user.role,
          status: user.status,
        },
      };
    }

    // 1. 自动解封过期的临时封禁（C-03：临时封禁 5 分钟后自动恢复 ACTIVE）
    if (
      user.status === "banned" &&
      user.bannedUntil &&
      new Date(user.bannedUntil) <= new Date()
    ) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: "active",
          bannedUntil: null,
        },
      });
      user.status = "active";
    }

    // 2. 账号状态机语义校验（PRD I-05 / 模块 C）
    const accountStatus = toAccountStatus(user.status);
    // 2a. 永久封禁：禁止登录、刷新、任何接口访问（C-02）
    if (isFullyBlocked(accountStatus)) {
      return { valid: false, error: "ACCOUNT_DISABLED" };
    }
    // 2b. 登录禁用 / 临时封禁：禁止登录与刷新（C-01）
    if (isLoginBlocked(accountStatus)) {
      return { valid: false, error: "ACCOUNT_DISABLED" };
    }

    // 3. 系统维护模式（G-02）：维护中全局拦截
    if (await isMaintenanceMode()) {
      return { valid: false, error: "MAINTENANCE_MODE" };
    }

    // 4. 密码过期强制拦截（C-04）：全局拦截，未改密前禁止访问业务接口
    if (user.passwordExpireDate && new Date(user.passwordExpireDate) <= new Date()) {
      return { valid: false, error: "PASSWORD_EXPIRED" };
    }

    // 5. Session 挤线校验 (MULTI_LOGIN_CONFLICT, B-02)
    if (jwtSessionToken && jwtSessionToken !== user.sessionToken) {
      return { valid: false, error: "MULTI_LOGIN_CONFLICT" };
    }

    // 6. 强制下线判定校验 (FORCED_LOGOUT, D-04)
    if (user.lastForcedLogoutAt) {
      const lastForcedLogoutAtTime = new Date(user.lastForcedLogoutAt).getTime();
      const issuedAtTime = jwtIssuedAtStr ? new Date(jwtIssuedAtStr).getTime() : 0;
      if (issuedAtTime < lastForcedLogoutAtTime) {
        return { valid: false, error: "FORCED_LOGOUT" };
      }
    }

    // 7. 绝对硬性超时校验（A-02/A-03）：不可滑动续期，到期即失效
    if (user.sessionExpiresAt) {
      if (new Date(user.sessionExpiresAt).getTime() <= Date.now()) {
        return { valid: false, error: "SESSION_EXPIRED" };
      }
    }

    // 8. 空闲超时校验：超过 IDLE_TIMEOUT_MS 无活动则失效（A-01）
    //    注意：lastActivityAt 仅由前端真实操作时更新，后端不自动刷新。
    if (user.lastActivityAt) {
      const idleMs = Date.now() - new Date(user.lastActivityAt).getTime();
      if (idleMs > IDLE_TIMEOUT_MS) {
        return { valid: false, error: "IDLE_TIMEOUT" };
      }
    }

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email || "",
        name: user.name || "",
        role: user.role,
        status: user.status,
      },
    };
  } catch (jwtError) {
    console.error("validateUser JWT verify failed:", jwtError);
    return { valid: false, error: "INVALID_TOKEN" };
  }
}

export function isAdmin(user: AuthenticatedUser): boolean {
  const adminRoles = [
    "admin",
    "super_admin",
    "superadmin",
    "ADMIN",
    "SUPERADMIN",
    "SUPER_ADMIN",
  ];
  return adminRoles.includes(user.role);
}

export function isAdminRole(role: string): boolean {
  const adminRoles = [
    "admin",
    "super_admin",
    "superadmin",
    "ADMIN",
    "SUPERADMIN",
    "SUPER_ADMIN",
  ];
  return adminRoles.includes(role);
}

export function isSuperAdminRole(role: string): boolean {
  const superAdminRoles = [
    "super_admin",
    "superadmin",
    "SUPERADMIN",
    "SUPER_ADMIN",
    "SuperAdmin",
  ];
  return superAdminRoles.includes(role);
}

/**
 * 全局认证检查：检查用户是否在数据库中存在
 * 用于前端页面在加载时进行认证验证
 */
export async function checkUserExists(userId: string): Promise<{
  exists: boolean;
  isActive: boolean;
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      return { exists: false, isActive: false };
    }

    return { exists: true, isActive: user.status === "active" };
  } catch (error) {
    console.error("检查用户存在性失败:", error);
    return { exists: false, isActive: false };
  }
}
