/**
 * 空间级套餐配置（对应 workspace.plan 字段）
 *
 * 与「账号级会员等级 membershiplevel」是两个独立维度：
 * - 账号级会员等级：决定可创建的企业空间数量、账号月度算力 Token 等
 * - 空间级套餐：决定单个空间内的成员席位、存储、调用额度、组件装配额度
 *
 * 这里作为唯一数据源，供空间创建（初始化配额）与空间套餐升级共用，
 * 避免同一份配额在多个路由里重复硬编码。
 */

export type WorkspacePlanKey = "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM";

export interface WorkspacePlanConfig {
  key: WorkspacePlanKey;
  name: string;
  description: string;
  /** 月付价格，单位：分 */
  priceMonthly: number;
  /** 年付价格，单位：分 */
  priceYearly: number;
  /** 可装配组件实例上限，-1 表示无限制 */
  maxComponents: number;
  /** 可邀请成员数上限，-1 表示无限制 */
  maxMembers: number;
  /** 存储空间上限，单位：MB，-1 表示无限制 */
  maxStorage: number;
  /** 每月调用额度上限，-1 表示无限制 */
  maxApiCalls: number;
  /** 套餐附带的月度算力 Token，-1 表示无限制 */
  tokenLimit: number;
  features: string[];
  /** 排序，决定升级阶梯顺序 */
  sortOrder: number;
  /** 是否允许在线自助升级（CUSTOM 为线下定制，不支持在线购买） */
  purchasable: boolean;
}

const MB = 1024 * 1024;

export const WORKSPACE_PLANS: Record<WorkspacePlanKey, WorkspacePlanConfig> = {
  STANDARD: {
    key: "STANDARD",
    name: "标准版",
    description: "适合初创小团队的基础协作空间",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: 100,
    maxMembers: 10,
    maxStorage: 1024, // 1 GB
    maxApiCalls: 1000,
    tokenLimit: 20000,
    features: [
      "10 个团队协同席位",
      "100 个组件装配额度",
      "1 GB 云端存储",
      "每月 1,000 次调用额度",
      "基础组件与标准技术支持",
    ],
    sortOrder: 1,
    purchasable: true,
  },
  PRO: {
    key: "PRO",
    name: "专业版",
    description: "适合成长型团队，解锁全量组件与更高并发",
    priceMonthly: 19900,
    priceYearly: 199000,
    maxComponents: 500,
    maxMembers: 50,
    maxStorage: 10240, // 10 GB
    maxApiCalls: 10000,
    tokenLimit: 100000,
    features: [
      "50 个团队协同席位",
      "500 个组件装配额度",
      "10 GB 云端存储",
      "每月 10,000 次调用额度",
      "全量组件、优先支持与数据分析",
    ],
    sortOrder: 2,
    purchasable: true,
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    name: "旗舰版",
    description: "面向大型组织，席位与组件无限制并含 SLA 保障",
    priceMonthly: 69900,
    priceYearly: 699000,
    maxComponents: -1,
    maxMembers: -1,
    maxStorage: 102400, // 100 GB
    maxApiCalls: 100000,
    tokenLimit: 500000,
    features: [
      "团队席位无限制",
      "组件装配额度无限制",
      "100 GB 云端存储",
      "每月 100,000 次调用额度",
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
    tokenLimit: 1000000,
    features: ["全部能力按合同约定开放"],
    sortOrder: 4,
    purchasable: false,
  },
};

/** 默认套餐 */
export const DEFAULT_WORKSPACE_PLAN: WorkspacePlanKey = "STANDARD";

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
