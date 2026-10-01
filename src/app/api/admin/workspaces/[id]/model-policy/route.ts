import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { withModelRegistryLock, ModelRegistryLockTimeoutError } from "@/lib/model-registry-lock";

/** GET：查询空间模型策略（默认模型 + 允许白名单） */
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
    const row = await prisma.workspace_model_policy.findUnique({ where: { workspaceId } });
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

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedRaw = Array.isArray(body.allowedDeploymentIds) ? (body.allowedDeploymentIds as unknown[]) : [];
    const allowed = allowedRaw.filter((v): v is string => typeof v === "string" && v.length > 0);

    // 校验部署存在性 + 写入策略必须在同一把模型注册表命名锁内完成：
    // 与「删除模型部署」共用同一锁，消除「删除检查通过后本请求写入新引用」的竞态
    // （allowedDeploymentIds 为 JSON，无法用数据库外键保护，必须靠该锁串行化）。
    const result = await withModelRegistryLock(async (tx) => {
      // 白名单必须是真实存在且「已启用」的部署：
      // 模型注册表中已禁用的模型一律不得进入空间白名单（受控），避免该空间引用到不可执行的模型
      if (allowed.length > 0) {
        const found = await tx.modeldeployment.findMany({
          where: { id: { in: allowed } },
          select: { id: true, enabled: true },
        });
        if (found.length !== allowed.length) {
          return {
            status: 400 as const,
            body: { success: false, error: "白名单包含不存在的模型部署 ID，请刷新后重试。" },
          };
        }
        const disabled = found.filter((f) => !f.enabled);
        if (disabled.length > 0) {
          return {
            status: 400 as const,
            body: { success: false, error: "白名单包含已在模型注册表禁用的模型，请先移除或重新启用后再保存。" },
          };
        }
      }

      let defaultId: string | null = null;
      if (typeof body.defaultDeploymentId === "string" && body.defaultDeploymentId) {
        const dep = await tx.modeldeployment.findUnique({
          where: { id: body.defaultDeploymentId },
          select: { id: true, enabled: true },
        });
        if (!dep) return { status: 400 as const, body: { success: false, error: "默认模型不存在" } };
        if (!dep.enabled)
          return {
            status: 400 as const,
            body: { success: false, error: "默认模型已在模型注册表禁用，不可作为空间默认模型，请另选模型" },
          };
        defaultId = dep.id;
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
