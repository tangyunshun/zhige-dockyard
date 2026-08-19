/**
 * 账号自主注销（D-02）
 *
 * 流程：用户申请注销 -> 进入可配置的冷静期（默认 7 天，systemconfig 可调）-> 冷静期结束
 * 后「确认」生效，异步执行最终注销：
 *   1. 逻辑删除账号（status = "deleted"）
 *   2. 匿名化邮箱/手机号（加随机后缀，避免与唯一约束冲突）
 *   3. 清空个人配置表（userpreference）
 *   4. 销毁数据库中的全部会话记录
 * 操作不可恢复。
 *
 * 由于本仓库为单体 Next.js（无独立队列/调度器），「异步执行」以惰性执行（lazy）落地：
 * 在登录、鉴权、撤销等入口调用 maybeFinalizeDeletionIfDue，到期即触发最终注销。
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** systemconfig 中冷静期天数的配置 key */
export const DELETION_COOLDOWN_CONFIG_KEY = "account_deletion_cooldown_days";
/** 默认冷静期天数（D-02：7 天，可由管理员配置） */
export const DEFAULT_DELETION_COOLDOWN_DAYS = 7;
/** 配置允许的范围（1 ~ 90 天） */
const COOLDOWN_DAYS_MIN = 1;
const COOLDOWN_DAYS_MAX = 90;
/** 配置缓存时长（毫秒） */
const CONFIG_CACHE_TTL_MS = 60 * 1000;

let cachedDays: number | null = null;
let cachedAt = 0;

/** 读取可配置的注销冷静期天数（默认 7 天），带 60s 缓存 */
export async function getDeletionCooldownDays(): Promise<number> {
  if (cachedDays !== null && Date.now() - cachedAt < CONFIG_CACHE_TTL_MS) {
    return cachedDays;
  }
  let days = DEFAULT_DELETION_COOLDOWN_DAYS;
  try {
    const row = await prisma.systemconfig.findUnique({
      where: { key: DELETION_COOLDOWN_CONFIG_KEY },
    });
    if (row?.value) {
      const parsed = Number(row.value);
      if (Number.isFinite(parsed) && parsed >= COOLDOWN_DAYS_MIN && parsed <= COOLDOWN_DAYS_MAX) {
        days = Math.floor(parsed);
      }
    }
  } catch (e) {
    console.warn("[账号注销] 读取冷静期配置失败，使用默认值", e);
  }
  cachedDays = days;
  cachedAt = Date.now();
  return days;
}

/** 冷静期毫秒数 */
export async function getDeletionCooldownMs(): Promise<number> {
  return (await getDeletionCooldownDays()) * 24 * 60 * 60 * 1000;
}

/** 管理员修改冷静期配置后主动失效缓存 */
export function invalidateDeletionCooldownCache(): void {
  cachedDays = null;
  cachedAt = 0;
}

/** 生成匿名化随机后缀（时间戳 + 随机字节，保证唯一性） */
function randomSuffix(): string {
  return `${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * 执行最终注销（D-02，不可恢复）：
 * 逻辑删除账号 + 匿名化邮箱/手机号 + 清空个人配置 + 销毁全部会话。
 * 幂等：账号已为 deleted 时直接返回 true。
 */
export async function finalizeAccountDeletion(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true, phone: true },
    });
    if (!user) return false;
    if (user.status === "deleted") return true; // 已注销，视为成功

    const suffix = randomSuffix();

    // 1+2. 逻辑删除账号并匿名化邮箱/手机号（加随机后缀，避免唯一约束冲突）
    // 4. 同步清空全部会话令牌（销毁会话）
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "deleted",
        deletionRequestedAt: null,
        email: user.email ? `deleted_${suffix}@anonymized.invalid` : null,
        phone: user.phone ? `deleted_${suffix}` : null,
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        refreshTokenPrev: null,
      },
    });

    // 3. 清空个人配置表
    await prisma.userpreference.deleteMany({ where: { userId } });

    // 4. 销毁数据库中的全部会话记录
    await prisma.usersession.deleteMany({ where: { userId } });

    // 审计日志
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        action: "ACCOUNT_DELETED",
        resource: "user/account",
        details: { type: "user_deletion_finalized", reason: "cooldown_elapsed" },
      },
    });

    console.log(`[账号注销] 用户 ${userId} 冷静期结束，已执行最终注销（不可恢复）`);
    return true;
  } catch (e) {
    console.error("[账号注销] 最终注销执行失败:", e);
    return false;
  }
}

/**
 * 惰性执行：若账号处于 "deleting" 且冷静期已过，则立即执行最终注销。
 * 在登录、鉴权、撤销注销等入口调用，模拟「确认后异步执行」。
 */
export async function maybeFinalizeDeletionIfDue(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletionRequestedAt: true },
    });
    if (!user || user.status !== "deleting" || !user.deletionRequestedAt) return false;
    if (new Date(user.deletionRequestedAt).getTime() > Date.now()) return false;
    return await finalizeAccountDeletion(userId);
  } catch (e) {
    console.error("[账号注销] 惰性执行最终注销失败:", e);
    return false;
  }
}
