/**
 * 平台级默认模型池 + 新空间自动继承（授权制下的默认供给）。
 *
 * 设计要点：
 *  - 真源是 platformdefaultmodel 表（FREE / PAID 两类），管理员后台可动态调整；
 *  - 新空间（个人 / 企业）创建时自动继承 FREE 清单写入 workspace_model_policy.allowedDeploymentIds；
 *  - 有效模型统一按「平台默认初始 + 空间额外开通 - 空间禁用」三段式计算，任何调用方不得自行拼装；
 *  - 付费模型（PAID）永不自动开通，只能由管理员为单个空间额外加入白名单。
 */

import { prisma } from "@/lib/prisma";
import { withModelRegistryLock } from "@/lib/model-registry-lock";

export type DefaultModelKind = "FREE" | "PAID";

/** 读取平台默认模型池（仅返回已启用项） */
export async function loadPlatformDefaultModels(
  kind?: DefaultModelKind,
): Promise<Array<{ deploymentId: string; kind: string; sortOrder: number }>> {
  const rows = await prisma.platformdefaultmodel.findMany({
    where: {
      enabled: true,
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "asc" }],
    select: { deploymentId: true, kind: true, sortOrder: true },
  });
  return rows;
}

/** 仅取默认初始模型 ID 列表 */
export async function loadFreeDefaultDeploymentIds(): Promise<string[]> {
  const rows = await loadPlatformDefaultModels("FREE");
  return rows.map((r) => r.deploymentId);
}

/** 仅取默认付费模型 ID 列表（候选池，不自动开通） */
export async function loadPaidDefaultDeploymentIds(): Promise<string[]> {
  const rows = await loadPlatformDefaultModels("PAID");
  return rows.map((r) => r.deploymentId);
}

/**
 * 计算空间的有效模型清单：
 *   空间白名单（allowedDeploymentIds）− 空间禁用（disabledDeploymentIds）
 *
 * 白名单是唯一真源：平台默认初始模型通过「新空间继承 / 同步到所有空间」写入各自白名单，
 * 不再在读时隐藏合并——避免"能跑却不在任何列表显示"的自相矛盾，也让管理员在空间模型策略里全量可见、可勾选/移除。
 */
export function computeEffectiveDeploymentIds(params: {
  freeDefaults?: string[];
  allowedDeploymentIds: string[];
  disabledDeploymentIds: string[];
}): string[] {
  const disabled = new Set(params.disabledDeploymentIds || []);
  const merged = Array.from(new Set([...(params.allowedDeploymentIds || [])]));
  return merged.filter((id) => !disabled.has(id));
}

/**
 * 读取某空间的有效模型清单（含平台默认初始模型）。
 * 相比 loadSpaceModelPolicy，此函数把「平台默认供给」与「空间级覆盖」合并，是上层应使用的入口。
 */
export async function resolveEffectiveDeploymentIds(workspaceId: string): Promise<string[]> {
  const [freeDefaults, policy] = await Promise.all([
    loadFreeDefaultDeploymentIds(),
    prisma.workspace_model_policy.findUnique({
      where: { workspaceId },
      select: { allowedDeploymentIds: true, disabledDeploymentIds: true },
    }),
  ]);
  const allowed = Array.isArray(policy?.allowedDeploymentIds)
    ? (policy!.allowedDeploymentIds as unknown as string[])
    : [];
  const disabled = Array.isArray(policy?.disabledDeploymentIds)
    ? (policy!.disabledDeploymentIds as unknown as string[])
    : [];
  return computeEffectiveDeploymentIds({
    freeDefaults,
    allowedDeploymentIds: allowed,
    disabledDeploymentIds: disabled,
  });
}

/**
 * 新空间创建时调用：把平台默认初始模型写入该空间白名单。
 * 使用模型注册表命名锁，避免与「删除部署 / 删除供应商」产生竞态。
 * 幂等：重复调用只会合并去重，不会清空空间已有的额外开通项。
 */
export async function inheritFreeDefaultModelsForNewWorkspace(workspaceId: string): Promise<string[]> {
  const freeDefaults = await loadFreeDefaultDeploymentIds();
  if (freeDefaults.length === 0) return [];

  await withModelRegistryLock(async (tx) => {
    const existing = await tx.workspace_model_policy.findUnique({
      where: { workspaceId },
      select: { allowedDeploymentIds: true },
    });
    const current = Array.isArray(existing?.allowedDeploymentIds)
      ? (existing!.allowedDeploymentIds as unknown as string[])
      : [];
    const merged = Array.from(new Set([...current, ...freeDefaults]));
    if (existing) {
      await tx.workspace_model_policy.update({
        where: { workspaceId },
        data: { allowedDeploymentIds: merged, updatedAt: new Date() },
      });
    } else {
      await tx.workspace_model_policy.create({
        data: {
          id: `wmp-${workspaceId}`,
          workspaceId,
          defaultDeploymentId: null,
          allowedDeploymentIds: merged,
          disabledDeploymentIds: [],
        },
      });
    }
  });

  return freeDefaults;
}

/** 把平台默认初始模型同步到所有空间（管理员手动触发，谨慎使用） */
export async function syncFreeDefaultsToAllWorkspaces(): Promise<{ synced: number; skipped: number }> {
  const freeDefaults = await loadFreeDefaultDeploymentIds();
  if (freeDefaults.length === 0) return { synced: 0, skipped: 0 };

  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, allowedDeploymentIds: true, disabledDeploymentIds: true },
  });

  let synced = 0;
  let skipped = 0;
  const now = new Date();

  await withModelRegistryLock(async (tx) => {
    for (const p of policies) {
      const current = Array.isArray(p.allowedDeploymentIds)
        ? (p.allowedDeploymentIds as unknown as string[])
        : [];
      const disabled = Array.isArray(p.disabledDeploymentIds)
        ? (p.disabledDeploymentIds as unknown as string[])
        : [];
      // 已被空间显式禁用的模型，同步时不得强行塞回
      const toAdd = freeDefaults.filter((id) => !disabled.includes(id));
      if (toAdd.length === 0) {
        skipped += 1;
        continue;
      }
      const merged = Array.from(new Set([...current, ...toAdd]));
      if (merged.length === current.length) {
        skipped += 1;
        continue;
      }
      await tx.workspace_model_policy.update({
        where: { workspaceId: p.workspaceId },
        data: { allowedDeploymentIds: merged, updatedAt: now },
      });
      synced += 1;
    }
  });

  return { synced, skipped };
}
