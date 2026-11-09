import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { resolveDefaultDeployment, resolveDeploymentForWorkspace } from "@/lib/model-registry";
import { extractRequiredCapabilities } from "@/lib/component-contract/capabilities";
import { pointsToYuan, YUAN_PER_POINT } from "@/lib/point-rate";
import {
  estimatePoints,
  splitTokenEstimate,
  resolvePricingSource,
} from "@/lib/billing/pricing-center";
import {
  loadBillingConfig,
  isComponentSettlementEnabled,
} from "@/lib/billing/billing-config";
import { isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";

// 估价随配置实时变化，禁止静态缓存
export const dynamic = "force-dynamic";

/**
 * GET：执行前只读估价（零副作用、不写库、不调用模型）。
 * 入参：componentId、workspaceId（必填）。
 *
 * 计费双轨制（全链路统一口径）：
 * - 平台模型：管理员在后台为组件配置的 estimatedModelTokens 即每次执行的固定扣点数；
 * - 用户自带模型（BYOK，deploymentId = byo:<workspaceId>）：按用户登记的厂商官方单价
 *   × Token 用量 × (1 + byokServiceRateBps 服务费率，默认 15%) 换算，平台只收服务费。
 * 模型裁决仅做「能否执行」门禁（能力满足与否）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const componentId = (searchParams.get("componentId") || "").trim();
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    if (!componentId || !workspaceId) {
      return NextResponse.json(
        { success: false, error: "缺少 componentId 或 workspaceId" },
        { status: 400 },
      );
    }

    // 仅本人所属空间可估价，避免泄露他空间模型裁决结果
    const membership = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: auth.user.id },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "无权估价该空间" }, { status: 403 });
    }

    const comp = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
      select: { id: true, name: true, estimatedModelTokens: true, activeContractId: true },
    });
    if (!comp) {
      return NextResponse.json({ success: false, error: "组件不存在" }, { status: 404 });
    }

    // 组件固定点数（平台模型分支的扣点真源；BYOK 分支作为 Token 用量的最后兜底估算）
    const fixedPoints = Number(comp.estimatedModelTokens);
    if (!Number.isFinite(fixedPoints) || fixedPoints <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "组件算力成本未配置（管理员后台未配置固定扣点数），无法估价",
          code: "COMPONENT_COST_NOT_CONFIGURED",
        },
        { status: 400 },
      );
    }

    // 合同能力门禁：与真实执行一致（无激活合同 / 未声明能力 → 不可执行也就无从估价）
    let requiredCapabilities: string[] = [];
    let maxOutputTokens: number | null = null;
    let contractEstimatedTokens: number | null = null;
    if (comp.activeContractId) {
      const contractRow = await prisma.componentcontract.findUnique({
        where: { id: comp.activeContractId },
        select: { contract: true },
      });
      const c = contractRow?.contract as
        | {
            executionPlan?: { steps?: Array<{ requiredCapabilities?: string[]; maxOutputTokens?: number }> };
            billingPolicy?: { estimatedTokens?: number };
          }
        | null
        | undefined;
      requiredCapabilities = extractRequiredCapabilities(c ?? null);
      const steps = Array.isArray(c?.executionPlan?.steps) ? c!.executionPlan!.steps! : [];
      const sum = steps.reduce(
        (acc, s) => acc + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0),
        0,
      );
      maxOutputTokens = sum > 0 ? sum : null;
      // 合同声明的估算 Token（billingPolicy.estimatedTokens）：BYOK 计价的次优先来源
      const declared = (c as any)?.billingPolicy?.estimatedTokens;
      contractEstimatedTokens = typeof declared === "number" && declared > 0 ? declared : null;
    }
    if (requiredCapabilities.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "该组件无激活合同或未声明模型能力，无法估价",
          code: "MODEL_CAPABILITY_NOT_DECLARED",
        },
        { status: 400 },
      );
    }

    // 模型裁决：与真实执行同口径（默认模型能力门禁；同时决定计费走哪条轨道）
    const requestedDeploymentId = (searchParams.get("deploymentId") || "").trim();
    const plan = (!requestedDeploymentId || requestedDeploymentId === "auto")
      ? await resolveDefaultDeployment({ workspaceId, requiredCapabilities, userId: auth.user.id })
      : await resolveDeploymentForWorkspace({
          workspaceId,
          targetDeploymentId: requestedDeploymentId,
          requiredCapabilities,
          userId: auth.user.id,
        });

    const config = await loadBillingConfig();
    const pricingSource = resolvePricingSource(plan.deploymentId);

    // ============ 轨道一：用户自带模型（BYOK）＝官方单价 × Token 用量 × (1 + 服务费率) ============
    if (pricingSource === "USER_BYOK") {
      // Token 用量优先级：调用方显式 → 校准表 → 合同 billingPolicy.estimatedTokens → 目录估算值
      let estimateSource: string;
      let split: { inputTokens: number; outputTokens: number };
      const rawIn = searchParams.get("inputTokens");
      const rawOut = searchParams.get("outputTokens");
      if (rawIn !== null || rawOut !== null) {
        split = {
          inputTokens: Math.max(0, Math.floor(Number(rawIn) || 0)),
          outputTokens: Math.max(0, Math.floor(Number(rawOut) || 0)),
        };
        estimateSource = "CALLER_PROVIDED";
      } else {
        const calibRow = await prisma.systemconfig.findUnique({
          where: { key: "billing_usage_calibration" },
          select: { value: true },
        });
        let calibration: Record<string, { in?: number; out?: number }> = {};
        if (calibRow?.value) {
          try {
            const parsed = JSON.parse(calibRow.value);
            if (parsed && typeof parsed === "object") calibration = parsed;
          } catch {
            calibration = {};
          }
        }
        const cal = calibration[comp.id];
        if (cal && Number.isFinite(Number(cal.in)) && Number.isFinite(Number(cal.out))) {
          split = {
            inputTokens: Math.max(0, Math.floor(Number(cal.in))),
            outputTokens: Math.max(0, Math.floor(Number(cal.out))),
          };
          estimateSource = "USAGE_CALIBRATION";
        } else if (contractEstimatedTokens !== null) {
          split = splitTokenEstimate({
            estimatedTotalTokens: contractEstimatedTokens,
            maxOutputTokens,
          });
          estimateSource = "CONTRACT_ESTIMATED_TOKENS";
        } else {
          split = splitTokenEstimate({
            estimatedTotalTokens: fixedPoints,
            maxOutputTokens,
          });
          estimateSource = "CATALOG_ESTIMATED_TOKENS";
        }
      }

      // 算账核心换算：内部已含 ×(1 + byokServiceRateBps/10000 服务费) 与单次保底，不套平台加价系数 k
      const result = await estimatePoints({
        modelDeploymentId: plan.deploymentId,
        inputTokens: split.inputTokens,
        outputTokens: split.outputTokens,
        pricingSource,
        estimateSource,
      });
      const serviceRateText = `${Math.round(config.byokServiceRateBps / 100)}%`;
      const blocked = result.points === null || result.points <= 0;
      return NextResponse.json({
        success: true,
        data: {
          componentId: comp.id,
          componentName: comp.name,
          workspaceId,
          deployment: {
            id: plan.deploymentId,
            providerId: plan.providerId,
            modelId: plan.modelId,
            upstreamModelId: plan.upstreamModelId,
            defaultSource: plan.defaultSource,
          },
          tokens: {
            input: split.inputTokens,
            output: split.outputTokens,
            total: split.inputTokens + split.outputTokens,
            basis: estimateSource,
          },
          points: blocked ? null : result.points,
          yuan: blocked ? null : pointsToYuan(result.points!),
          basis: result.basis,
          blockedReason: result.blockedReason ?? null,
          explanation: `自带模型（BYOK）：按你登记的厂商官方单价 × 实际 Token 用量折算，另收平台服务费 ${serviceRateText}；1 算力点 = ${YUAN_PER_POINT} 元。`,
          snapshot: result.snapshot,
          settlement: null,
          pendingRegistration: null,
        },
      });
    }

    // ============ 轨道二：平台模型 ＝ 管理员配置的固定扣点数 ============
    // 批次 2 灰度：白名单组件返回押金预估（固定点数模式下押金 = 配置的固定扣点数）
    const settlementEnabled = isComponentSettlementEnabled(comp.id, {
      globalFlag: isTokenSettlementFeatureEnabled(),
      whitelist: config.settlementComponentWhitelist,
      mode: config.settlementMode,
    });
    let settlement: {
      enabled: boolean;
      mode: string;
      whitelist: string[];
      deposit: { points: number | null; worstInputTokens: number; worstOutputTokens: number } | null;
    } | null = null;
    if (settlementEnabled) {
      settlement = {
        enabled: true,
        whitelist: config.settlementComponentWhitelist,
        mode: config.settlementMode,
        deposit: {
          points: fixedPoints,
          worstInputTokens: 0,
          worstOutputTokens: 0,
        },
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        componentId: comp.id,
        componentName: comp.name,
        workspaceId,
        deployment: {
          id: plan.deploymentId,
          providerId: plan.providerId,
          modelId: plan.modelId,
          upstreamModelId: plan.upstreamModelId,
          defaultSource: plan.defaultSource,
        },
        tokens: {
          basis: "FIXED_POINTS",
        },
        points: fixedPoints,
        yuan: pointsToYuan(fixedPoints),
        basis: "FIXED_POINTS",
        explanation: `固定点数计费：管理员为本组件配置每次执行固定扣除 ${fixedPoints} 算力点（1 算力点 = ${YUAN_PER_POINT} 元）。`,
        snapshot: null,
        settlement,
        pendingRegistration: null,
      },
    });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    if (e?.code) {
      return NextResponse.json(
        { success: false, error: e.message || "估价失败", code: e.code },
        { status: e.status || 400 },
      );
    }
    console.error("[billing-estimate] 估价失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "估价失败" }, { status: 500 });
  }
}
