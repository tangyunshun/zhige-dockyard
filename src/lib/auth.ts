import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

export async function validateUser(authHeader: string | null): Promise<{
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}> {
  // 检查 authorization header
  if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
    return { valid: false, error: "UNAUTHORIZED" };
  }

  const userId = authHeader.replace("Bearer ", "");

  // 验证用户是否在数据库中存储
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    return { valid: false, error: "USER_NOT_FOUND" };
  }

  // 检查用户状态
  if (user.status !== "active") {
    return { valid: false, error: "ACCOUNT_DISABLED" };
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