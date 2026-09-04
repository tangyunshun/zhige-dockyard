/**
 * 空间级套餐配置（对应 workspace.plan 字段）
 *
 * 产品定位：一次性「团队资源扩容包」（不再按月/年订阅）。
 * - priceMonthly：一次性扩容价格（单位：分），购买后长期生效
 * - priceYearly：订阅制年付字段，已随「一次性扩容」模式停用，恒为 0
 * - tokenLimit：扩容包不再附赠月度算力（恒为 0）；算力统一由「会员等级(月度额度) + 算力加油包(即时充值)」提供
 *
 * 与「账号级会员等级 membershiplevel」是两个独立维度：
 * - 账号级会员等级：决定每月算力额度、企业空间数量、团队规模等账号权益，按月/年订阅
 * - 空间级扩容包：决定单个空间内的成员席位、组件装配、存储、调用额度，一次购买长期生效
 *
 * 套餐升级/空间创建统一从数据库 workspaceplan 读取；
 * 本文件作为数据库不可用时的兜底配置与数据库为空时的初始化基线，禁止在业务代码中另行写死资费。
 */
export type WorkspacePlanKey = "STANDARD" | "PRO" | "ENTERPRISE" | "CUSTOM";

export interface WorkspacePlanConfig {
  key: WorkspacePlanKey;
  name: string;
  description: string;
  /** 一次性扩容价格，单位：分 */
  priceMonthly: number;
  /** 订阅制年付已停用（一次性扩容模式恒为 0） */
  priceYearly: number;
  /** 可装配组件实例上限，-1 表示无限制 */
  maxComponents: number;
  /** 可邀请成员数上限，-1 表示无限制 */
  maxMembers: number;
  /** 存储空间上限，单位：MB，-1 表示无限制 */
  maxStorage: number;
  /** 调用额度上限，-1 表示无限制 */
  maxApiCalls: number;
  /** 扩容包附赠算力已取消，恒为 0（算力统一由会员等级 + 算力加油包承担） */
  tokenLimit: number;
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
    description: "新空间免费基础档，空间级资源可随时按需一次性扩容",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: 100,
    maxMembers: 10,
    maxStorage: 1024, // 1 GB
    maxApiCalls: 1000,
    tokenLimit: 0,
    features: [
      "10 个团队协同席位",
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
    description: "成长型团队一次性扩容包，解锁全量组件与更高并发",
    priceMonthly: 19900,
    priceYearly: 0,
    maxComponents: 500,
    maxMembers: 50,
    maxStorage: 10240, // 10 GB
    maxApiCalls: 10000,
    tokenLimit: 0,
    features: [
      "50 个团队协同席位",
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
    description: "大型组织一次性扩容包，席位与组件无限制并含 SLA 保障",
    priceMonthly: 69900,
    priceYearly: 0,
    maxComponents: -1,
    maxMembers: -1,
    maxStorage: 102400, // 100 GB
    maxApiCalls: 100000,
    tokenLimit: 0,
    features: [
      "团队席位无限制",
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
    tokenLimit: 0,
    features: ["全部能力按合同约定开放"],
    sortOrder: 4,
    purchasable: false,
  },
};

/** 默认套餐 */
export const DEFAULT_WORKSPACE_PLAN: WorkspacePlanKey = "STANDARD";

/** 计费模式：空间扩容包一次性买断（订阅制已下线） */
export const WORKSPACE_PLAN_BILLING_LABEL = "一次性扩容";

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
