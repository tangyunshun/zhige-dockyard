import { prisma } from "@/lib/prisma";

/**
 * 算力额度（token）相关服务端统一工具。
 *
 * 设计原则：
 * - 任何「初始化 tokenBalance」或「校验额度」场景，tokenLimit 一律从 membershiplevel 表
 *   真实读取，禁止在业务代码里写死 FREE/GOLD/其它 档位数值（如 10000 / 50000 / 100000）。
 * - 若管理端调整了会员等级表，以数据库为准。
 * - 无限额度口径：tokenLimit = -1（BigInt）表示无限，与 storageLimit / apiCallsLimit 一致。
 */

/** 无限额度的统一标记值（BigInt 版，与前端 UNLIMITED_TOKEN = -1 对应） */
export const UNLIMITED_TOKEN = BigInt(-1);

/** 判断某会员等级的 tokenLimit 是否为无限（-1） */
export function isUnlimitedTokenLimit(tokenLimit: bigint | number | null | undefined): boolean {
  if (tokenLimit === null || tokenLimit === undefined) return false;
  return BigInt(tokenLimit) === UNLIMITED_TOKEN;
}

/**
 * 从 membershiplevel 表读取真实 tokenLimit（BigInt）。
 * 纯只读：不写库、不写死档位默认值。找不到等级时返回 0（表示未配置额度/未就绪），
 * 由运营补配置处理，不在此路径私自补发体验额度或覆盖真实配置。
 */
export async function getMembershipTokenLimit(
  membershipLevel?: string | null,
): Promise<bigint> {
  const level = membershipLevel || "FREE";
  const row = await prisma.membershiplevel.findUnique({ where: { id: level } });
  if (row?.tokenLimit != null) return BigInt(row.tokenLimit);
  return BigInt(0);
}
