import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { withModelRegistryLock, ModelRegistryLockTimeoutError } from "@/lib/model-registry-lock";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";

/**
 * 前台「空间模型策略」API：允许空间所有者/管理员配置本空间的默认模型 + 官方模型白名单。
 * 与管理员后台 /api/admin/workspaces/[id]/model-policy 同一套校验与锁口径，仅鉴权不同
 * （这里认空间 OWNER/ADMIN，不再要求平台超管权限，普通用户无需进管理员后台）。
 */

async function assertSpaceManager(
  request: NextRequest,
  workspaceId: string,
): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return { ok: false, res: NextResponse.json({ success: false, error: "未授权" }, { status: 401 }) };
  }
  const userId = auth.user.id;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, ownerId: true } });
  if (!ws) {
    return { ok: false, res: NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 }) };
  }
  if (ws.ownerId === userId) return { ok: true, userId };
  const member = await prisma.workspacemember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  if (member && (member.role === "ADMIN" || member.role === "OWNER")) return { ok: true, userId };
  return { ok: false, res: NextResponse.json({ success: false, error: "仅空间所有者或管理员可配置模型策略" }, { status: 403 }) };
}

/** GET：当前策略 + 全部已启用官方部署（供勾选白名单） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;
    const check = await assertSpaceManager(request, workspaceId);
    if (!check.ok) return check.res;

    const row = await prisma.workspace_model_policy.findUnique({ where: { workspaceId } });
    const policy = {
      defaultDeploymentId: row?.defaultDeploymentId ?? null,
      allowedDeploymentIds: Array.isArray(row?.allowedDeploymentIds)
        ? (row!.allowedDeploymentIds as unknown as string[]).filter((v) => typeof v === "string")
        : [],
      configured: !!row,
    };

    // 全部已启用部署（所有者在此基础上勾选白名单）；deployment/pricing 无 BigInt，直接下发安全
    const deployments = await prisma.modeldeployment.findMany({
      where: { enabled: true, provider: { enabled: true } },
      include: { provider: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const safeDeployments = deployments.map((d) => ({
      id: d.id,
      providerId: d.providerId,
      providerName: (d as any).provider?.name || d.providerId,
      modelId: d.modelId,
      displayName: d.displayName || d.modelId,
      contextLimit: d.contextLimit,
      capabilities: Array.isArray(d.capabilities) ? (d.capabilities as string[]) : [],
    }));

    return NextResponse.json({ success: true, data: { policy, deployments: safeDeployments } });
  } catch (error) {
    console.error("[workspace model-policy] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询空间模型策略失败" }, { status: 500 });
  }
}

/** PUT：保存默认模型 + 白名单（校验 + 命名锁，口径同管理员后台） */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;
    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(workspaceId);
    const check = await assertSpaceManager(request, workspaceId);
    if (!check.ok) return check.res;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedRaw = Array.isArray(body.allowedDeploymentIds) ? (body.allowedDeploymentIds as unknown[]) : [];
    const allowed = allowedRaw.filter((v): v is string => typeof v === "string" && v.length > 0);

    const result = await withModelRegistryLock(async (tx) => {
      // 白名单：必须真实存在且「已启用」（含所属供应商通道启用），三处口径与执行路径一致，
      // 避免落库「列表看不见、执行却因供应商禁用而直接失败」的不一致状态。
      if (allowed.length > 0) {
        const found = await tx.modeldeployment.findMany({
          where: { id: { in: allowed } },
          select: { id: true, enabled: true, provider: { select: { enabled: true } } },
        });
        if (found.length !== allowed.length) {
          return { status: 400 as const, body: { success: false, error: "白名单包含不存在的模型部署 ID，请刷新后重试。" } };
        }
        if (found.some((f) => !f.enabled || !f.provider?.enabled)) {
          return {
            status: 400 as const,
            body: {
              success: false,
              error: "白名单包含已禁用的模型（模型自身被禁用，或其所属供应商通道已被禁用），请先移除或重新启用后再保存。",
            },
          };
        }
      }

      let defaultId: string | null = null;
      if (typeof body.defaultDeploymentId === "string" && body.defaultDeploymentId) {
        const dep = await tx.modeldeployment.findUnique({
          where: { id: body.defaultDeploymentId },
          select: { id: true, enabled: true, provider: { select: { enabled: true } } },
        });
        if (!dep) return { status: 400 as const, body: { success: false, error: "默认模型不存在" } };
        if (!dep.enabled)
          return { status: 400 as const, body: { success: false, error: "默认模型已在模型注册表禁用，不可作为空间默认模型，请另选模型" } };
        if (!dep.provider?.enabled)
          return {
            status: 400 as const,
            body: {
              success: false,
              error: "默认模型所属供应商通道已被禁用，不可作为空间默认模型，请先启用该供应商或另选模型",
            },
          };
        defaultId = dep.id;
      }

      // 授权制不变量：默认模型必须落在白名单内，否则会存下「默认模型被自身白名单排除、永远无法调度」的矛盾配置。
      // 自愈：默认模型不在白名单（含白名单为空的场景）时自动并入，绝不落库矛盾状态。
      if (defaultId && !allowed.includes(defaultId)) {
        allowed.push(defaultId);
      }

      const existing = await tx.workspace_model_policy.findUnique({ where: { workspaceId } });
      const row = existing
        ? await tx.workspace_model_policy.update({
            where: { workspaceId },
            data: { defaultDeploymentId: defaultId, allowedDeploymentIds: allowed, updatedAt: new Date() },
          })
        : await tx.workspace_model_policy.create({
            data: { id: randomUUID(), workspaceId, defaultDeploymentId: defaultId, allowedDeploymentIds: allowed },
          });
      return { status: 200 as const, body: { success: true, data: row } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ModelRegistryLockTimeoutError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("[workspace model-policy] 保存失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "保存空间模型策略失败" }, { status: 500 });
  }
}
