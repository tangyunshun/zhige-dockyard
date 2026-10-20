import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withModelRegistryLock } from "@/lib/model-registry-lock";
import { addNotification } from "@/lib/notifications-store";

/**
 * 平台模型禁用 / 启用 —— 统一业务服务。
 *
 * 设计要点（对应《平台模型禁用与启用管理业务需求方案》）：
 *  - 禁用只是"临时闸门"：翻 modeldeployment.enabled=false，绝不物理删除、绝不静默消失；
 *  - 影响面前置：getModelDisableImpact 供禁用前模态框预览；
 *  - 强制替代：若某空间把该模型设为"默认"，禁用时用 replacementDeploymentId 替换其默认（无替代则清默认、提示重选），
 *    杜绝"默认指向已下线模型却不提示"的矛盾态；
 *  - 精准通知：仅通知受影响空间的所有者（站内信），不全站广播；
 *  - 审计：每次禁用落 operationlog（操作人/模型/影响面/替代模型/原因）。
 *
 * 说明：modeldisableschedule 为新表，迁移 + prisma generate 前用 any 兜底（与 billing 兼容层同思路）。
 */
const scheduleModel = () => (prisma as any).modeldisableschedule as any;

/**
 * 轻量审计写入（直接落 operationlog）。
 * 刻意不复用 @/lib/security 的 writeAuditLog——它顶部 import fs/path，会把 Node 内置模块
 * 带进 instrumentation（启动钩子动态引入本服务）的打包上下文，触发 "Can't resolve 'fs'"。
 * operationlog.userId 为必填外键，无操作人时跳过（不写假数据）。
 */
async function writeModelAudit(
  userId: string | null | undefined,
  action: string,
  details: Record<string, unknown>,
) {
  if (!userId) return;
  try {
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        action,
        resource: action.split(":")[0],
        details: details as unknown as Prisma.InputJsonValue,
        ipAddress: null,
      },
    });
  } catch (e) {
    console.error("[model-disable] 审计写入失败:", e);
  }
}

export interface ModelDisableImpact {
  asDefault: number;
  inWhitelist: number;
  workspaceIds: string[];
  spaces: Array<{ id: string; name: string; type: string; ownerId: string; isDefault: boolean }>;
}

/** 扫描某模型部署被哪些空间引用（作为默认 / 在白名单），供禁用前影响面预览 */
export async function getModelDisableImpact(deploymentId: string): Promise<ModelDisableImpact> {
  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, defaultDeploymentId: true, allowedDeploymentIds: true },
  });
  const affectedIds = new Set<string>();
  const defaultIds = new Set<string>();
  const whitelistIds = new Set<string>();
  for (const p of policies) {
    const allowed = Array.isArray(p.allowedDeploymentIds)
      ? (p.allowedDeploymentIds as unknown as string[])
      : [];
    const isDefault = p.defaultDeploymentId === deploymentId;
    const inWl = allowed.includes(deploymentId);
    if (isDefault) defaultIds.add(p.workspaceId);
    if (inWl) whitelistIds.add(p.workspaceId);
    if (isDefault || inWl) affectedIds.add(p.workspaceId);
  }
  let spaces: ModelDisableImpact["spaces"] = [];
  if (affectedIds.size > 0) {
    const ws = await prisma.workspace.findMany({
      where: { id: { in: Array.from(affectedIds) } },
      select: { id: true, name: true, type: true, ownerId: true },
    });
    spaces = ws.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      ownerId: w.ownerId,
      isDefault: defaultIds.has(w.id),
    }));
  }
  return {
    asDefault: defaultIds.size,
    inWhitelist: whitelistIds.size,
    workspaceIds: Array.from(affectedIds),
    spaces,
  };
}

