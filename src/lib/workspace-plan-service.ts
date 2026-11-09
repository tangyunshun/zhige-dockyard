import { prisma } from "@/lib/prisma";
import {
  type WorkspacePlanConfig,
  type WorkspacePlanKey,
  WORKSPACE_PLANS,
  PURCHASABLE_PLANS,
  DEFAULT_WORKSPACE_PLAN,
  DEFAULT_POOL_LOW_THRESHOLD,
} from "@/constants/workspace-plans";

/**
 * 依据数据库真实的数值字段动态构建特性列表，确保席位、组件、存储与调用额度 100% 动态生成，绝不硬编码
 */
export function buildDynamicPlanFeatures(plan: {
  maxMembers: number;
  maxComponents: number;
  maxStorage: number;
  maxApiCalls: number;
  customFeatures?: string[];
}): string[] {
  const quotaFeatures = [
    plan.maxMembers === -1 ? "团队席位无限制" : `${plan.maxMembers} 个团队协同席位`,
    plan.maxComponents === -1 ? "组件装配额度无限制" : `${plan.maxComponents} 个组件装配额度`,
    plan.maxStorage === -1 ? "云端存储无限制" : `${Math.round(plan.maxStorage / 1024)} GB 云端存储`,
    plan.maxApiCalls === -1 ? "组件调用额度无限制" : `${plan.maxApiCalls.toLocaleString("zh-CN")} 次组件调用额度`,
  ];

  const custom = (plan.customFeatures || []).filter((f) => {
    const t = f.trim();
    if (!t) return false;
    // 过滤掉已由数据库字段动态生成的 4 类基础条目，防止重复或显示旧写死文本
    if (t.includes("团队协同席位") || t.includes("团队席位") || t.includes("协同席位")) return false;
    if (t.includes("组件装配额度") || t.includes("组件装配")) return false;
    if (t.includes("云端存储")) return false;
    if (t.includes("组件调用额度") || t.includes("组件调用") || t.includes("API 调用")) return false;
    return true;
  });

  return [...quotaFeatures, ...custom];
}

function dbToConfig(row: any): WorkspacePlanConfig {
  const maxComponents = Number(row.maxComponents ?? 0);
  const maxMembers = Number(row.maxMembers ?? 0);
  const maxStorage = Number(row.maxStorage ?? 0);
  const maxApiCalls = Number(row.maxApiCalls ?? 0);
  const rawFeatures = Array.isArray(row.features) ? row.features : [];
  // DB 表无 trialGift 列，从常量基线兜底，避免企业套餐差异化赠送字段缺失
  const fallback = WORKSPACE_PLANS[row.key as WorkspacePlanKey];

  // trialGift：优先取 DB 值（管理员后台可改），解析失败时回退常量；DB 为 NULL 也回退常量
  const dbGift = row.trialGift as any;
  const parsedGift =
    typeof dbGift === "string"
      ? (() => {
          try {
            return JSON.parse(dbGift);
          } catch {
            return null;
          }
        })()
      : dbGift;
  const trialGift: { enabled: boolean; points: number; expireDays: number } =
    parsedGift && typeof parsedGift === "object" && "enabled" in parsedGift
      ? {
          enabled: Boolean(parsedGift.enabled),
          points: Number(parsedGift.points ?? 0),
          expireDays: Number(parsedGift.expireDays ?? 0),
        }
      : (fallback?.trialGift ?? { enabled: false, points: 0, expireDays: 0 });

  return {
    key: row.key as WorkspacePlanKey,
    name: row.name,
    description: row.description,
    priceMonthly: Number(row.priceMonthly || 0),
    priceYearly: Number(row.priceYearly || 0),
    maxComponents,
    maxMembers,
    maxStorage,
    maxApiCalls,
    maxConcurrency: Number(row.maxConcurrency ?? 0),
    maxSingleFileBytes: Number(row.maxSingleFileBytes ?? 0),
    maxModelAllocations: Number(row.maxModelAllocations ?? 0),
    maxByoModels: Number(row.maxByoModels ?? 0),
    tokenLimit: Number(row.tokenLimit ?? 0),
    trialGift,
    poolLowThreshold:
      row.poolLowThreshold == null ? DEFAULT_POOL_LOW_THRESHOLD : Number(row.poolLowThreshold),
    features: buildDynamicPlanFeatures({
      maxMembers,
      maxComponents,
      maxStorage,
      maxApiCalls,
      customFeatures: rawFeatures,
    }),
    sortOrder: Number(row.sortOrder || 0),
    purchasable: row.purchasable === true,
  };
}

/**
 * 从数据库读取空间套餐配置；数据库不可用时回退到代码常量。
 */
