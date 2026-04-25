import prisma from "@/lib/prisma";
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

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "密码长度至少为 8 位" };
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
    return { valid: false, error: "未授权访问" };
  }

  const userId = authHeader.replace("Bearer ", "");
  
  // 验证用户是否在数据库中存在
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
    return { valid: false, error: "用户不存在" };
  }

  // 检查用户状态
  if (user.status !== "active") {
    return { valid: false, error: "用户账号已被禁用" };
  }

  return { 
    valid: true, 
    user: {
      id: user.id,
      email: user.email || "",
      name: user.name || "",
      role: user.role,
      status: user.status,
    }
  };
}

export function isAdmin(user: AuthenticatedUser): boolean {
  return user.role === "admin" || user.role === "super_admin";
}