/** 执行禁用 + 善后（立即禁用与定时到点都走这里）：翻开关、替换受影响默认、精准站内信、审计 */
export async function applyModelDisable(params: {
  deploymentId: string;
  replacementDeploymentId?: string | null;
  reason?: string | null;
  actorId: string | null;
}): Promise<ModelDisableImpact & { replaced: Array<{ workspaceId: string; to: string | null }> }> {
  const { deploymentId, replacementDeploymentId, reason, actorId } = params;

  const dep = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    select: { id: true, providerId: true, modelId: true, enabled: true },
  });
  if (!dep) throw new Error("DEPLOYMENT_NOT_FOUND");

  let replacement: { id: string; providerId: string; modelId: string } | null = null;
  if (replacementDeploymentId) {
    const r = await prisma.modeldeployment.findUnique({
      where: { id: replacementDeploymentId },
      select: { id: true, providerId: true, modelId: true, enabled: true },
    });
    if (!r || !r.enabled) throw new Error("REPLACEMENT_NOT_AVAILABLE");
    replacement = { id: r.id, providerId: r.providerId, modelId: r.modelId };
  }

  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, defaultDeploymentId: true, allowedDeploymentIds: true },
  });
  const asDefaultPolicies = policies.filter((p) => p.defaultDeploymentId === deploymentId);
  const whitelistPolicies = policies.filter((p) => {
    const allowed = Array.isArray(p.allowedDeploymentIds)
      ? (p.allowedDeploymentIds as unknown as string[])
      : [];
    return allowed.includes(deploymentId);
  });

  const readAllowed = (p: { allowedDeploymentIds: unknown }) =>
    Array.isArray(p.allowedDeploymentIds) ? (p.allowedDeploymentIds as unknown as string[]) : [];

  // 翻开关 + 替换默认必须在模型注册表命名锁内完成（与删除部署/写策略共用一把锁，消除竞态）
  const replaced = await withModelRegistryLock(async (tx) => {
    await tx.modeldeployment.update({ where: { id: deploymentId }, data: { enabled: false } });
    const out: Array<{ workspaceId: string; to: string | null }> = [];
    for (const p of asDefaultPolicies) {
      // 被禁用的模型一律从白名单剔除：留着会形成「白名单有它、列表看不见、执行必失败」的错乱态，
      // 并会让该空间后续任何一次策略保存被校验拒绝（无法再改默认模型）。
      let nextAllowed = readAllowed(p).filter((id) => id !== deploymentId);
      if (replacement) {
        if (!nextAllowed.includes(replacement.id)) nextAllowed = [...nextAllowed, replacement.id];
        await tx.workspace_model_policy.update({
          where: { workspaceId: p.workspaceId },
          data: { defaultDeploymentId: replacement.id, allowedDeploymentIds: nextAllowed },
        });
        out.push({ workspaceId: p.workspaceId, to: replacement.id });
      } else {
        // 无替代：清掉默认，让工作台提示"重选"，不再留"默认指向已下线模型"的矛盾态
        await tx.workspace_model_policy.update({
          where: { workspaceId: p.workspaceId },
          data: { defaultDeploymentId: null, allowedDeploymentIds: nextAllowed },
        });
        out.push({ workspaceId: p.workspaceId, to: null });
      }
    }
    // 仅白名单受影响（非默认）的空间：同样剔除该禁用模型
    for (const p of whitelistPolicies) {
      if (asDefaultPolicies.some((x) => x.workspaceId === p.workspaceId)) continue;
      const nextAllowed = readAllowed(p).filter((id) => id !== deploymentId);
      await tx.workspace_model_policy.update({
        where: { workspaceId: p.workspaceId },
        data: { allowedDeploymentIds: nextAllowed },
      });
    }
    return out;
  });

  // 精准站内信：仅通知受影响空间所有者（默认=该模型 或 白名单含该模型），不全站广播
  const affectedIds = Array.from(
    new Set([
      ...asDefaultPolicies.map((p) => p.workspaceId),
      ...whitelistPolicies.map((p) => p.workspaceId),
    ]),
  );
  if (affectedIds.length > 0) {
    const wsRows = await prisma.workspace.findMany({
      where: { id: { in: affectedIds } },
      select: { id: true, name: true, ownerId: true },
    });
    const defaultWs = new Set(asDefaultPolicies.map((p) => p.workspaceId));
    const notified = new Set<string>();
    const modelLabel = `${dep.providerId}/${dep.modelId}`;
    for (const w of wsRows) {
      if (notified.has(w.ownerId)) continue;
      notified.add(w.ownerId);
      const isDefault = defaultWs.has(w.id);
      const content = replacement
        ? `系统通知：因服务调整，模型【${modelLabel}】已下线${
            isDefault ? `，系统已暂时将空间「${w.name}」的默认模型切换为【${replacement.providerId}/${replacement.modelId}】` : ""
          }。请前往空间「模型」页按需调整。`
        : `系统通知：模型【${modelLabel}】已下线${
            isDefault ? `，空间「${w.name}」的原默认模型已停用，请前往「模型」页重新设置默认` : ""
          }。`;
      await addNotification(w.ownerId, "模型已停用通知", content, "model", "/workspace-hub", false).catch(
        () => {},
      );
    }
  }

  await writeModelAudit(actorId, "model:disable", {
    deploymentId,
    providerId: dep.providerId,
    modelId: dep.modelId,
    reason: reason || null,
    replacementDeploymentId: replacement?.id || null,
    asDefault: asDefaultPolicies.length,
    inWhitelist: whitelistPolicies.length,
    affectedWorkspaces: affectedIds.length,
  });

  return {
    asDefault: asDefaultPolicies.length,
    inWhitelist: whitelistPolicies.length,
    workspaceIds: affectedIds,
    spaces: [],
    replaced,
  };
}

