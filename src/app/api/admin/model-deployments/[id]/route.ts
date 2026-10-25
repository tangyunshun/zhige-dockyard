import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import {
  getModelDisableImpact,
  applyModelDisable,
  scheduleModelDisable,
} from "@/lib/model-disable-service";
import { withModelRegistryLock, ModelRegistryLockTimeoutError } from "@/lib/model-registry-lock";
import { PLATFORM_DEFAULT_DEPLOYMENT_KEY } from "@/lib/model-registry";
import { ALLOWED_MODEL_CAPABILITIES } from "@/lib/component-contract/capabilities";

// 注意：价格字段不在更新白名单内——价格唯一真源为 modelpricing（走 /api/admin/model-pricing/[deploymentId]）
const ALLOWED_UPDATE_FIELDS = ["upstreamModel", "displayName", "contextLimit", "enabled", "capabilities"] as const;

/** PATCH：更新模型部署（含启用/禁用开关，禁用后直接阻断执行且不回落环境变量） */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const exists = await prisma.modeldeployment.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ success: false, error: "模型部署不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // 启用态冻结：运行中的模型不允许改写「能力/上游名/展示名/上下文」等会影响执行与计费的字段。
    // 注意：enabled 字段本身永远放行（否则管理员无法停用模型进入可编辑状态）。
    const touchesLockedField = (["upstreamModel", "displayName", "contextLimit", "capabilities"] as const).some(
      (k) => body[k] !== undefined,
    );
    if (exists.enabled && touchesLockedField) {
      return NextResponse.json(
        {
          success: false,
          code: "DEPLOYMENT_ENABLED_LOCKED",
          error: "模型启用中：请先在管理后台「停用」该模型，再修改能力、上游模型名、展示名或上下文",
        },
        { status: 409 },
      );
    }
    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ALLOWED_UPDATE_FIELDS) {
      const value = body[key];
      if (value === undefined) continue;
      if (key === "enabled") {
        if (typeof value === "boolean") data.enabled = value;
        continue;
      }
      if (key === "upstreamModel" || key === "displayName") {
        if (typeof value === "string") data[key] = value.trim();
        continue;
      }
      if (key === "capabilities") {
        // 数据库驱动的模型能力声明：仅接受抽象能力白名单，去重规范化，拒绝具体厂商/模型名
        if (Array.isArray(value)) {
          const normalized = Array.from(
            new Set(
              value
                .filter((v): v is string => typeof v === "string")
                .map((v) => v.trim().toUpperCase())
                .filter((v) => v.length > 0),
            ),
          );
          const invalid = normalized.filter((v) => !(ALLOWED_MODEL_CAPABILITIES as ReadonlySet<string>).has(v));
          if (invalid.length > 0) {
            return NextResponse.json(
              { success: false, error: `不支持的模型能力: ${invalid.join(", ")}` },
              { status: 400 },
            );
          }
          data.capabilities = normalized;
        }
        continue;
      }
      const n = Number(value);
      if (Number.isFinite(n)) data[key] = n;
    }

    const isDisabling = data.enabled === false;
    const isEnabling = data.enabled === true;

    // 禁用：走统一服务（立即 / 定时），内含影响面、强制替代、精准通知、审计
    if (isDisabling) {
      const replacementDeploymentId =
        typeof body.replacementDeploymentId === "string" && body.replacementDeploymentId
          ? body.replacementDeploymentId
          : null;
      const reason = typeof body.reason === "string" ? body.reason.trim() : null;
      const impact = await getModelDisableImpact(id);

      // 强制替代：若是某些空间的默认模型，必须选一个可用替代模型才能禁用
      if (impact.asDefault > 0 && !replacementDeploymentId) {
        return NextResponse.json(
          {
            success: false,
            code: "REPLACEMENT_REQUIRED",
            error: `该模型是 ${impact.asDefault} 个空间的默认模型，必须选择一个可用的替代模型后再禁用`,
            impact,
          },
          { status: 400 },
        );
      }

      // 定时禁用：到点由 /api/cron/model-disable-sweep 执行
      if (body.mode === "scheduled") {
        const effectiveAt = typeof body.effectiveAt === "string" ? new Date(body.effectiveAt) : null;
        if (!effectiveAt || isNaN(effectiveAt.getTime()) || effectiveAt.getTime() <= Date.now()) {
          return NextResponse.json(
            { success: false, error: "请选择有效的定时生效时间（需晚于当前时间）" },
            { status: 400 },
          );
        }
        const schedule = await scheduleModelDisable({
          deploymentId: id,
          effectiveAt,
          replacementDeploymentId,
          reason,
          actorId: auth.user?.id || "",
        });
        await writeAuditLog(
          auth.user?.id || "",
          "model:schedule_disable",
          {
            deploymentId: id,
            effectiveAt: effectiveAt.toISOString(),
            replacementDeploymentId,
            reason,
            asDefault: impact.asDefault,
            inWhitelist: impact.inWhitelist,
          },
          null,
          undefined,
          request,
        );
        return NextResponse.json({
          success: true,
          scheduled: true,
          schedule: { id: schedule.id, effectiveAt: schedule.effectiveAt },
          impact,
        });
      }

      // 立即禁用：翻开关 + 替换受影响默认 + 精准通知 + 审计
      try {
        const result = await applyModelDisable({
          deploymentId: id,
          replacementDeploymentId,
          reason,
          actorId: auth.user?.id || "",
        });
        const row = await prisma.modeldeployment.findUnique({ where: { id } });
        return NextResponse.json({ success: true, data: row, impact: result });
      } catch (e) {
        if ((e as Error)?.message === "REPLACEMENT_NOT_AVAILABLE") {
          return NextResponse.json(
            { success: false, error: "替代模型不存在或已被禁用，请另选一个" },
            { status: 400 },
          );
        }
        throw e;
      }
    }

    // 其它字段更新 / 启用（启用只翻开关、不改回用户配置，符合需求）
    const row = await prisma.modeldeployment.update({ where: { id }, data });
    if (isEnabling) {
      await writeAuditLog(
        auth.user?.id || "",
        "model:enable",
        { deploymentId: id, providerId: exists.providerId, modelId: exists.modelId },
        null,
        undefined,
        request,
      );
    }
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[model-deployment] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "更新模型部署失败" }, { status: 500 });
  }
}

