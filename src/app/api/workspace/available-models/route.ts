import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import {
  loadSpaceModelPolicy,
  resolveActivePricingWithPeriod,
  resolveDefaultDeployment,
  listDeploymentPricingPeriods,
} from "@/lib/model-registry";
import { resolveEffectiveUserPrice } from "@/lib/model-pricing";
import {
  normCapabilities,
  ensureByoShareWithMembersColumn,
} from "@/lib/workspace-byo-model";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/available-models?workspaceId=xxx
 *
 * 空间成员鉴权：返回该空间可用的模型全量视图（MODEL-SELECT-E1）
 * 1. 白名单内已启用的平台系统模型（含供应商、能力标签、时段生效价）；
 * 2. 空间自带模型（脱敏仅返回 label/协议/端点域名/能力/启用状态/共享状态，密钥绝不返回）；
 * 3. 智能默认模型指向（auto 目标）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(request.url);
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
    }

    // 空间成员权限校验
    const [member, ws] = await Promise.all([
      prisma.workspacemember.findFirst({
        where: { workspaceId, userId },
        select: { id: true, role: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, ownerId: true, type: true },
      }),
    ]);

    const isOwner = ws?.ownerId === userId;
    if (!ws || (!member && !isOwner)) {
      return NextResponse.json({ success: false, error: "无权访问该工作空间模型池" }, { status: 403 });
    }

    // 1. 读取空间策略与白名单
    const policy = await loadSpaceModelPolicy(workspaceId);

    // 2. 平台系统模型池：仅查询双方启用的部署，并按空间白名单严格过滤
    const allDeployments = await prisma.modeldeployment.findMany({
      where: {
        enabled: true,
        provider: { enabled: true },
      },
      include: { provider: true },
      orderBy: { createdAt: "asc" },
    });

    // 严格遵循空间策略白名单：仅展示管理员后台为该空间授权的模型；未配置策略（或白名单为空）则展示 0 款，绝不把全站模型池兜底漏出
    const filteredDeployments = policy.configured
      ? allDeployments.filter((d) => (policy.allowedDeploymentIds || []).includes(d.id))
      : [];

    const systemModels = await Promise.all(
      filteredDeployments.map(async (dep) => {
        const { pricing, activePeriodId } = await resolveActivePricingWithPeriod(dep.id);

        let activePeriodInfo: {
          id: string;
          name: string;
          kind: string;
          markupRate: number | null;
        } | null = null;

        if (activePeriodId) {
          try {
            const periodRow = await prisma.modelpricingperiod.findUnique({
              where: { id: activePeriodId },
              select: { id: true, name: true, kind: true, markupRateBps: true },
            });
            if (periodRow) {
              activePeriodInfo = {
                id: periodRow.id,
                name: periodRow.name,
                kind: periodRow.kind,
                markupRate: periodRow.markupRateBps != null ? periodRow.markupRateBps / 10000 : null,
              };
            }
          } catch {
            // 时段非关键容错
          }
        }

        // 售价统一走「有效用户售价」（DIRECT_PRICE 直取 / COST_PLUS_MARKUP 成本×加价率推导），与模型定价页口径完全一致
        const eff = pricing ? resolveEffectiveUserPrice(pricing) : null;

        const pricingDto = pricing
          ? {
              currency: pricing.currency || "CNY",
              priceInputMicrosPerMillion: eff?.inputMicrosPerMillion ?? null,
              priceOutputMicrosPerMillion: eff?.outputMicrosPerMillion ?? null,
              priceCacheReadMicrosPerMillion: eff?.cacheReadMicrosPerMillion ?? null,
              priceCacheWriteMicrosPerMillion: eff?.cacheWriteMicrosPerMillion ?? null,
              costInputMicrosPerMillion: pricing.costInputMicrosPerMillion,
              costOutputMicrosPerMillion: pricing.costOutputMicrosPerMillion,
              priceSource: pricing.priceSource,
              priceStatus: pricing.priceStatus,
              markupRateBps: pricing.markupRateBps,
              // 时段信息：闲时、忙时、假日、日常主流
              activePeriodId: activePeriodId || null,
              activePeriodName: activePeriodInfo?.name || (activePeriodId ? "时段价" : "日常主流基准价"),
              activePeriodKind: activePeriodInfo?.kind || "REGULAR",
              isPeriodActive: Boolean(activePeriodId),
              markupRate: activePeriodInfo?.markupRate || null,
              // 防 undefined 兼容换算字段（微元 / 10,000 = 分/千Tokens，换算点数）
              unitType: "PER_TOKEN",
              inputPricePerK:
                eff?.inputMicrosPerMillion != null ? +(eff.inputMicrosPerMillion / 10000).toFixed(4) : 0,
              outputPricePerK:
                eff?.outputMicrosPerMillion != null ? +(eff.outputMicrosPerMillion / 10000).toFixed(4) : 0,
              pricePerCall: 0,
            }
          : null;

        return {
          id: dep.id,
          providerId: dep.providerId,
          providerName: dep.provider.name,
          modelId: dep.modelId,
          displayName: dep.displayName || dep.modelId,
          upstreamModel: dep.upstreamModel || dep.modelId,
          capabilities: Array.isArray(dep.capabilities) ? (dep.capabilities as string[]) : [],
          contextLimit: dep.contextLimit,
          isSpaceDefault: policy.defaultDeploymentId === dep.id,
          pricing: pricingDto,
          // 该部署的全部已启用计价时段（高峰/闲时/节假日等），供前台罗列完整分时段计价
          pricingPeriods: await listDeploymentPricingPeriods(dep.id),
        };
      }),
    );

    // 3. 空间自带模型（BYO）—— 按 Req8 跨个人/企业空间聚合，成员级可见性
    await ensureByoShareWithMembersColumn();

    const wsType: string = (ws?.type as string) || "PERSONAL";

    // 构造单条 BYO 脱敏视图（密钥绝不返回）
    const buildByoView = (
      row: any,
      sourceWorkspaceId: string,
      sourceOwnerId: string,
      scope: "SPACE" | "PERSONAL_MEMBER",
    ) => {
      let endpointHost = "";
      try {
        endpointHost = new URL(row.baseUrl).host;
      } catch {
        endpointHost = row.baseUrl.replace(/^https?:\/\//i, "").split("/")[0] || "custom-endpoint";
      }
      const shared = row.shareWithMembers !== false;
      const isSourceOwner = userId === sourceOwnerId;
      const canUse = shared || isSourceOwner;
      return {
        configured: true,
        id: `byo:${sourceWorkspaceId}`,
        sourceWorkspaceId,
        scope, // SPACE=空间共享模型；PERSONAL_MEMBER=成员个人模型（仅本人可见）
        label: row.label,
        protocol: row.protocol,
        endpointHost,
        capabilities: normCapabilities(row.capabilities),
        contextLimit: row.contextLimit,
        enabled: row.enabled,
        shareWithMembers: shared,
        canUse,
        reason: canUse ? null : "该自带模型未开启全员共享，仅所有者可用",
        pricing: {
          priceInputMicrosPerMillion: row.priceInputMicrosPerMillion,
          priceOutputMicrosPerMillion: row.priceOutputMicrosPerMillion,
          priceCacheReadMicrosPerMillion: null,
          priceCacheWriteMicrosPerMillion: null,
          byokServiceRateBps: 1500, // 平台基础服务费 15%
        },
      };
    };

    const byoModels: any[] = [];

    // 3a. 当前空间自身 BYO（空间内所有成员可见/可用）
    const currentByoRow = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
    if (currentByoRow) {
      byoModels.push(buildByoView(currentByoRow, workspaceId, ws?.ownerId || "", "SPACE"));
    }

    if (wsType === "ENTERPRISE") {
      // 3b. 企业空间：聚合各成员个人空间的 BYO，仅对应成员本人可见（其他成员不可见）
      const memberRows = await prisma.workspacemember.findMany({
        where: { workspaceId },
        select: { userId: true },
      });
      const memberIds = Array.from(new Set(memberRows.map((m) => m.userId)));
      if (memberIds.length > 0) {
        const personalWorkspaces = await prisma.workspace.findMany({
          where: { ownerId: { in: memberIds }, type: "PERSONAL" },
          select: { id: true, ownerId: true },
        });
        for (const pw of personalWorkspaces) {
          // 仅当请求用户就是该个人空间所有者时才纳入（保障仅本人可见）
          if (pw.ownerId !== userId) continue;
          const pRow = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: pw.id } });
          if (pRow) {
            byoModels.push(buildByoView(pRow, pw.id, pw.ownerId, "PERSONAL_MEMBER"));
          }
        }
      }
    } else if (wsType === "PERSONAL") {
      // 3c. 个人空间：聚合本人拥有的企业空间的 BYO（企业空间所有者可见，且企业内全员可用）
      const ownedEnterprise = await prisma.workspace.findMany({
        where: { ownerId: userId, type: "ENTERPRISE" },
        select: { id: true, ownerId: true },
      });
      for (const ew of ownedEnterprise) {
        const eRow = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: ew.id } });
        if (eRow) {
          byoModels.push(buildByoView(eRow, ew.id, ew.ownerId, "SPACE"));
        }
      }
    }

    const byoModel = byoModels.length > 0 ? byoModels[0] : null;

    // 4. 当前智能默认指向（auto 解析结果）
    let defaultTarget = {
      source: "NONE",
      targetDeploymentId: "",
      label: "未配置默认模型",
    };
    try {
      const defaultPlan = await resolveDefaultDeployment({
        workspaceId,
        requiredCapabilities: ["TEXT_GENERATION"],
        userId,
      });
      defaultTarget = {
        source: defaultPlan.defaultSource,
        targetDeploymentId: defaultPlan.deploymentId,
        label:
          defaultPlan.defaultSource === "WORKSPACE_BYO"
            ? `空间自带模型（${defaultPlan.modelId}）`
            : defaultPlan.modelId,
      };
    } catch {
      // 无法自动裁决时保持 NONE
    }

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        isOwner,
        systemModels,
        byoModel,
        byoModels,
        defaultTarget,
        policyConfigured: policy.configured,
        configuredAllowedCount: policy.configured ? policy.allowedDeploymentIds.length : null,
        // 兼容层别名映射（彻底保障前后端消费统一与健壮性）
        models: systemModels,
        byo: byoModel,
        defaultDeploymentId: defaultTarget.targetDeploymentId || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "获取空间可用模型失败" },
      { status: 500 },
    );
  }
}
