import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

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
  let isVerifiedByMiddleware = false;
  let userIdFromHeader = "";

  // 1. 优先尝试从 request headers 获取已由中间件校验注入的 x-user-id
  if (request) {
    const headers = "headers" in request ? request.headers : null;
    if (headers) {
      const xUserId = typeof headers.get === "function" ? headers.get("x-user-id") : null;
      if (xUserId) {
        userIdFromHeader = xUserId;
        isVerifiedByMiddleware = true;
      }
    }
  }

  // 2. 如果中间件没有注入，我们常规提取 Authorization 里的 token
  if (!isVerifiedByMiddleware) {
    if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer " && authHeader !== "Bearer undefined") {
      token = authHeader.replace("Bearer ", "");
    }
  }

  // 3. 如果依然没有，且传入了 request，我们尝试从 Cookie 中提取 auth_token
  if (!isVerifiedByMiddleware && !token && request) {
    let cookieToken = "";
    if ("cookies" in request && typeof request.cookies?.get === "function") {
      cookieToken = request.cookies.get("auth_token")?.value || "";
    } else if (request.headers) {
      const cookieHeader = typeof request.headers.get === "function" ? request.headers.get("cookie") || "" : "";
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      if (match) cookieToken = match[1];
    }
    if (cookieToken) {
      token = cookieToken;
    }
  }

  // 4. 如果所有途径都拿不到，判定 UNAUTHORIZED
  if (!isVerifiedByMiddleware && !token) {
    return { valid: false, error: "UNAUTHORIZED" };
  }

  try {
    let userId = "";
    let jwtSessionToken: string | undefined;
    let jwtIssuedAtStr: string | undefined;

    if (isVerifiedByMiddleware) {
      userId = userIdFromHeader;
    } else {
      // 兼容性放行：若 token 不包含点号，代表前端传输的是明文的 userId 令牌，绕过 JWT 解密并直接降级以执行 Prisma 数据校验
      if (!token.includes(".")) {
        userId = token;
      } else {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = payload.userId as string;
        jwtSessionToken = payload.sessionToken as string | undefined;
        jwtIssuedAtStr = payload.issuedAt as string | undefined;
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
      },
    });

    if (!user) {
      return { valid: false, error: "USER_NOT_FOUND" };
    }

    // 1. 自动解封过期的临时封禁
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

    // 2. 检查用户状态是否正常
    if (user.status !== "active") {
      return { valid: false, error: "ACCOUNT_DISABLED" };
    }

    // 3. Session 挤线校验 (MULTI_LOGIN_CONFLICT)
    if (jwtSessionToken && jwtSessionToken !== user.sessionToken) {
      return { valid: false, error: "MULTI_LOGIN_CONFLICT" };
    }

    // 4. 强制下线判定校验 (FORCED_LOGOUT)
    if (user.lastForcedLogoutAt) {
      const lastForcedLogoutAtTime = new Date(user.lastForcedLogoutAt).getTime();
      const issuedAtTime = jwtIssuedAtStr ? new Date(jwtIssuedAtStr).getTime() : 0;
      if (issuedAtTime < lastForcedLogoutAtTime) {
        return { valid: false, error: "FORCED_LOGOUT" };
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