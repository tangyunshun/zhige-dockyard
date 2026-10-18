/**
 * 空间级套餐配置（对应 workspace.plan 字段）
 *
 * 产品定位：空间级订阅套餐（支持月付 / 年付；到期需续费，否则定时任务自动降级为免费版）。
 * - priceMonthly：月付价格（单位：分）
 * - priceYearly：年付价格（单位：分，通常为月付的 10 个月当量）
 * - 订阅生效周期与到期时间记录在 workspace 表的 planStartedAt / planExpiresAt / planBillingCycle
 * - tokenLimit：套餐不再附赠算力（恒为 0）；算力统一由「充值 + 算力加油包」提供（随用随扣，无月度自动重置）
 *
 * 与「账号级会员等级 membershiplevel」是两个独立维度：
 * - 账号级会员等级：决定个人账号权益（并发、上传大小、模型数、算力等），按月/年订阅
 * - 空间级套餐：决定单个空间内的成员席位、组件装配、存储、调用额度与并发/上传等，按月/年订阅
 *
 * 套餐升级/空间创建统一从数据库 workspaceplan 读取；
 * 本文件作为数据库不可用时的兜底配置与数据库为空时的初始化基线，禁止在业务代码中另行写死资费。
 */
export type WorkspacePlanKey = "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM";

export interface WorkspacePlanConfig {
  key: WorkspacePlanKey;
  name: string;
  description: string;
  /** 月付价格，单位：分 */
  priceMonthly: number;
  /** 年付价格，单位：分（通常为月付的 10 个月当量） */
  priceYearly: number;
  /** 可装配组件实例上限，-1 表示无限制 */
  maxComponents: number;
  /** 可邀请成员数（席位）上限，-1 表示无限制 */
  maxMembers: number;
  /** 存储空间上限，单位：MB，-1 表示无限制 */
  maxStorage: number;
  /** 调用额度上限，-1 表示无限制 */
  maxApiCalls: number;
  /** 并发任务数上限（同一空间同时运行），-1 表示不限制 */
  maxConcurrency: number;
  /** 单次上传文件大小上限，单位：字节，-1 表示不限制 */
  maxSingleFileBytes: number;
  /** 可分配系统模型数量上限，-1 表示不限制 */
  maxModelAllocations: number;
  /** 自建模型（BYO）数量上限，-1 表示不限制 */
  maxByoModels: number;
  /** 扩容包附赠算力已取消，恒为 0（算力统一由会员等级 + 算力加油包承担） */
  tokenLimit: number;
  /**
   * 新空间一次性体验额度赠送（企业套餐差异化）。
   * 仅当 enabled 为 true 时，创建该套餐的企业空间会按此配置赠送，区别于个人空间的平台统一配置。
   * points：赠送算力点；expireDays：0 表示永久有效。
   */
  trialGift: { enabled: boolean; points: number; expireDays: number };
  /** 企业池余额低于该阈值时触发「补充提醒」（按空间套餐差异化） */
  poolLowThreshold: number;
  features: string[];
  /** 排序，决定升级阶梯顺序 */
  sortOrder: number;
  /** 是否允许在线自助购买（CUSTOM 为线下定制，不支持在线购买） */
  purchasable: boolean;
}

const MB = 1024 * 1024;

export const WORKSPACE_PLANS: Record<WorkspacePlanKey, WorkspacePlanConfig> = {
  STANDARD: {
    key: "STANDARD",
    name: "标准版",
    description: "新空间免费基础档，空间级资源可随时按需订阅扩容",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: 100,
    maxMembers: 2,
    maxStorage: 1024, // 1 GB
    maxApiCalls: 1000,
    maxConcurrency: 2,
    maxSingleFileBytes: 10 * MB,
    maxModelAllocations: 2,
    maxByoModels: 2,
    tokenLimit: 0,
    trialGift: { enabled: true, points: 500, expireDays: 30 },
    poolLowThreshold: 1000,
    features: [
      "2 个团队协同席位",
      "100 个组件装配额度",
      "1 GB 云端存储",
      "1,000 次组件调用额度",
      "基础组件与标准技术支持",
    ],
    sortOrder: 1,
    purchasable: true,
  },
  PRO: {
    key: "PRO",
    name: "专业版",
    description: "专业版空间套餐，按月/年订阅，解锁全量组件与更高并发",
    priceMonthly: 19900,
    priceYearly: 199000,
    maxComponents: 500,
    maxMembers: 10,
    maxStorage: 10240, // 10 GB
    maxApiCalls: 10000,
    maxConcurrency: 5,
    maxSingleFileBytes: 50 * MB,
    maxModelAllocations: 10,
    maxByoModels: 10,
    tokenLimit: 0,
    trialGift: { enabled: true, points: 2000, expireDays: 30 },
    poolLowThreshold: 3000,
    features: [
      "10 个团队协同席位",
      "500 个组件装配额度",
      "10 GB 云端存储",
      "10,000 次组件调用额度",
      "全量组件、优先支持与数据分析",
    ],
    sortOrder: 2,
    purchasable: true,
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    name: "旗舰版",
    description: "旗舰版空间套餐，按月/年订阅，席位与组件无限制并含 SLA 保障",
    priceMonthly: 69900,
    priceYearly: 699000,
    maxComponents: -1,
    maxMembers: 50,
    maxStorage: 102400, // 100 GB
    maxApiCalls: 100000,
    maxConcurrency: -1,
    maxSingleFileBytes: -1,
    maxModelAllocations: -1,
    maxByoModels: -1,
    tokenLimit: 0,
    trialGift: { enabled: true, points: 5000, expireDays: 30 },
    poolLowThreshold: 10000,
    features: [
      "50 个团队协同席位（可增购）",
      "组件装配额度无限制",
      "100 GB 云端存储",
      "100,000 次组件调用额度",
      "专属支持、高级分析与 SLA 保障",
    ],
    sortOrder: 3,
    purchasable: true,
  },
  CUSTOM: {
    key: "CUSTOM",
    name: "定制版",
    description: "按合同约定的线下定制方案",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: -1,
    maxMembers: -1,
    maxStorage: -1,
    maxApiCalls: -1,
    maxConcurrency: -1,
    maxSingleFileBytes: -1,
    maxModelAllocations: -1,
    maxByoModels: -1,
    tokenLimit: 0,
    trialGift: { enabled: false, points: 0, expireDays: 0 },
    poolLowThreshold: 10000,
    features: ["全部能力按合同约定开放"],
    sortOrder: 4,
    purchasable: false,
  },
};