/**
 * ================= 供应商（模型通道）禁用 =================
 *
 * 与「单模型禁用」完全同口径：影响面前置 + 强制替代 + 白名单清理 + 精准站内信 + 审计。
 * 差异只在作用对象：这里关闭的是整条通道（modelprovider.enabled=false），
 * 其下所有模型部署立即不可执行，因此替代模型不得来自同一条被关闭的通道。
 */

/** 扫描某供应商通道下的模型被哪些空间引用（作为默认 / 在白名单），供禁用前影响面预览 */
export async function getProviderDisableImpact(providerName: string): Promise<ModelDisableImpact> {
  const deployments = await prisma.modeldeployment.findMany({
    where: { providerId: providerName },
    select: { id: true },
  });
  const depIds = new Set(deployments.map((d) => d.id));
  if (depIds.size === 0) {
    return { asDefault: 0, inWhitelist: 0, workspaceIds: [], spaces: [] };
  }
  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, defaultDeploymentId: true, allowedDeploymentIds: true },
  });
  const affectedIds = new Set<string>();
  const defaultIds = new Set<string>();
  const whitelistIds = new Set<string>();
  for (const p of policies) {
    const allowed = Array.isArray(p.allowedDeploymentIds)
      ? (p.allowedDeploymentIds as unknown as string[])
      : [];
    const isDefault = !!p.defaultDeploymentId && depIds.has(p.defaultDeploymentId);
    const inWl = allowed.some((id) => depIds.has(id));
    if (isDefault) defaultIds.add(p.workspaceId);
    if (inWl) whitelistIds.add(p.workspaceId);
    if (isDefault || inWl) affectedIds.add(p.workspaceId);
  }
  let spaces: ModelDisableImpact["spaces"] = [];
  if (affectedIds.size > 0) {
    const ws = await prisma.workspace.findMany({
      where: { id: { in: Array.from(affectedIds) } },
      select: { id: true, name: true, type: true, ownerId: true },
    });
    spaces = ws.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      ownerId: w.ownerId,
      isDefault: defaultIds.has(w.id),
    }));
  }
  return {
    asDefault: defaultIds.size,
    inWhitelist: whitelistIds.size,
    workspaceIds: Array.from(affectedIds),
    spaces,
  };
}

