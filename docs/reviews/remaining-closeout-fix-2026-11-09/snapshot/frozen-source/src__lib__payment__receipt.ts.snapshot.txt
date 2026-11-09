/**
 * 收款事实的严格解析与持久唯一认领键（U04 / 原 5）。
 *
 * 设计意图：
 * - 金额按「安全整数 + 协议精度」解析，禁止 Math.round 吞掉 10.004 这类多余精度，
 *   也禁止指数/NaN/Infinity/负数/超安全范围。
 * - 认领键绑定渠道 + 商户语境 + 网关交易号：同字符串不同渠道是合法的不同收款，
 *   不能误判冲突；同一渠道同一交易号无论落到哪个订单，最多只允许一次履约。
 */

/** 支付宝金额（元）严格转分：仅接受 ^\d+(\.\d{1,2})?$，多余精度一律拒绝而非四舍五入 */
export function parseYuanToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(s)) return null;
  const [yuan, frac = ""] = s.split(".");
  const cents = Number(yuan) * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

/** 微信金额（分）严格校验：必须是正的安全整数，不接受小数/字符串/NaN/Infinity */
export function parseCents(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) return null;
  return raw;
}

export function isSafeAmountCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * 持久唯一认领键：渠道 + 商户语境 + 网关交易号。
 * 使用 billingrecord.id 主键落一条 type=GATEWAY_RECEIPT_CLAIM 的认领记录，
 * 依赖数据库主键唯一约束在并发下裁决唯一履约权（P2002 即败者）。
 */
export function receiptClaimId(channel: string, merchantContext: string | null | undefined, transactionId: string): string {
  const scope = (merchantContext || "default").replace(/::/g, ":");
  return `receipt-claim::${channel}::${scope}::${transactionId}`;
}

export const RECEIPT_CLAIM_TYPE = "GATEWAY_RECEIPT_CLAIM";