/** 默认套餐 */
export const DEFAULT_WORKSPACE_PLAN: WorkspacePlanKey = "STANDARD";

/** 计费模式：空间套餐为订阅制（月付 / 年付），到期需续费 */
export const WORKSPACE_PLAN_BILLING_LABEL = "订阅制（月付 / 年付）";

/** 可在线自助购买的套餐（按阶梯排序） */
export const PURCHASABLE_PLANS: WorkspacePlanConfig[] = Object.values(WORKSPACE_PLANS)
  .filter((p) => p.purchasable)
  .sort((a, b) => a.sortOrder - b.sortOrder);

/** 归一化套餐名，非法值回落为默认套餐 */
export function normalizePlan(plan?: string | null): WorkspacePlanKey {
  if (!plan) return DEFAULT_WORKSPACE_PLAN;
  const upper = plan.toUpperCase() as WorkspacePlanKey;
  return WORKSPACE_PLANS[upper] ? upper : DEFAULT_WORKSPACE_PLAN;
}

/** 获取套餐配置（非法值回落为默认套餐） */
export function getPlanConfig(plan?: string | null): WorkspacePlanConfig {
  return WORKSPACE_PLANS[normalizePlan(plan)];
}

/** 企业池低余额预警阈值的全局默认值（非法套餐回落到此值） */
export const DEFAULT_POOL_LOW_THRESHOLD = 1000;

/** 获取企业池低余额预警阈值（按空间套餐差异化，非法值回落默认套餐阈值） */
export function getPoolLowThreshold(plan?: string | null): number {
  return getPlanConfig(plan).poolLowThreshold ?? DEFAULT_POOL_LOW_THRESHOLD;
}

/**
 * 解析最终生效的企业池低余额预警阈值。
 * 优先级：空间级覆盖（workspacequota.poolLowThreshold）> 空间套餐默认阈值 > 全局兜底。
 * @param plan 空间套餐（workspace.plan）
 * @param quotaThreshold 空间级覆盖值（BigInt/number/null），null 或 undefined 表示继承套餐默认
 */
export function resolvePoolLowThreshold(
  plan?: string | null,
  quotaThreshold?: bigint | number | null
): number {
  if (quotaThreshold !== null && quotaThreshold !== undefined) {
    const n = Number(quotaThreshold);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return getPoolLowThreshold(plan);
}

/**
 * 兼容旧调用：返回写入 workspace.quota 的 JSON 结构。
 * 注意：maxStorage 单位为 MB，与 workspacequota.storageLimit（字节）不同。
 */
export function getQuotaConfig(plan?: string | null) {
  const cfg = getPlanConfig(plan);
  return {
    maxComponents: cfg.maxComponents,
    maxMembers: cfg.maxMembers,
    maxStorage: cfg.maxStorage,
    maxApiCalls: cfg.maxApiCalls,
    features: cfg.features,
  };
}

/** 判断目标套餐是否属于升级（按阶梯顺序比较） */
export function isPlanUpgrade(from: string, to: string): boolean {
  return WORKSPACE_PLANS[normalizePlan(to)].sortOrder >
    WORKSPACE_PLANS[normalizePlan(from)].sortOrder;
}

/** 存储空间：MB ➔ 字节；无限制(-1)保持 -1 */
export function storageMbToBytes(mb: number): number {
  return mb === -1 ? -1 : mb * MB;
}
