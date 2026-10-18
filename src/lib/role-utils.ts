// 角色判定统一工具（纯函数，客户端与服务端均可安全引入，不依赖 prisma / jose 等服务端模块）。
// 全库所有「是否为管理员 / 超级管理员」「角色归一化」的判断都收口到这里，
// 杜绝各文件各自硬编码变体清单导致漏判（如库里存 "superadmin" 却只判断了 "super_admin"）。

// 去掉 Spring Security / Shiro 等常见的 ROLE_ 前缀，归一到统一判定（ROLE_ADMIN -> ADMIN）
function stripRolePrefix(r: string): string {
  return r.replace(/^role_/i, "");
}

// 超级管理员系列
export const SUPER_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "SUPERADMIN",
  "superadmin",
  "super_admin",
  "Superadmin",
  "Super_admin",
  "ROLE_SUPER_ADMIN",
  "ROLE_SUPERADMIN",
] as const;

// 标准管理员系列（不含超级管理员）
export const ADMIN_ROLES = [
  "ADMIN",
  "admin",
  "Admin",
  "ADMINISTRATOR",
  "PLATFORM_ADMIN",
  "platform_admin",
  "ROLE_ADMIN",
] as const;

// 全变体集合：用于 Prisma `in` / `notIn` 等必须穷举字面量的场景
export const ADMIN_ROLE_VALUES = [
  "admin",
  "super_admin",
  "superadmin",
  "ADMIN",
  "SUPER_ADMIN",
  "SUPERADMIN",
  "Superadmin",
  "Super_admin",
  "ADMINISTRATOR",
  "PLATFORM_ADMIN",
  "platform_admin",
  "super-admin",
  "ROLE_ADMIN",
  "ROLE_SUPER_ADMIN",
  "ROLE_SUPERADMIN",
  "Admin",
  "SuperAdmin",
] as const;

// ===== 类型定义（单一来源）=====
/** 所有可能的管理员角色字面量变体（由 ADMIN_ROLE_VALUES 推导，保证与运行期集合完全一致） */
export type RoleVariant = (typeof ADMIN_ROLE_VALUES)[number];

/** 归一化后的规范角色：超管与管理员归一成这两个值 */
export type NormalizedRole = "admin" | "superadmin";

/**
 * 用户角色类型：开放联合，既接收归一化后的 "admin"/"superadmin"，
 * 也容纳其它业务角色（user / creator / developer / 企业空间成员角色等），避免误伤。
 * 判断「是否为管理员」一律走 role-utils 的 isAdminRole 等函数，不要直接拿字面量比较。
 */
export type UserRole = NormalizedRole | (string & {});

export function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false;
  let raw = String(role).trim();
  raw = stripRolePrefix(raw); // ROLE_SUPER_ADMIN -> SUPER_ADMIN
  if ((SUPER_ADMIN_ROLES as readonly string[]).includes(raw)) return true;
  const lower = raw.toLowerCase().replace(/-/g, "_");
  if (lower === "super_admin" || lower === "superadmin" || lower === "super" || lower === "super_admin_role") {
    return true;
  }
  const upper = raw.toUpperCase();
  return upper === "SUPER_ADMIN" || upper === "SUPERADMIN" || upper === "SUPER_ADMIN_ROLE" || upper === "SUPER";
}

/** 检查是否为标准管理员（不含超级管理员） */
export function isStandardAdminRole(role?: string | null): boolean {
  if (!role) return false;
  let raw = String(role).trim();
  raw = stripRolePrefix(raw); // ROLE_ADMIN -> ADMIN
  if ((ADMIN_ROLES as readonly string[]).includes(raw)) return true;
  const lower = raw.toLowerCase().replace(/-/g, "_");
  if (lower === "admin" || lower === "administrator" || lower === "platform_admin") return true;
  const upper = raw.toUpperCase();
  return (upper === "ADMIN" || upper === "ADMINISTRATOR") && !isSuperAdminRole(role);
}

/** 具备管理特权（包含超级管理员与管理员） */
export function isAdminRole(role?: string | null): boolean {
  return isSuperAdminRole(role) || isStandardAdminRole(role);
}

/**
 * 将任意角色变体归一化为规范写法：
 * - 超级管理员系列 -> "superadmin"
 * - 管理员系列     -> "admin"
 * - 其余原样返回
 * 统一在「角色进入系统的边界」（validateUser / dashboard / /api/auth/me / 客户端用户信息）调用，
 * 确保下游无论用哪种写法比较都能命中。
 */
export function normalizeUserRole(role?: string | null): UserRole {
  if (!role) return "";
  let r = String(role).trim();
  r = stripRolePrefix(r); // ROLE_ADMIN -> ADMIN
  const lower = r.toLowerCase().replace(/-/g, "_");
  if (lower === "super_admin" || lower === "superadmin" || lower === "super" || lower === "super_admin_role") {
    return "superadmin";
  }
  if (lower === "admin" || lower === "administrator" || lower === "platform_admin") {
    return "admin";
  }
  return r.trim();
}
