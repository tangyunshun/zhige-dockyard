import { prisma } from "@/lib/prisma";

/**
 * 计费系统配置项（唯一真源为 systemconfig 表，后台可调，禁止写死在代码里）。
 *
 * 数值口径：
 * - 系数/费率一律以「基点 bps」整数存储（1 bp = 0.01%），禁止浮点；
 * - 加价系数 k 以 k×10000 存储：20000 = k 2.0（毛利 = 1 - 1/k = 50%）；
 * - 金额阈值以「分」为单位整数存储。
 */
export const BILLING_CONFIG_KEYS = {
  /** 加价系数 k（k×10000：20000 = 2.0）。支持按模型 markupRateBps 覆盖 */
  markupCoefficientBps: "billing.markupCoefficientBps",
  /** 自带模型（BYOK）服务费率（基点）：1500 = 15% */
  byokServiceRateBps: "billing.byokServiceRateBps",
  /** 新用户免费额度月数 */
  freeMonths: "billing.freeMonths",
  /** 新用户每月免费点数（算力点） */
  freePointsPerMonth: "billing.freePointsPerMonth",
  /** 点退现金转人工审核阈值（单位：分） */
  refundReviewThresholdCents: "billing.refundReviewThresholdCents",
  /** 单次执行保底扣点：计费 = max(按 Token 换算点数, minPointsPerTask) */
  minPointsPerTask: "billing.minPointsPerTask",
  /**
   * 用量校准表（JSON）：{ "C01": {"in":1209,"out":2939}, ... }
   * 数值为「真实历史 SUCCESS 任务 usage 均值」，由只读脚本统计产出，禁止人工凭空填写。
   */
  usageCalibration: "billing_usage_calibration",
  /**
   * 真实结算组件白名单（JSON 字符串数组）：["C01","C07"]。
   * 全局开关 TEST_TOKEN_SETTLEMENT_ENABLED 开启时，仅白名单内组件走押金-结算，
   * 白名单外组件维持估算兼容模式（灰度试点，禁止全局一刀切）。
   */
  settlementComponentWhitelist: "settlement_component_whitelist",
  /** 真实结算模式：OFF 关闭 | WHITELIST 白名单灰度（默认） | ALL 全量（价格未登记组件仍被 readiness 门禁阻断） */
  settlementMode: "billing.settlementMode",
} as const;

export type BillingConfigKey = keyof typeof BILLING_CONFIG_KEYS;

/** 负责人拍板的默认值；systemconfig 缺失或非法时回退到这里，绝不静默取 0 */
export const BILLING_CONFIG_DEFAULTS = {
  markupCoefficientBps: 20_000, // k = 2.0
  byokServiceRateBps: 1_500, // 15%
  freeMonths: 3,
  freePointsPerMonth: 100,
  refundReviewThresholdCents: 50_000, // 500 元
  minPointsPerTask: 5, // 单次执行保底 5 点
  settlementComponentWhitelist: [] as string[], // 默认无组件启用押金-结算（灰度显式开启）
  settlementMode: "WHITELIST" as const, // 默认白名单灰度
} as const;

export interface BillingConfig {
  /** k×10000，约束 >= 10000（k >= 1，禁止亏本系数） */
  markupCoefficientBps: number;
  /** BYOK 服务费率基点 */
  byokServiceRateBps: number;
  freeMonths: number;
  freePointsPerMonth: number;
  refundReviewThresholdCents: number;
  /** 单次执行保底扣点：计费 = max(换算点数, minPointsPerTask)；0 表示不启用保底 */
  minPointsPerTask: number;
  /** 真实结算组件白名单（空数组 = 无组件启用押金-结算） */
  settlementComponentWhitelist: string[];
  /** 真实结算模式：OFF 关闭 | WHITELIST 白名单灰度 | ALL 全量（价格未登记组件仍被 readiness 门禁阻断） */
  settlementMode: "OFF" | "WHITELIST" | "ALL";
}

interface IntRange {
  min: number;
  max: number;
}

/**
 * 读取整数配置：非法（NaN / 越界 / 非整数）一律回退默认值，
 * 避免脏配置把账务算成 0 或负数。
 */
function readInt(
  map: Map<string, string | null>,
  key: string,
  fallback: number,
  range: IntRange,
): number {
  const raw = map.get(key);
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < range.min || n > range.max) return fallback;
  return n;
}

