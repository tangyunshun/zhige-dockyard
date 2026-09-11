/**
 * 算力点 ↔ 人民币 统一换算规则（全系统唯一数据源）
 *
 * 业务规则：10 算力点 = 0.1 元
 * 由此推导：
 *   - 1 算力点 = 0.01 元
 *   - 100 算力点 = 1 元
 *   - 1 元 = 100 算力点
 *
 * 涉及「算力点数量」与「人民币金额」双向换算的任何地方，都必须调用本模块，
 * 严禁在页面/接口中自行硬编码汇率，避免口径不一致。
 *
 * 概念边界（全系统统一口径）：
 *   - 「算力点」是本平台唯一的【计量与计费货币】，用户级钱包(pointwallet)/空间余额(tokenBalance)/
 *     会员额度(tokenLimit) 均属同一币种，最终应以 pointledger 流水总账为唯一真源。
 *   - 「模型 Token」是 AI 实际输入/输出的用量度量。全系统统一换算口径：
 *     **1 个模型 Token = 1 个算力点（1:1）**，用户只需理解「算力点」一种单位。
 *   - token 的【计费成本】取决于所用厂商的官方单价（DeepSeek / 智谱 / OpenAI …），
 *     不同厂商按各自价格折算扣点，统一由 @/lib/model-rate 的折算引擎负责，
 *     禁止在页面或接口中自行硬编码厂商价格。
 */

/** 1 元可兑换的算力点数量 */
export const POINTS_PER_YUAN = 100;

/** 单个算力点对应的人民币金额（元） */
export const YUAN_PER_POINT = 0.01;

/** 规则简写，用于空间紧凑的展示位 */
export const POINT_RATE_TEXT = "10 算力点 = 0.1 元";

/** 规则完整说明，用于说明性文案与提示条 */
export const POINT_RATE_HINT =
  "统一换算规则：10 算力点 = 0.1 元（即 100 算力点 = 1 元，1 算力点 = 0.01 元）";

/**
 * 单位口径说明（用户可见）：把「模型 token」与「算力点」的关系一次讲清。
 * 用于定价页、充值页、组件分发面板等需要解释单位的位置。
 */
export const POINT_UNIT_HINT =
  "全系统统一使用「算力点」计量：1 个模型 token = 1 个算力点，100 算力点 = 1 元。不同 AI 厂商（DeepSeek / 智谱 / OpenAI 等）按各自官方价折算扣点。";

/** 算力点 ➔ 人民币金额（元） */
export function pointsToYuan(points: number | bigint | null | undefined): number {
  const n = typeof points === "bigint" ? Number(points) : Number(points);
  if (!Number.isFinite(n)) return 0;
  return n / POINTS_PER_YUAN;
}

/** 人民币金额（元） ➔ 算力点 */
export function yuanToPoints(yuan: number | null | undefined): number {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * POINTS_PER_YUAN);
}

/**
 * 把算力点格式化为人民币金额字符串，如 5 点 ➔ "¥0.05"，500000 点 ➔ "¥5,000.00"
 */
export function formatYuanFromPoints(points: number | bigint | null | undefined): string {
  const yuan = pointsToYuan(points);
  return `¥${yuan.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 计算算力包的点单价（元/点），用于展示「每点成本」
 */
export function unitPricePerPoint(points: number, priceYuan: number): number {
  const p = Number(points);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const yuan = Number(priceYuan);
  if (!Number.isFinite(yuan)) return 0;
  return yuan / p;
}

/** 算力点 ➔ 人民币「分」（1 算力点 = 0.01 元 = 1 分） */
export function pointsToCents(points: number | bigint | null | undefined): number {
  return Math.round(pointsToYuan(points) * 100);
}

/** 人民币「分」 ➔ 元 */
export function centsToYuan(cents: number | null | undefined): number {
  const c = Number(cents);
  if (!Number.isFinite(c)) return 0;
  return c / 100;
}

/**
 * 按算力点与人民币比率换算「月付参考价」（单位：分）：算力点数量即分数
 * 例：100,000 点 ➔ 100,000 分 = ¥1,000.00
 * 说明：算力点已改为充值/加油包制、不再随会员等级按月赠送，该换算仅用于定价参考。
 * 无限制(-1) 返回 0（需人工定价）。
 */
export function monthlyCentsFromPoints(
  points: number | bigint | null | undefined
): number {
  const p = typeof points === "bigint" ? Number(points) : Number(points);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return pointsToCents(p);
}

/**
 * 按算力点与人民币比率换算「年付参考价」（单位：分），默认按 12 个月折算
 */
export function yearlyCentsFromPoints(
  points: number | bigint | null | undefined,
  months: number = 12
): number {
  return monthlyCentsFromPoints(points) * months;
}

/**
 * 判断某个算力包定价是否符合统一规则（允许 1 分钱级别的浮点误差）
 */
export function isPriceMatchingRule(points: number, priceYuan: number): boolean {
  return Math.abs(Number(priceYuan) - pointsToYuan(points)) < 0.011;
}

/**
 * 按会员折扣百分比计算优惠后金额（元），保留 2 位小数。
 * discountPercent 语义为「立减百分比」：10 → 9 折，20 → 8 折。
 * 折扣非法或 <= 0 时原价返回。
 */
export function applyMemberDiscount(
  priceYuan: number | null | undefined,
  discountPercent: number | null | undefined
): number {
  const p = Number(priceYuan);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const d = Number(discountPercent);
  if (!Number.isFinite(d) || d <= 0) return p;
  const off = Math.min(Math.max(d, 0), 100);
  if (off >= 100) return 0;
  return Math.round(p * (100 - off)) / 100;
}

/**
 * 按会员折扣百分比计算优惠后金额（分），供后端结算/账单使用（整数分，无浮点误差）。
 */
export function discountedCents(
  priceYuan: number | null | undefined,
  discountPercent: number | null | undefined
): number {
  const p = Number(priceYuan);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const d = Number(discountPercent);
  if (!Number.isFinite(d) || d <= 0) return Math.round(p * 100);
  const off = Math.min(Math.max(d, 0), 100);
  if (off >= 100) return 0;
  return Math.round(p * (100 - off));
}

/**
 * 折扣百分比 ➔ 中文折扣文案：10 → "9 折"，15 → "8.5 折"，20 → "8 折"。
 * 无折扣时返回 null。
 */
export function formatDiscountLabel(
  discountPercent: number | null | undefined
): string | null {
  const d = Number(discountPercent);
  if (!Number.isFinite(d) || d <= 0 || d >= 100) return null;
  const pay = (100 - d) / 10;
  return `${pay % 1 === 0 ? pay : pay.toFixed(1)} 折`;
}