/** 执行供应商禁用善后：翻通道开关、替换受影响空间默认、清理白名单、精准通知、审计 */
export async function applyProviderDisable(params: {
  providerId: string;
  replacementDeploymentId?: string | null;
  reason?: string | null;
  actorId: string | null;
}): Promise<ModelDisableImpact & { replaced: Array<{ workspaceId: string; to: string | null }> }> {
  const { providerId, replacementDeploymentId, reason, actorId } = params;

  const provider = await prisma.modelprovider.findUnique({
    where: { id: providerId },
    select: { id: true, name: true },
  });
  if (!provider) throw new Error("PROVIDER_NOT_FOUND");

  const deployments = await prisma.modeldeployment.findMany({
    where: { providerId: provider.name },
    select: { id: true },
  });
  const depIds = new Set(deployments.map((d) => d.id));

  let replacement: { id: string; providerId: string; modelId: string } | null = null;
  if (replacementDeploymentId) {
    const r = await prisma.modeldeployment.findUnique({
      where: { id: replacementDeploymentId },
      select: { id: true, providerId: true, modelId: true, enabled: true },
    });
    if (!r || !r.enabled) throw new Error("REPLACEMENT_NOT_AVAILABLE");
    // 替代模型不得来自即将停用的同一通道，否则替换后空间默认依旧不可用
    if (r.providerId === provider.name) throw new Error("REPLACEMENT_IN_SAME_PROVIDER");
    const rp = await prisma.modelprovider.findUnique({
      where: { name: r.providerId },
      select: { enabled: true },
    });
    if (!rp?.enabled) throw new Error("REPLACEMENT_NOT_AVAILABLE");
    replacement = { id: r.id, providerId: r.providerId, modelId: r.modelId };
  }

  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, defaultDeploymentId: true, allowedDeploymentIds: true },
  });
  const readAllowed = (p: { allowedDeploymentIds: unknown }) =>
    Array.isArray(p.allowedDeploymentIds) ? (p.allowedDeploymentIds as unknown as string[]) : [];
  const asDefaultPolicies = policies.filter(
    (p) => !!p.defaultDeploymentId && depIds.has(p.defaultDeploymentId),
  );
  const whitelistPolicies = policies.filter((p) => readAllowed(p).some((id) => depIds.has(id)));

  const replaced = await withModelRegistryLock(async (tx) => {
    await tx.modelprovider.update({ where: { id: providerId }, data: { enabled: false } });
    const out: Array<{ workspaceId: string; to: string | null }> = [];
    for (const p of asDefaultPolicies) {
      // 该通道下的模型一律从白名单剔除，避免残留不可用项与该空间后续保存被拒
      let nextAllowed = readAllowed(p).filter((id) => !depIds.has(id));
      if (replacement) {
        if (!nextAllowed.includes(replacement.id)) nextAllowed = [...nextAllowed, replacement.id];
        await tx.workspace_model_policy.update({
          where: { workspaceId: p.workspaceId },
          data: { defaultDeploymentId: replacement.id, allowedDeploymentIds: nextAllowed },
        });
        out.push({ workspaceId: p.workspaceId, to: replacement.id });
      } else {
        await tx.workspace_model_policy.update({
          where: { workspaceId: p.workspaceId },
          data: { defaultDeploymentId: null, allowedDeploymentIds: nextAllowed },
        });
        out.push({ workspaceId: p.workspaceId, to: null });
      }
    }
    for (const p of whitelistPolicies) {
      if (asDefaultPolicies.some((x) => x.workspaceId === p.workspaceId)) continue;
      const nextAllowed = readAllowed(p).filter((id) => !depIds.has(id));
      await tx.workspace_model_policy.update({
        where: { workspaceId: p.workspaceId },
        data: { allowedDeploymentIds: nextAllowed },
      });
    }
    return out;
  });

  // 精准站内信：仅通知受影响空间所有者，不全站广播
  const affectedIds = Array.from(
    new Set([
      ...asDefaultPolicies.map((p) => p.workspaceId),
      ...whitelistPolicies.map((p) => p.workspaceId),
    ]),
  );
  if (affectedIds.length > 0) {
    const wsRows = await prisma.workspace.findMany({
      where: { id: { in: affectedIds } },
      select: { id: true, name: true, ownerId: true },
    });
    const defaultWs = new Set(asDefaultPolicies.map((p) => p.workspaceId));
    const notified = new Set<string>();
    for (const w of wsRows) {
      if (notified.has(w.ownerId)) continue;
      notified.add(w.ownerId);
      const isDefault = defaultWs.has(w.id);
      const content = replacement
        ? `系统通知：模型供应商通道「${provider.name}」已停用，该通道下模型全部不可使用${
            isDefault
              ? `，系统已暂时将空间「${w.name}」的默认模型切换为【${replacement.providerId}/${replacement.modelId}】`
              : ""
          }。请前往空间「模型」页按需调整。`
        : `系统通知：模型供应商通道「${provider.name}」已停用，该通道下模型全部不可使用${
            isDefault ? `，空间「${w.name}」的原默认模型已失效，请前往「模型」页重新设置默认` : ""
          }。`;
      await addNotification(w.ownerId, "模型供应商已停用通知", content, "model", "/workspace-hub", false).catch(
        () => {},
      );
    }
  }

  await writeModelAudit(actorId, "provider:disable", {
    providerId: provider.id,
    providerName: provider.name,
    reason: reason || null,
    replacementDeploymentId: replacement?.id || null,
    asDefault: asDefaultPolicies.length,
    inWhitelist: whitelistPolicies.length,
    affectedWorkspaces: affectedIds.length,
  });

  return {
    asDefault: asDefaultPolicies.length,
    inWhitelist: whitelistPolicies.length,
    workspaceIds: affectedIds,
    spaces: [],
    replaced,
  };
}

