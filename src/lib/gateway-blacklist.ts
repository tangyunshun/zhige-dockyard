import { prisma } from "@/lib/prisma";

/**
 * E-03 网关黑名单（DB 持久化）
 *
 * PRD 原意将网关黑名单存 Redis，本仓库以 MySQL gatewayblacklist 表等价实现：
 * - 支持按 IP / userId 拉黑，带过期时间
 * - 每次检查直接查库（带索引），保证多实例一致；同时提供清理过期记录能力
 */

export type BlacklistType = "ip" | "user";

export interface BlacklistCheckResult {
  blocked: boolean;
  reason?: string;
  expireAt?: Date;
}

/**
 * 检查 IP 或用户是否在网关黑名单中且未过期
 */
export async function isBlacklisted(
  type: BlacklistType,
  target: string
): Promise<BlacklistCheckResult> {
  if (!target) return { blocked: false };

  const record = await prisma.gatewayblacklist.findFirst({
    where: { type, target, expireAt: { gt: new Date() } },
  });

  if (!record) return { blocked: false };
  return { blocked: true, reason: record.reason || undefined, expireAt: record.expireAt };
}

/**
 * 将 IP / 用户加入网关黑名单（minutes 分钟后自动过期）
 */
export async function blockTarget(
  type: BlacklistType,
  target: string,
  minutes: number,
  reason?: string
): Promise<void> {
  await prisma.gatewayblacklist.create({
    data: {
      type,
      target,
      reason: reason || null,
      expireAt: new Date(Date.now() + minutes * 60 * 1000),
    },
  });
}

/**
 * 从网关黑名单移除（解封）
 */
export async function unblockTarget(type: BlacklistType, target: string): Promise<void> {
  await prisma.gatewayblacklist.deleteMany({ where: { type, target } });
}

/**
 * 清理全部已过期的黑名单记录（可定时调用）
 */
export async function purgeExpiredBlacklist(): Promise<number> {
  const result = await prisma.gatewayblacklist.deleteMany({
    where: { expireAt: { lte: new Date() } },
  });
  return result.count;
}

/**
 * 登录链路统一前置风控：IP 黑名单命中 → 拒绝登录
 */
export async function checkGatewayBlacklist(ip: string): Promise<BlacklistCheckResult> {
  return isBlacklisted("ip", ip);
}