export async function getWorkspacePlans(options?: {
  onlyActive?: boolean;
  onlyPurchasable?: boolean;
}): Promise<WorkspacePlanConfig[]> {
  try {
    const rows = await prisma.workspaceplan.findMany({
      where: {
        ...(options?.onlyActive !== false ? { isActive: true } : {}),
        ...(options?.onlyPurchasable ? { purchasable: true } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
    if (rows.length > 0) {
      return rows.map(dbToConfig);
    }
  } catch (error) {
    console.error("[workspace-plan-service] 读取 workspaceplan 失败，回退到常量配置:", error);
  }
  const all = Object.values(WORKSPACE_PLANS);
  if (options?.onlyPurchasable) {
    return all.filter((p) => p.purchasable);
  }
  return all;
}

/**
 * 按 key 读取单个空间套餐配置；数据库不可用时回退到代码常量。
 */
export async function getWorkspacePlanByKey(
  key?: string | null,
): Promise<WorkspacePlanConfig> {
  const normalized = (key || DEFAULT_WORKSPACE_PLAN).toUpperCase();
  try {
    const row = await prisma.workspaceplan.findUnique({
      where: { key: normalized },
    });
    if (row) return dbToConfig(row);
  } catch (error) {
    console.error(`[workspace-plan-service] 读取 workspaceplan key=${normalized} 失败，回退到常量配置:`, error);
  }
  return (
    WORKSPACE_PLANS[normalized as WorkspacePlanKey] || WORKSPACE_PLANS[DEFAULT_WORKSPACE_PLAN]
  );
}

/**
 * 如果数据库中没有任何空间套餐，则使用常量默认数据初始化。
 * 可在系统启动或首次访问时调用，保证平滑迁移。
 */
export async function seedDefaultWorkspacePlansIfEmpty(): Promise<void> {
  try {
    const count = await prisma.workspaceplan.count();
    if (count > 0) return;

    const defaults = Object.values(WORKSPACE_PLANS).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const plan of defaults) {
      await prisma.workspaceplan.create({
        data: {
          key: plan.key,
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          maxComponents: plan.maxComponents,
          maxMembers: plan.maxMembers,
          maxStorage: plan.maxStorage,
          maxApiCalls: plan.maxApiCalls,
          tokenLimit: plan.tokenLimit,
          // 显式写入套餐差异化赠送额度：让初始 DB 行直观携带常量值，而非依赖回退
          trialGift: plan.trialGift,
          features: plan.features,
          sortOrder: plan.sortOrder,
          purchasable: plan.purchasable,
          isActive: true,
        },
      });
    }
    console.log("[workspace-plan-service] 已初始化默认空间套餐配置");
  } catch (error) {
    console.error("[workspace-plan-service] 初始化默认空间套餐失败:", error);
  }
}

/**
 * 严格读取并核验单个空间套餐配置（自助写路径专用）。
 *
 * 与只读展示兼容函数 getWorkspacePlanByKey 的关键区别：本函数先对【原始数据库行】做完整核验，
 * 不调用 dbToConfig 的常量兜底、也不先用 Number(x||0) 把非法价格清洗成 0：
 *  - 目标缺失/空白/非字符串 → 拒绝（MISSING_TARGET_PLAN，400）；不允许借 toString 或常量猜授权；
 *  - 记录缺失         → 拒绝（TARGET_PLAN_NOT_FOUND，503）；不回退代码常量；
 *  - 读取异常         → 拒绝（PLAN_CONFIG_UNAVAILABLE，503）；
 *  - 已停用(isActive) → 拒绝（PLAN_INACTIVE，400）；
 *  - 不可在线购买     → 拒绝（PLAN_NOT_PURCHASABLE_ONLINE，400）；
 *  - 价格非安全非负整数（null/小数/负数）→ 拒绝（PLAN_PRICE_INVALID，503）。
 * 全部通过后才转展示 DTO。ok:true 表示可安全用于自助免支付 / 下单。
 */
export type StrictPlanResult =
  | { ok: true; config: WorkspacePlanConfig }
  | { ok: false; httpStatus: number; code: string; message: string };

export async function getWorkspacePlanStrict(
  rawKey?: string | null,
): Promise<StrictPlanResult> {
  // 目标缺失/空白：明确拒绝，不允许猜测授权
  if (typeof rawKey !== "string" || !rawKey.trim()) {
    return {
      ok: false,
      httpStatus: 400,
      code: "MISSING_TARGET_PLAN",
      message: "请选择要升级的企业套餐",
    };
  }
  const normalized = rawKey.toString().toUpperCase();
  try {
    const row = await prisma.workspaceplan.findUnique({ where: { key: normalized } });
    if (!row) {
      return {
        ok: false,
        httpStatus: 503,
        code: "TARGET_PLAN_NOT_FOUND",
        message: "目标企业套餐不存在或暂不可用",
      };
    }
    // 先核验原始行：停用 / 不可在线购买 / 非法价格，再转展示 DTO（不前置清洗）
    if (!row.isActive) {
      return {
        ok: false,
        httpStatus: 400,
        code: "PLAN_INACTIVE",
        message: `套餐「${row.name}」已停用，暂不可升级`,
      };
    }
    if (!row.purchasable) {
      return {
        ok: false,
        httpStatus: 400,
        code: "PLAN_NOT_PURCHASABLE_ONLINE",
        message: `套餐「${row.name}」为线下定制方案，请联系专属架构师`,
      };
    }
    const monthly = row.priceMonthly;
    const yearly = row.priceYearly;
    if (
      !Number.isSafeInteger(monthly) ||
      monthly < 0 ||
      !Number.isSafeInteger(yearly) ||
      yearly < 0
    ) {
      return {
        ok: false,
        httpStatus: 503,
        code: "PLAN_PRICE_INVALID",
        message: "套餐价格配置异常，暂不可升级",
      };
    }
    return { ok: true, config: dbToConfig(row) };
  } catch {
    return {
      ok: false,
      httpStatus: 503,
      code: "PLAN_CONFIG_UNAVAILABLE",
      message: "套餐配置读取失败，请稍后再试",
    };
  }
}

/**
 * [R0-A] 企业空间创建时对目标套餐进行严格核验。
 *
 * 规则（与“在线购买尚未开放”的边界一致，且不得回退到代码常量后继续写入）：
 * - 读取真实 workspaceplan 记录；若记录缺失或读取异常 → REJECT（503），绝不回退常量后继续创建。
 * - 若套餐已停用（isActive=false）→ REJECT（400）。
 * - 若套餐不可在线购买（purchasable=false，线下定制版）→ REJECT（400）。
 * - 若月付/年付价格非合法整数（如 null/undefined）→ REJECT（503），不得用 Number(x) || 0 猜成免费。
 * - 仅当真实价格月付与年付均为合法整数 0（免费基础档）时 → FREE，并回传真实配置继续免费创建。
 * - 其余（价格 > 0 的付费档）→ PAID，需先完成在线购买流程，本次拒绝直接开通。
 *
 * 该函数只做读取与判定，不写入任何业务数据；写入由调用方在 FREE 分支执行。
 */
export type EnterprisePlanVerifyResult =
  | { status: "FREE"; plan: WorkspacePlanConfig }
  | { status: "PAID" }
  | { status: "REJECT"; httpStatus: number; code: string; message: string };

export async function verifyEnterprisePlanForCreation(
  planKeyRaw: string | undefined,
): Promise<EnterprisePlanVerifyResult> {
  const planKey = (planKeyRaw || "STANDARD").toString().toUpperCase();

  let row: any = null;
  try {
    row = await prisma.workspaceplan.findUnique({ where: { key: planKey } });
  } catch {
    // 读取异常：按“配置不可用”拒绝，绝不回退常量后继续创建
    row = null;
  }

  if (!row) {
    return {
      status: "REJECT",
      httpStatus: 503,
      code: "PLAN_CONFIG_UNAVAILABLE",
      message: "套餐配置暂不可用，请稍后再试",
    };
  }
  if (!row.isActive) {
    return {
      status: "REJECT",
      httpStatus: 400,
      code: "PLAN_INACTIVE",
      message: `套餐「${row.name}」已停用，不可用于创建空间，请更换套餐`,
    };
  }
  if (!row.purchasable) {
    return {
      status: "REJECT",
      httpStatus: 400,
      code: "PLAN_NOT_PURCHASABLE",
      message: `套餐「${row.name}」为线下定制方案，不可在线创建空间，请更换套餐`,
    };
  }

  // 价格必须为合法安全整数；拒绝 null/undefined/小数/负数等非法值（负价不是合法 PAID）
  const monthly = row.priceMonthly;
  const yearly = row.priceYearly;
  if (!Number.isInteger(monthly) || monthly < 0 || !Number.isInteger(yearly) || yearly < 0) {
    return {
      status: "REJECT",
      httpStatus: 503,
      code: "PLAN_PRICE_INVALID",
      message: "套餐价格配置异常，暂不可创建",
    };
  }

  // [R0-A1] 免费资格 = 既有免费基础档身份 + 真实价格均为 0。
  // 仅 DEFAULT_WORKSPACE_PLAN（标准基础档）且真实月年价格均为合法整数 0 才视为免费；
  // 其他零价档（如零价 PRO/ENTERPRISE）一律视为需在线购买的付费档，不得直接免费创建。
  const isBaseFree = planKey === DEFAULT_WORKSPACE_PLAN;
  if (isBaseFree && monthly === 0 && yearly === 0) {
    return { status: "FREE", plan: dbToConfig(row) };
  }
  return { status: "PAID" };
}

export { PURCHASABLE_PLANS, WORKSPACE_PLANS, DEFAULT_WORKSPACE_PLAN };
export type { WorkspacePlanConfig, WorkspacePlanKey };
