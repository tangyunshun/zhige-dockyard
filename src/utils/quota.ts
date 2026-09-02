/**
 * 算力额度展示与无限语义的纯前端工具（不依赖 prisma，可安全在客户端组件中使用）。
 *
 * 全局口径：tokenBalance / tokenLimit 中的 -1 表示「无限额度」，
 * 与系统现有「storageLimit / apiCallsLimit = -1 表示无限」的口径保持一致。
 */

/** 无限额度的统一标记值（与数据库 BigInt(-1) 对应） */
export const UNLIMITED_TOKEN = -1;

/** 判断算力额度/余额是否为无限（-1） */
export function isUnlimitedToken(
  value: number | bigint | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  return Number(value) === UNLIMITED_TOKEN;
}

/**
 * 格式化算力额度展示：
 * - 无限（-1）返回「无限」
 * - 其余按千分位展示
 */
export function formatTokenBalance(
  value: number | bigint | null | undefined,
): string {
  if (isUnlimitedToken(value)) return "无限";
  const n = value == null ? 0 : Number(value);
  return n.toLocaleString("zh-CN");
}
