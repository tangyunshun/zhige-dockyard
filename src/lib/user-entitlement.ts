import { isSuperAdminRole } from "@/lib/auth";
import type { MembershipLevel } from "@/lib/membership";
import { normalizePlan, type WorkspacePlanKey } from "@/constants/workspace-plans";

/**
 * 超级管理员权益兜底：超级管理员默认享有最高会员等级与旗舰版空间套餐，
 * 无论其在数据库中实际存储的 membershipLevel / 空间 plan 是什么。
 *
 * 说明：这是「展示与判定」层面的统一兜底（登录态、空间套餐页等），
 * 不改写数据库；保证超级管理员在系统各处被视为最高权益，无需逐条手动赋权。
 */

/** 超级管理员默认会员等级：皇冠版（最高档） */
export const SUPER_ADMIN_MEMBERSHIP_LEVEL: MembershipLevel = "CROWN";

/** 超级管理员默认空间套餐：旗舰版（ENTERPRISE，最高档） */
export const SUPER_ADMIN_WORKSPACE_PLAN: WorkspacePlanKey = "ENTERPRISE";

/**
 * 解析「生效会员等级」：超级管理员一律返回最高等级，其余原样返回（空值回落免费版）。
 */
export function resolveEffectiveMembershipLevel(
  role?: string | null,
  storedLevel?: string | null,
): MembershipLevel {
  if (isSuperAdminRole(role || "")) return SUPER_ADMIN_MEMBERSHIP_LEVEL;
  return ((storedLevel as MembershipLevel) || "FREE");
}

/**
 * 解析「生效空间套餐」：超级管理员一律返回旗舰版，其余按数据库值归一化。
 */
export function resolveEffectiveWorkspacePlan(
  role?: string | null,
  storedPlan?: string | null,
): WorkspacePlanKey {
  if (isSuperAdminRole(role || "")) return SUPER_ADMIN_WORKSPACE_PLAN;
  return normalizePlan(storedPlan);
}
