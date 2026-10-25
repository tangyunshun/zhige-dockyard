import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, isPlatformAdminRole } from "@/lib/security";
import { withModelRegistryLock, ModelRegistryLockTimeoutError } from "@/lib/model-registry-lock";
import { loadFreeDefaultDeploymentIds } from "@/lib/platform-default-models";

/** GET：查询空间模型策略（默认模型 + 允许白名单 + 平台默认初始清单，供后台标注来源） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string; workspaceId?: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const resolved = await params;
    const workspaceId = resolved.id || resolved.workspaceId || "";
    const [row, freeDefaultDeploymentIds] = await Promise.all([
      prisma.workspace_model_policy.findUnique({ where: { workspaceId } }),
      loadFreeDefaultDeploymentIds(),
    ]);
    return NextResponse.json({
      success: true,
      data: row
        ? {
            id: row.id,
            workspaceId: row.workspaceId,
            defaultDeploymentId: row.defaultDeploymentId,
            allowedDeploymentIds: Array.isArray(row.allowedDeploymentIds)
              ? (row.allowedDeploymentIds as unknown as string[])
              : [],
          }
        : null,
      // 平台默认初始清单：供后台在空间模型策略里标注「平台默认初始」来源，让管理员一眼分清
      freeDefaultDeploymentIds,
    });
  } catch (error) {
    console.error("[model-policy] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询空间模型策略失败" }, { status: 500 });
  }
}

/** PUT：创建或更新空间模型策略 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string; workspaceId?: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const resolved = await params;
    const workspaceId = resolved.id || resolved.workspaceId || "";

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, plan: true } });
    if (!workspace) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedRaw = Array.isArray(body.allowedDeploymentIds) ? (body.allowedDeploymentIds as unknown[]) : [];
    const allowed = allowedRaw.filter((v): v is string => typeof v === "string" && v.length > 0);

    // 可分配系统模型数量上限（套餐维度）：仅约束「管理员额外授权」的模型；
    // 平台默认初始模型是各空间基线，不占套餐配额（否则基线数量本身就可能超过低配套餐上限）。
    // 平台超级管理员 / 管理员不受该套餐配额限制（直接拉满）。
    const planKey = workspace?.plan || "STANDARD";
    const planRow = await prisma.workspaceplan.findUnique({ where: { key: planKey } });
    const planMaxModels = planRow ? Number(planRow.maxModelAllocations) : 0;
    if (planMaxModels > 0 && !isPlatformAdminRole(auth.user?.role)) {
      const freeDefaultSet = new Set(await loadFreeDefaultDeploymentIds());
      const extraCount = allowed.filter((id) => !freeDefaultSet.has(id)).length;
      if (extraCount > planMaxModels) {
        return NextResponse.json(
          {
            success: false,
            error: `可分配系统模型数量超过套餐上限（${planMaxModels} 个，不含平台默认初始模型）`,
          },
          { status: 400 },
        );
      }
    }

    // 校验部署存在性 + 写入策略必须在同一把模型注册表命名锁内完成：
    // 与「删除模型部署」共用同一锁，消除「删除检查通过后本请求写入新引用」的竞态
    // （allowedDeploymentIds 为 JSON，无法用数据库外键保护，必须靠该锁串行化）。
    const result = await withModelRegistryLock(async (tx) => {
      // 白名单必须是真实存在且「已启用」的部署：
      // 模型注册表中已禁用的模型一律不得进入空间白名单（受控），避免该空间引用到不可执行的模型。
      // 供应商通道一并校验：供应商被禁用时其下模型同样不可执行（与 available-models / 执行路径口径一致），
      // 否则会落库「白名单有它、列表看不见、执行直接失败」的三不一致状态。
      if (allowed.length > 0) {
        const found = await tx.modeldeployment.findMany({
          where: { id: { in: allowed } },
          select: { id: true, enabled: true, provider: { select: { enabled: true } } },
        });
        if (found.length !== allowed.length) {
          return {
            status: 400 as const,
            body: { success: false, error: "白名单包含不存在的模型部署 ID，请刷新后重试。" },
          };
        }
        const disabled = found.filter((f) => !f.enabled || !f.provider?.enabled);
        if (disabled.length > 0) {
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
          return {
            status: 400 as const,
            body: { success: false, error: "默认模型已在模型注册表禁用，不可作为空间默认模型，请另选模型" },
          };
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

      // 授权制（方案 A）不变量：默认模型必须落在白名单内，否则会存下
      // 「默认模型被自身白名单排除、永远无法调度」的矛盾配置（含白名单为空的场景，此前被 allowed.length>0 漏放行）。
      // 自愈：默认模型不在白名单时自动并入，绝不落库矛盾状态。
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
            data: {
              id: randomUUID(),
              workspaceId,
              defaultDeploymentId: defaultId,
              allowedDeploymentIds: allowed,
            },
          });

      return { status: 200 as const, body: { success: true, data: row } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ModelRegistryLockTimeoutError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    const code = (error as { code?: string })?.code;
    if (code === "P2003") {
      return NextResponse.json(
        { success: false, error: "引用的模型部署已被删除，请刷新后重试。" },
        { status: 400 },
      );
    }
    console.error("[model-policy] 保存失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "保存空间模型策略失败" }, { status: 500 });
  }
}
