import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { resolveDefaultDeployment } from "@/lib/model-registry";
import { extractRequiredCapabilities } from "@/lib/component-contract/capabilities";
import { microsToYuanPerMillion } from "@/lib/model-pricing";
import { pointsToYuan, YUAN_PER_POINT } from "@/lib/point-rate";
import {
  estimatePoints,
  splitTokenEstimate,
  resolvePricingSource,
  computeDepositTokenBounds,
  type EstimatePointsResult,
} from "@/lib/billing/pricing-center";
import {
  loadBillingConfig,
  markupCoefficientToNumber,
  isComponentSettlementEnabled,
  BILLING_CONFIG_KEYS,
} from "@/lib/billing/billing-config";
import { isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";

// 估价随价格与配置实时变化，禁止静态缓存
export const dynamic = "force-dynamic";

function fmtYuan(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}`;
}

/** 计价说明文案：把快照翻译成人话（含 BYOK 服务费说明），供前端直接展示 */
function buildExplanation(r: EstimatePointsResult, config: { markupCoefficientBps: number; byokServiceRateBps: number }): string {
  const s = r.snapshot;
  const inYuan = microsToYuanPerMillion(s.unitPriceMicrosPerMillion.input);
  const outYuan = microsToYuanPerMillion(s.unitPriceMicrosPerMillion.output);
  const rateText = `1 算力点 = ${YUAN_PER_POINT} 元`;

  if (r.basis === "BLOCKED_PRICE_UNREGISTERED") {
    return `${r.blockedReason}（在价格登记前，本组件仍按既有估算口径扣点，并在账单中标注估算属性。）`;
  }
  if (s.pricingSource === "USER_BYOK") {
    const rate = (config.byokServiceRateBps / 100).toFixed(2);
    return `自带模型（BYOK）：按登记的厂商官方单价折算——输入 ${fmtYuan(inYuan)} / 百万 Token、输出 ${fmtYuan(outYuan)} / 百万 Token；另收平台服务费 ${rate}%（平台不承担厂商成本）；${rateText}。`;
  }
  if (s.priceKind === "DIRECT_PRICE") {
    return `按模型登记的售价计算——输入 ${fmtYuan(inYuan)} / 百万 Token、输出 ${fmtYuan(outYuan)} / 百万 Token（售价已含加价，不再叠加系数）；${rateText}。`;
  }
  const k = markupCoefficientToNumber(s.multiplierBps / 1); // multiplierBps 即成本→售价的乘数（k×10000）
  const kText = s.markupOverriddenByModel
    ? `按模型覆盖加价系数 k=${k}`
    : `全局加价系数 k=${markupCoefficientToNumber(config.markupCoefficientBps)}`;
  return `按供应商成本加价计算——成本输入 ${fmtYuan(inYuan)} / 百万 Token、输出 ${fmtYuan(outYuan)} / 百万 Token；${kText}；${rateText}。`;
}

/**
 * GET：执行前只读估价（零副作用、不写库、不调用模型）。
 * 入参：componentId、workspaceId（必填）；inputTokens / outputTokens（可选，缺省按合同 maxOutputTokens 拆分总量估算）。
 * 返回：预计扣点 + 计价说明 + 计算快照；价格未登记时 basis=BLOCKED 并给出待登记提示（绝不猜测默认价）。
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

    // 合同能力：唯一真源为激活合同（不得按组件 ID 猜测）
    let requiredCapabilities: string[] = [];
    let maxOutputTokens: number | null = null;
    let contractEstimatedTokens: number | null = null;
    if (comp.activeContractId) {
      const contractRow = await prisma.componentcontract.findUnique({
        where: { id: comp.activeContractId },
        select: { contract: true },
      });
      const c = contractRow?.contract as
        | { executionPlan?: { steps?: Array<{ requiredCapabilities?: string[]; maxOutputTokens?: number }> } }
        | null
        | undefined;
      requiredCapabilities = extractRequiredCapabilities(c ?? null);
      const steps = Array.isArray(c?.executionPlan?.steps) ? c!.executionPlan!.steps! : [];
      const sum = steps.reduce((acc, s) => acc + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0), 0);
      maxOutputTokens = sum > 0 ? sum : null;
      // 合同声明的估算 Token（billingPolicy.estimatedTokens），作为校准表缺失时的次优先来源
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

    // 模型裁决：与真实执行同口径
    const plan = await resolveDefaultDeployment({ workspaceId, requiredCapabilities });

    // Token 用量：调用方显式给定优先，否则按合同 maxOutputTokens 对总量做数据驱动拆分
    // 用量估算来源优先级（写库事实，禁止颠倒）：
    //   1) billing_usage_calibration（真实历史 usage 均值校准表）
    //   2) 合同 billingPolicy.estimatedTokens
    //   3) componentcatalog.estimatedModelTokens（旧值，点数语义，标注 ESTIMATED_LEGACY）
    const calibRow = await prisma.systemconfig.findUnique({
      where: { key: BILLING_CONFIG_KEYS.usageCalibration },
      select: { value: true },
    });
    let calibration: Record<string, { in?: number; out?: number }> = {};
    if (calibRow?.value) {
      try {
        const parsed = JSON.parse(calibRow.value);
        if (parsed && typeof parsed === "object") calibration = parsed;
      } catch {
        calibration = {}; // 非法 JSON 视为未校准，绝不猜测
      }
    }

    const rawIn = searchParams.get("inputTokens");
    const rawOut = searchParams.get("outputTokens");
    const hasExplicit = rawIn !== null || rawOut !== null;
    const cal = calibration[comp.id];
    const calOk =
      cal && Number.isFinite(Number(cal.in)) && Number.isFinite(Number(cal.out)) &&
      Number(cal.in) >= 0 && Number(cal.out) >= 0;

    let estimateSource: string;
    let split: { inputTokens: number; outputTokens: number };
    if (hasExplicit) {
      split = {
        inputTokens: Math.max(0, Math.floor(Number(rawIn) || 0)),
        outputTokens: Math.max(0, Math.floor(Number(rawOut) || 0)),
      };
      estimateSource = "CALLER_PROVIDED";
    } else if (calOk) {
      split = {
        inputTokens: Math.max(0, Math.floor(Number(cal!.in))),
        outputTokens: Math.max(0, Math.floor(Number(cal!.out))),
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
        estimatedTotalTokens: Number(comp.estimatedModelTokens),
        maxOutputTokens,
      });
      estimateSource = "CATALOG_ESTIMATED_TOKENS";
    }

    const config = await loadBillingConfig();
    const result = await estimatePoints({
      modelDeploymentId: plan.deploymentId,
      inputTokens: split.inputTokens,
      outputTokens: split.outputTokens,
      pricingSource: resolvePricingSource(plan.deploymentId),
      config,
      estimateSource,
    });

    // 批次 2 灰度：白名单组件返回押金预估（最坏情况，供界面展示「预扣押金 Y 点」）。
    // 材料字符数由调用方可选传入 materialChars；未传时押金仅含 maxOutputTokens 输出上界（+保底）。
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
      const materialChars = Number(searchParams.get("materialChars")) || 0;
      // 校准输入均值作为押金下限（中文材料字符÷2 会系统性低估，试点实测 600 vs 真实 4788）
      const cal = calibration[comp.id];
      const calibratedInput =
        cal && Number.isFinite(Number(cal.in)) && Number(cal.in) > 0 ? Number(cal.in) : null;
      const bounds = computeDepositTokenBounds(materialChars, maxOutputTokens, calibratedInput);
      const depositEst = await estimatePoints({
        modelDeploymentId: plan.deploymentId,
        inputTokens: bounds.inputTokens,
        outputTokens: bounds.outputTokens,
        pricingSource: resolvePricingSource(plan.deploymentId),
        config,
        estimateSource: "DEPOSIT_WORST_CASE",
      });
      settlement = {
        enabled: true,
        whitelist: config.settlementComponentWhitelist,
      mode: config.settlementMode,
        deposit: {
          points: depositEst.points,
          worstInputTokens: bounds.inputTokens,
          worstOutputTokens: bounds.outputTokens,
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
          input: result.snapshot.inputTokens,
          output: result.snapshot.outputTokens,
          total: result.snapshot.inputTokens + result.snapshot.outputTokens,
          basis: estimateSource,
          /** 旧值口径标注：仅 CATALOG_ESTIMATED_TOKENS 属「点数语义遗留」，须在界面标注估算属性 */
          legacyEstimate: estimateSource === "CATALOG_ESTIMATED_TOKENS",
        },
        points: result.points,
        yuan: result.points === null ? null : pointsToYuan(result.points),
        basis: result.basis,
        blockedReason: result.blockedReason,
        explanation: buildExplanation(result, config),
        snapshot: result.snapshot,
        // 押金-结算灰度信息（白名单组件才返回 deposit，前端展示「预扣押金 Y 点」）
        settlement,
        // 待登记清单：价格未登记的部署（运营据此补齐价格，不得静默估价）
        pendingRegistration:
          result.basis === "BLOCKED_PRICE_UNREGISTERED"
            ? { deploymentId: plan.deploymentId, reason: result.blockedReason }
            : null,
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
