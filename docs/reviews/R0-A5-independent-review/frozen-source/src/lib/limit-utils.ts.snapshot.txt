/**
 * 限额合并工具：多个来源的限额取上（不缩水），-1 表示「无限制」优先级最高。
 *
 * 用于「账号级会员等级基础限额」与「空间级扩容包限额」叠加：
 * 空间实际生效限额 = max(会员等级限额, 扩容包限额, 既有限额)，任一为 -1 即无限制。
 */
export function mergeLimits(
  ...values: (number | bigint | null | undefined)[]
): number {
  let unlimited = false;
  let max = -Infinity;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (n === -1) {
      unlimited = true;
    } else if (n > max) {
      max = n;
    }
  }
  if (unlimited) return -1;
  return max === -Infinity ? 0 : max;
}