/** GET：预览禁用某模型的影响面 + 可选替代模型（供禁用前模态框展示） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const [impact, replacements] = await Promise.all([
      getModelDisableImpact(id),
      prisma.modeldeployment.findMany({
        where: { enabled: true, id: { not: id } },
        select: { id: true, providerId: true, modelId: true, displayName: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return NextResponse.json({ success: true, data: { impact, replacements } });
  } catch (error) {
    console.error("[model-deployment] 影响面预览失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "获取影响面失败" }, { status: 500 });
  }
}

/** DELETE：删除模型部署 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const exists = await prisma.modeldeployment.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ success: false, error: "模型部署不存在" }, { status: 404 });

    // 引用检查 + 删除必须在同一把模型注册表命名锁内完成：
    // 与「写入空间模型策略」共用同一锁，消除「检查通过后并发写入新引用」的竞态。
    const result = await withModelRegistryLock(async (tx) => {
      // 平台默认部署引用检查（第一优先级）：
      // 命中 system_config.PLATFORM_DEFAULT_DEPLOYMENT_ID = 当前 deploymentId 时直接 409，
      // 避免删除后「平台默认模型」突然消失、进而导致所有未配置空间默认的空间无法裁决执行模型。
      const platformDefault = await tx.systemconfig.findUnique({
        where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
      });
      if (platformDefault?.value === id) {
        return {
          status: 409 as const,
          body: {
            success: false,
            code: "PLATFORM_DEFAULT_DEPLOYMENT_IN_USE",
            error:
              "该模型部署正被配置为平台默认模型（system_config.PLATFORM_DEFAULT_DEPLOYMENT_ID），" +
              "请先在后台改选其他平台默认模型、或清除该配置后再删除。",
          },
        };
      }

      // 锁内重新统计引用（defaultDeploymentId / allowedDeploymentIds）
      const policies = await tx.workspace_model_policy.findMany();
      const referencedBy = policies
        .filter((p) => {
          if (p.defaultDeploymentId === id) return true;
          const ids = Array.isArray(p.allowedDeploymentIds)
            ? (p.allowedDeploymentIds as unknown as string[])
            : [];
          return ids.includes(id);
        })
        .map((p) => p.workspaceId);
      if (referencedBy.length > 0) {
        return {
          status: 409 as const,
          body: {
            success: false,
            error: `该模型部署仍被 ${referencedBy.length} 个空间的模型策略引用（${referencedBy.slice(0, 5).join("、")}），请先解除引用（改为禁用）后再删除。`,
          },
        };
      }

      // 同一事务内先删价格再删部署，保证两表状态一致、杜绝价格孤儿。
      // （modelpricing.deploymentId 另有 ON DELETE CASCADE 外键作为第二层保障。）
      await tx.modelpricing.deleteMany({ where: { deploymentId: id } });
      await tx.modeldeployment.delete({ where: { id } });
      return { status: 200 as const, body: { success: true } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // 数据库外键兜底：defaultDeploymentId 为 RESTRICT，理论上锁内检查已覆盖，此处仍显式转换
    const code = (error as { code?: string })?.code;
    if (code === "P2003") {
      return NextResponse.json(
        { success: false, error: "该模型部署仍被空间模型策略引用，请先解除引用后再删除。" },
        { status: 409 },
      );
    }
    if (error instanceof ModelRegistryLockTimeoutError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("[model-deployment] 删除失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "删除模型部署失败" }, { status: 500 });
  }
}