/** 创建定时禁用计划（到点由 cron 执行 applyModelDisable） */
export async function scheduleModelDisable(params: {
  deploymentId: string;
  effectiveAt: Date;
  replacementDeploymentId?: string | null;
  reason?: string | null;
  actorId: string | null;
}) {
  const { deploymentId, effectiveAt, replacementDeploymentId, reason, actorId } = params;
  if (replacementDeploymentId) {
    const r = await prisma.modeldeployment.findUnique({
      where: { id: replacementDeploymentId },
      select: { id: true, enabled: true },
    });
    if (!r || !r.enabled) throw new Error("REPLACEMENT_NOT_AVAILABLE");
  }
  return scheduleModel().create({
    data: {
      deploymentId,
      effectiveAt,
      replacementDeploymentId: replacementDeploymentId || null,
      reason: reason || null,
      status: "PENDING",
      createdBy: actorId,
    },
  });
}

/** 取消尚未生效的定时禁用计划 */
export async function cancelModelDisableSchedule(scheduleId: string) {
  return scheduleModel().update({ where: { id: scheduleId }, data: { status: "CANCELLED" } });
}

/** cron：处理到点的定时禁用计划（原子认领，进程内定时与外部调度并发也安全） */
export async function processDueModelDisables() {
  const now = new Date();
  const due = await scheduleModel().findMany({
    where: { status: "PENDING", effectiveAt: { lte: now } },
  });
  let processed = 0;
  for (const s of due) {
    // 原子认领：仅一个调用方能把 PENDING → PROCESSING，避免并发导致重复执行/重复通知
    const claimed = await scheduleModel().updateMany({
      where: { id: s.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (!claimed || claimed.count === 0) continue;
    try {
      await applyModelDisable({
        deploymentId: s.deploymentId,
        replacementDeploymentId: s.replacementDeploymentId,
        reason: s.reason,
        actorId: s.createdBy,
      });
      await scheduleModel().update({
        where: { id: s.id },
        data: { status: "DONE", processedAt: new Date() },
      });
      processed += 1;
    } catch (e) {
      // 失败回退为 PENDING，下一轮重试
      await scheduleModel()
        .update({ where: { id: s.id }, data: { status: "PENDING" } })
        .catch(() => {});
      console.error(
        "[model-disable-sweep] 处理禁用计划失败，已回退待下轮重试:",
        s.id,
        (e as Error)?.message,
      );
    }
  }
  return { due: due.length, processed };
}
