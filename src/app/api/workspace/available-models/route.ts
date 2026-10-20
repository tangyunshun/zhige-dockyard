import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import {
  loadSpaceModelPolicy,
  resolveActivePricingWithPeriod,
  resolveDefaultDeployment,
  listDeploymentPricingPeriods,
} from "@/lib/model-registry";
import { loadBillingConfig } from "@/lib/billing/billing-config";
import {
  mergeCapabilityLabels,
  MODEL_CAPABILITY_LABELS_KEY,
} from "@/lib/model-capability-labels";
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

    // 当前用户获批默认模型 & 我的申请状态（用于「申请使用」状态展示与运行时默认）
    const myPref = await prisma.workspace_member_model_preference
      .findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
      .catch(() => null);
    const myApprovedDefaultDeploymentId = myPref && !myPref.isAuto ? myPref.deploymentId : null;

    const myApps = await prisma.modelapplication
      .findMany({
        where: { workspaceId, applicantId: userId },
        select: { deploymentId: true, status: true },
      })
      .catch(() => [] as { deploymentId: string; status: string }[]);
    const appStatusByDeployment: Record<string, string> = {};
    for (const a of myApps) appStatusByDeployment[a.deploymentId] = a.status;

    // 1. 读取空间策略（effective = 白名单 − 禁用，唯一权威可用集）
    const policy = await loadSpaceModelPolicy(workspaceId);
    const effectiveIdSet = new Set(policy.effectiveDeploymentIds || []);

    // 2. 平台系统模型池：仅查询双方启用的部署
    const allDeployments = await prisma.modeldeployment.findMany({
      where: {
        enabled: true,
        provider: { enabled: true },
      },
      include: { provider: true },
      orderBy: { createdAt: "asc" },
    });

    // 展示口径与执行门禁严格一致：仅展示 effective（白名单 − 禁用）内的模型，
    // 杜绝「能跑却看不见 / 看得见不能跑」的矛盾。
    const filteredDeployments = allDeployments.filter((d) => effectiveIdSet.has(d.id));

    // 已下线但仍在白名单的模型：用于前端"置灰 [已下线]、不隐藏"的展示（仅作可见性提示，不可调度）。
    const offlineDeployments = await prisma.modeldeployment.findMany({
      where: { id: { in: policy.allowedDeploymentIds || [] } },
      include: { provider: { select: { name: true, enabled: true } } },
    });
    const offlineModels = offlineDeployments
      .filter((d) => !d.enabled || !d.provider?.enabled)
      .map((d) => ({
        id: d.id,
        providerId: d.providerId,
        modelId: d.modelId,
        displayName: d.displayName || d.modelId,
        reason: !d.enabled ? "该模型已被平台停用" : "该模型所属供应商已被停用",
      }));

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
          // 白名单为唯一真源：此处展示的均为已授权模型
          source: "SPACE_ALLOWED",
          // 当前用户对该模型的申请状态（PENDING/APPROVED/REJECTED/null），用于「申请使用」入口展示
          myApplicationStatus: appStatusByDeployment[dep.id] || null,
          pricing: pricingDto,
          // 该部署的全部已启用计价时段（高峰/闲时/节假日等），供前台罗列完整分时段计价
          pricingPeriods: await listDeploymentPricingPeriods(dep.id),
        };
      }),
    );

    // 3. 空间自带模型（BYO）—— 按 Req8 跨个人/企业空间聚合，成员级可见性
    await ensureByoShareWithMembersColumn();

    const wsType: string = (ws?.type as string) || "PERSONAL";

    // 计费配置（含 BYO 平台服务费率，单一真源 billing.byokServiceRateBps，后台可配）
    const billing = await loadBillingConfig();

    // 能力展示名字典：数据库 systemsetting 优先（管理员可配），未配置时回退内置字典
    const capSetting = await prisma.systemsetting
      .findUnique({ where: { key: MODEL_CAPABILITY_LABELS_KEY }, select: { value: true } })
      .catch(() => null);
    const capabilityLabels = mergeCapabilityLabels(capSetting?.value);

    // 构造单条 BYO 脱敏视图（密钥绝不返回）
    const buildByoView = async (
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
      // 反查该空间生效行对应的中央模型库定义 id（用于「绑定到本空间」与跨空间去重），并取创建者
      const assignment = await prisma.user_byo_model_assignment
        .findFirst({
          where: { workspaceId: sourceWorkspaceId },
          select: { defId: true, def: { select: { ownerUserId: true } } },
        })
        .catch(() => null);
      const creatorUserId = assignment?.def?.ownerUserId ?? null;
      // 私有归属（负责人 2026-10-15 拍板）：自带模型归其模型库创建者所有，
      // 非创建者一律不可见、不可用（仅 legacy 无主数据沿用 shareWithMembers 旧规则）
      if (creatorUserId && creatorUserId !== userId) return null;
      return {
        configured: true,
        id: `byo:${sourceWorkspaceId}`,
        sourceWorkspaceId,
        defId: assignment?.defId ?? null,
        creatorUserId,
        boundToCurrentSpace: sourceWorkspaceId === workspaceId,
        scope, // SPACE=空间共享模型；PERSONAL_MEMBER=成员个人模型（仅本人可见）
        label: row.label,
        // 上游模型名：库定义的 label 同时作为调用时下发的 upstreamModel，供详情弹窗准确展示
        modelId: row.label,
        providerName: (row.providerName as string) || "",
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
          byokServiceRateBps: billing.byokServiceRateBps, // 平台基础服务费（后台可配，单一真源 billing.byokServiceRateBps）
        },
      };
    };

    const byoModels: any[] = [];
    const seenDefIds = new Set<string>();
    // 推入并按 defId 去重：同一模型绑定多个空间时只展示一条（优先“已绑本空间”的那条，因 3a 先入）
    const pushByo = async (view: any) => {
      if (view.defId) {
        if (seenDefIds.has(view.defId)) return;
        seenDefIds.add(view.defId);
      }
      byoModels.push(view);
    };

    // 3a. 当前空间自身 BYO（仅模型创建者本人可见/可用；非创建者返回 null 跳过）
    const currentByoRow = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
    if (currentByoRow) {
      const view = await buildByoView(currentByoRow, workspaceId, ws?.ownerId || "", "SPACE");
      if (view) await pushByo(view);
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
            const view = await buildByoView(pRow, pw.id, pw.ownerId, "PERSONAL_MEMBER");
            if (view) await pushByo(view);
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
          const view = await buildByoView(eRow, ew.id, ew.ownerId, "SPACE");
          if (view) await pushByo(view);
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
        // 仅显示完整模型名（不带"空间自带模型"等描述前缀），空间不足时由前端省略号截断
        label: defaultPlan.modelId,
      };
    } catch {
      // 区分「空间配了默认但该默认已被平台禁用」与「根本没配默认」：
      // 前者明确下发 DISABLED，让工作台提示"默认已停用、请重选"，而非误显示"未配置默认模型"。
      if (policy.defaultDeploymentId) {
        const dd = await prisma.modeldeployment.findUnique({
          where: { id: policy.defaultDeploymentId },
          select: { modelId: true, enabled: true, provider: { select: { enabled: true } } },
        });
        if (dd && (!dd.enabled || dd.provider?.enabled === false)) {
          defaultTarget = {
            source: "DISABLED",
            targetDeploymentId: policy.defaultDeploymentId,
            label: dd.modelId || "默认模型",
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        isOwner,
        systemModels,
        offlineModels,
        byoModel,
        byoModels,
        defaultTarget,
        policyConfigured: policy.configured,
        configuredAllowedCount: policy.configured ? policy.allowedDeploymentIds.length : null,
        // 当前用户在本空间获批的默认模型（按 用户×空间 持久化），运行时默认选用依据
        myApprovedDefaultDeploymentId: myApprovedDefaultDeploymentId || null,
        // 兼容层别名映射（彻底保障前后端消费统一与健壮性）
        models: systemModels,
        byo: byoModel,
        defaultDeploymentId: defaultTarget.targetDeploymentId || null,
        byoServiceRateBps: billing.byokServiceRateBps,
        capabilityLabels,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "获取空间可用模型失败" },
      { status: 500 },
    );
  }
}
