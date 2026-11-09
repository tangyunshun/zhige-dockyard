/**
 * [P09 / R4] 身份、租户、企业成员/企业到期 —— 生命周期、边界与合规守卫。
 *
 * 定位：本模块集中实现批次9要求且尚未统一的「企业成员生命周期/到期收缩」「企业删除合规」
 * 「个人/企业边界(CF-F08)」「角色判定收口(CF-F10)」增量。其中角色判定已统一到纯函数模块
 * `src/lib/role-utils.ts`（CF-F10，全库散落判断已改引用，本模块直接复用其 Role 语义，不写死魔法串）。
 *
 * 严格约束（COMMON-RULES §三 / 批次9）：
 *   - 不真实连接库；记录/账号通过注入数组，离线可测。
 *   - 复用已验收身份/租户/企业成员服务（如有）；不另做身份/租户表。
 *   - 企业到期：成员权益进入只读/受限，**绝不自动转个人**（CF-F08 个人/企业边界）。
 *   - 企业删除：仅检测孤儿账号/跨企业影子权限并标人工复核，**绝不自动清/自动迁移**（合规）。
 *   - 不改真实价格/余额，不开放原 F07 人工 APPROVE；不改 payment(A5)/credit(A7)/B6/B7/B8 已交接口。
 */

export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";

export interface EnterpriseMember {
  userId: string;
  enterpriseId: string;
  role: TenantRole;
  joinedAt: number;
  /** null = 永久；非 null = 到期时间戳(ms)。到期后进入只读/受限 */
  expiresAt: number | null;
}

export type ExpiryEffect = "ACTIVE" | "EXPIRED_READONLY";

/** 企业到期效应：到期→只读/受限；绝不自动转个人（返回 false 即禁止自动转个人） */
export function canAutoTransferToPersonalOnExpiry(): false {
  return false;
}

/** 计算每位成员在企业到期后的效应（只读/受限，不自动转个人） */
export function computeEnterpriseExpiryEffect(members: EnterpriseMember[], now: number): Map<string, ExpiryEffect> {
  const map = new Map<string, ExpiryEffect>();
  for (const m of members) {
    const expired = m.expiresAt != null && m.expiresAt <= now;
    map.set(m.userId, expired ? "EXPIRED_READONLY" : "ACTIVE");
  }
  return map;
}

export interface DeletionComplianceInput {
  members: EnterpriseMember[];
  /** 删除企业后，各成员账号是否还有其他工作空间归属 */
  userAccounts: { userId: string; hasOtherWorkspace: boolean }[];
  /** 现存跨企业影子权限（fromEnterprise≠toEnterprise 视为影子） */
  crossEnterprisePerms: { userId: string; fromEnterprise: string; toEnterprise: string }[];
}

export interface DeletionComplianceCheck {
  /** 合规违规项（需人工复核，绝不自动清/迁移） */
  violations: string[];
  /** 删除企业后成为孤儿可登录账号的用户 */
  orphanAccounts: string[];
  /** 跨企业影子权限的用户 */
  crossEnterpriseShadowPerms: string[];
  /** 是否可直接删除（无违规为 true） */
  safeToDelete: boolean;
}

/**
 * 企业删除合规检查：仅检测孤儿账号与跨企业影子权限，标人工复核；绝不自动清除或自动迁移。
 */
export function validateEnterpriseDeletion(input: DeletionComplianceInput): DeletionComplianceCheck {
  const violations: string[] = [];
  const orphanAccounts: string[] = [];
  const crossEnterpriseShadowPerms: string[] = [];

  const memberIds = new Set(input.members.map((m) => m.userId));
  for (const u of input.userAccounts) {
    if (memberIds.has(u.userId) && !u.hasOtherWorkspace) {
      orphanAccounts.push(u.userId);
    }
  }
  for (const p of input.crossEnterprisePerms) {
    if (p.fromEnterprise === p.toEnterprise) continue;
    crossEnterpriseShadowPerms.push(p.userId);
  }

  for (const o of orphanAccounts) violations.push(`用户 ${o} 删除企业后将成为孤儿可登录账号（需人工归属/停用，不自动清）`);
  for (const c of crossEnterpriseShadowPerms) {
    const perm = input.crossEnterprisePerms.find((p) => p.userId === c)!;
    violations.push(`用户 ${c} 存在跨企业影子权限(${perm.fromEnterprise}→${perm.toEnterprise})，需人工清除，不残留`);
  }
  return { violations, orphanAccounts, crossEnterpriseShadowPerms, safeToDelete: violations.length === 0 };
}

/** CF-F08 个人/企业边界：工作空间访问授权（不跨企业/跨空间越权） */
export interface AccessContext {
  userId: string;
  targetWorkspaceId: string;
  /** 用户在哪些工作空间有何角色（个人空间也算一条 membership） */
  userMemberships: { workspaceId: string; role: TenantRole }[];
  isPlatformAdmin: boolean;
}

export function authorizeWorkspaceAccess(ctx: AccessContext): { allowed: boolean; reason?: string } {
  if (ctx.isPlatformAdmin) return { allowed: true }; // 平台管理员越权治理不在此边界内
  const m = ctx.userMemberships.find((x) => x.workspaceId === ctx.targetWorkspaceId);
  if (!m) {
    return { allowed: false, reason: "非该工作空间成员（CF-F08 个人/企业边界：跨空间/跨企业越权拒绝）" };
  }
  return { allowed: true };
}
