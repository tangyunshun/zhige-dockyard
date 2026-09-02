import { prisma } from "@/lib/prisma";
import {
  type WorkspacePlanConfig,
  type WorkspacePlanKey,
  WORKSPACE_PLANS,
  PURCHASABLE_PLANS,
  DEFAULT_WORKSPACE_PLAN,
} from "@/constants/workspace-plans";

function dbToConfig(row: any): WorkspacePlanConfig {
  return {
    key: row.key as WorkspacePlanKey,
    name: row.name,
    description: row.description,
    priceMonthly: Number(row.priceMonthly || 0),
    priceYearly: Number(row.priceYearly || 0),
    maxComponents: Number(row.maxComponents ?? 0),
    maxMembers: Number(row.maxMembers ?? 0),
    maxStorage: Number(row.maxStorage ?? 0),
    maxApiCalls: Number(row.maxApiCalls ?? 0),
    tokenLimit: Number(row.tokenLimit ?? 0),
    features: Array.isArray(row.features) ? row.features : [],
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

export { PURCHASABLE_PLANS, WORKSPACE_PLANS, DEFAULT_WORKSPACE_PLAN };
export type { WorkspacePlanConfig, WorkspacePlanKey };
