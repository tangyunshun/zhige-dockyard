import { prisma } from "@/lib/prisma";

/**
 * 邀请加入安全策略（唯一真源 = systemconfig，无需数据库迁移；未配置一律放行，保持向后兼容）。
 *
 * 设计目标（用户拍板）：把「企业空间邀请加入」做得既安全又不反人类——
 *   - 不再「一人一码」，而是「一个可复用码 + 域名白名单 + 次数上限」，一次拉一群人也只生成一个码；
 *   - 平台超管/管理员是否允许被邀请进空间，做成开关（默认允许，符合「超管/管理员可靠自建或受邀加入」规则）。
 *
 * 配置键（systemconfig）：
 *   invite_allowed_email_domains  逗号分隔域名（如 company.com,abc.cn）；空=不限域名
 *   invite_max_uses_per_code      每个邀请码最多可加入人数；0/空=不限（按 JOIN_WORKSPACE 日志计数）
 *   invite_block_platform_admins  "1"=禁止平台超管/管理员通过邀请加入；其他=允许（默认）
 *   invite_allow_admin_role       "0"=邀请只能给 MEMBER；"1"=可给 ADMIN（默认）
 */

const KEY_ALLOWED_DOMAINS = "invite_allowed_email_domains";
const KEY_MAX_USES = "invite_max_uses_per_code";
const KEY_BLOCK_ADMINS = "invite_block_platform_admins";
const KEY_ALLOW_ADMIN_ROLE = "invite_allow_admin_role";

export interface InvitePolicy {
  /** 允许加入的邮箱域名（空数组=不限） */
  allowedDomains: string[];
  /** 每个邀请码最多可加入人数（0=不限） */
  maxUsesPerCode: number;
  /** 是否禁止平台超管/管理员通过邀请加入 */
  blockPlatformAdmins: boolean;
  /** 是否允许把成员邀请成 ADMIN（false=只能 MEMBER） */
  allowAdminRole: boolean;
}

/** 平台管理员/超级管理员角色集合（大小写不敏感判定由 isPlatformAdminRole 处理） */
const PLATFORM_ADMIN_ROLE_SET = new Set([
  "admin",
  "super_admin",
  "superadmin",
  "super-admin",
]);

export function isPlatformAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ADMIN_ROLE_SET.has(role.trim().toLowerCase());
}

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function parseMaxUses(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0; // 0=不限
  return Math.floor(n);
}

let cache: { policy: InvitePolicy; at: number } | null = null;
const CACHE_MS = 60_000;

/** 读取邀请策略（60s 缓存；管理员改配置后最长 1 分钟生效） */
export async function getInvitePolicy(force = false): Promise<InvitePolicy> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.policy;
  let policy: InvitePolicy = {
    allowedDomains: [],
    maxUsesPerCode: 0,
    blockPlatformAdmins: false,
    allowAdminRole: true,
  };
  try {
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: [KEY_ALLOWED_DOMAINS, KEY_MAX_USES, KEY_BLOCK_ADMINS, KEY_ALLOW_ADMIN_ROLE] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    policy = {
      allowedDomains: parseDomains(map.get(KEY_ALLOWED_DOMAINS)),
      maxUsesPerCode: parseMaxUses(map.get(KEY_MAX_USES)),
      blockPlatformAdmins: map.get(KEY_BLOCK_ADMINS) === "1",
      allowAdminRole: map.get(KEY_ALLOW_ADMIN_ROLE) !== "0", // 默认允许
    };
  } catch {
    /* 读配置失败时保留默认放行，绝不因策略读取故障阻断正常邀请 */
  }
  cache = { policy, at: Date.now() };
  return policy;
}

/** 邮箱域名是否被允许（未配置白名单=不限） */
export function emailDomainAllowed(email: string | null | undefined, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  if (!email || !email.includes("@")) return false; // 启用白名单但无邮箱 → 不允许
  const domain = email.split("@").pop()!.toLowerCase();
  return allowedDomains.includes(domain);
}

export interface InviteEligibility {
  ok: boolean;
  error?: string;
}

/**
 * 校验「某用户能否通过邀请加入」：平台管理员开关 + 域名白名单。
 * 在 join / verify 处调用（此时才知道加入者是谁）。
 */
export function checkInviteEligibility(
  user: { email?: string | null; role?: string | null } | null | undefined,
  policy: InvitePolicy,
): InviteEligibility {
  if (policy.blockPlatformAdmins && isPlatformAdminRole(user?.role)) {
    return { ok: false, error: "平台管理员/超级管理员不可通过邀请加入空间" };
  }
  if (!emailDomainAllowed(user?.email, policy.allowedDomains)) {
    return {
      ok: false,
      error: `该空间仅限以下邮箱域名加入：@${policy.allowedDomains.join("、@")}`,
    };
  }
  return { ok: true };
}

export const INVITE_POLICY_KEYS = {
  KEY_ALLOWED_DOMAINS,
  KEY_MAX_USES,
  KEY_BLOCK_ADMINS,
  KEY_ALLOW_ADMIN_ROLE,
};
