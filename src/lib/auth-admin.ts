import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// 管理员角色列表
const ADMIN_ROLES = [
  "admin",
  "super_admin",
  "superadmin",
  "ADMIN",
  "SUPERADMIN",
  "SUPER_ADMIN",
];

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

/**
 * 验证用户身份并检查是否为管理员
 * 返回：
 * - { valid: false, error: string } - 验证失败
 * - { valid: true, user: AuthenticatedUser } - 验证成功且是管理员
 * - { valid: true, user: AuthenticatedUser, isAdmin: false } - 验证成功但不是管理员
 */
export async function validateAdmin(request: NextRequest): Promise<{
  valid: boolean;
  user?: AuthenticatedUser;
  isAdmin?: boolean;
  error?: string;
}> {
  // 检查 authorization header
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
    return { valid: false, error: "UNAUTHORIZED" };
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // 验证 JWT Token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 从数据库获取用户信息
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

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email || "",
      name: user.name || "",
      role: user.role,
      status: user.status,
    };

    // 检查是否是管理员
    const isAdmin = ADMIN_ROLES.includes(user.role);

    return {
      valid: true,
      user: authenticatedUser,
      isAdmin,
    };
  } catch (error) {
    console.error("Token 验证失败:", error);
    return { valid: false, error: "INVALID_TOKEN" };
  }
}

/**
 * 检查用户是否是管理员角色
 */
export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * 验证普通用户（不检查管理员权限）
 */
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