/** 纯函数：解析组件白名单 JSON（非法/非数组/含非字符串一律回退空数组，绝不猜测） */
export function parseComponentWhitelist(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim().toUpperCase()),
      ),
    );
  } catch {
    return [];
  }
}

/** 纯函数：解析结算模式（非法值回退 WHITELIST，绝不静默放大权限） */
export function parseSettlementMode(raw: string | null | undefined): "OFF" | "WHITELIST" | "ALL" {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "OFF" || v === "ALL" ? v : "WHITELIST";
}

/** 纯函数：白名单解析进配置（便于单测，不依赖数据库） */
export function parseBillingConfig(
  rows: Array<{ key: string; value: string | null }>,
): BillingConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    markupCoefficientBps: readInt(
      map,
      BILLING_CONFIG_KEYS.markupCoefficientBps,
      BILLING_CONFIG_DEFAULTS.markupCoefficientBps,
      { min: 10_000, max: 1_000_000 }, // k ∈ [1, 100]
    ),
    byokServiceRateBps: readInt(
      map,
      BILLING_CONFIG_KEYS.byokServiceRateBps,
      BILLING_CONFIG_DEFAULTS.byokServiceRateBps,
      { min: 0, max: 100_000 }, // 0% ~ 1000%
    ),
    freeMonths: readInt(map, BILLING_CONFIG_KEYS.freeMonths, BILLING_CONFIG_DEFAULTS.freeMonths, {
      min: 0,
      max: 120,
    }),
    freePointsPerMonth: readInt(
      map,
      BILLING_CONFIG_KEYS.freePointsPerMonth,
      BILLING_CONFIG_DEFAULTS.freePointsPerMonth,
      { min: 0, max: 10_000_000 },
    ),
    refundReviewThresholdCents: readInt(
      map,
      BILLING_CONFIG_KEYS.refundReviewThresholdCents,
      BILLING_CONFIG_DEFAULTS.refundReviewThresholdCents,
      { min: 0, max: 100_000_000 },
    ),
    minPointsPerTask: readInt(
      map,
      BILLING_CONFIG_KEYS.minPointsPerTask,
      BILLING_CONFIG_DEFAULTS.minPointsPerTask,
      { min: 0, max: 10_000_000 },
    ),
    settlementComponentWhitelist: parseComponentWhitelist(
      map.get(BILLING_CONFIG_KEYS.settlementComponentWhitelist),
    ),
    settlementMode: parseSettlementMode(map.get(BILLING_CONFIG_KEYS.settlementMode)),
  };
}

/**
 * 组件级结算开关（灰度）：全局 flag 与白名单同时满足才启用押金-结算。
 * globalFlag 由调用方传入（token-settlement-service.isTokenSettlementFeatureEnabled()），
 * 本模块不 import 结算服务，避免依赖倒置；两处判定口径必须一致。
 */
export function isComponentSettlementEnabled(
  componentId: string,
  options: { globalFlag: boolean; whitelist: string[]; mode?: "OFF" | "WHITELIST" | "ALL" },
): boolean {
  if (!options.globalFlag) return false;
  const mode = options.mode ?? "WHITELIST";
  if (mode === "ALL") {
    // 全量模式：所有组件启用押金-结算；价格未登记的部署由既有 readiness 门禁阻断（fail-closed），
    // 不会因为模式放大而算错账。
    return true;
  }
  if (mode === "OFF") return false;
  return options.whitelist.includes(String(componentId).trim().toUpperCase());
}

/** 从数据库读取计费配置（缺失即回退默认值并记日志，不抛错阻断执行） */
export async function loadBillingConfig(): Promise<BillingConfig> {
  try {
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: Object.values(BILLING_CONFIG_KEYS) } },
      select: { key: true, value: true },
    });
    return parseBillingConfig(rows);
  } catch (error) {
    console.error("[billing-config] 读取计费配置失败，回退默认值:", (error as Error)?.message);
    return { ...BILLING_CONFIG_DEFAULTS, settlementComponentWhitelist: [] };
  }
}

/** 加价系数 k 的展示值（如 20000 → 2） */
export function markupCoefficientToNumber(bps: number): number {
  return bps / 10_000;
}
