/**
 * 【只读报告脚本 · 严禁写操作】
 * 批次 1 收尾项 6：输出「待登记模型清单 / 扣点口径影响清单」。
 * 对每个有激活合同的组件，计算：
 *   - 旧口径扣点（兼容期：estimatedModelTokens 直接当点数）；
 *   - 新口径扣点（算账中心换算：成本 × 全局 k，按合同 maxOutputTokens 拆分 Token）。
 * 公式与 src/lib/billing/pricing-center.ts 的 computeEstimatedPoints 完全一致（此处内联复刻，
 * 纯 BigInt 整数运算、单次向上取整），仅用于只读报告，不写库、不改价。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKENS_PER_MILLION = BigInt(1_000_000);
const BPS_DENOM = BigInt(10_000);
const MICROS_PER_POINT = BigInt(10_000);
const GLOBAL_K_BPS = BigInt(20_000); // billing.markupCoefficientBps 默认 k = 2.0

function splitTokenEstimate(total: number, maxOutputTokens: number | null) {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const cap = maxOutputTokens && maxOutputTokens > 0 ? Math.floor(maxOutputTokens) : 0;
  if (t === 0) return { inputTokens: 0, outputTokens: 0 };
  const outputTokens = Math.min(cap, t);
  return { inputTokens: t - outputTokens, outputTokens };
}

function estimatePoints(
  inputTokens: number,
  outputTokens: number,
  unitInput: number | null,
  unitOutput: number | null,
  multiplierBps: bigint,
): number | null {
  if (unitInput === null || unitOutput === null) return null;
  const numerator =
    (BigInt(inputTokens) * BigInt(unitInput) + BigInt(outputTokens) * BigInt(unitOutput)) *
    multiplierBps;
  const denominator = TOKENS_PER_MILLION * MICROS_PER_POINT * BPS_DENOM;
  return Number((numerator + denominator - BigInt(1)) / denominator);
}

async function main() {
  const pricings = await prisma.modelpricing.findMany({
    select: {
      deploymentId: true,
      priceSource: true,
      priceStatus: true,
      costInputMicrosPerMillion: true,
      costOutputMicrosPerMillion: true,
      priceInputMicrosPerMillion: true,
      priceOutputMicrosPerMillion: true,
      markupRateBps: true,
      priceOrigin: true,
    },
  });
  const deployments = await prisma.modeldeployment.findMany({
    select: { id: true, modelId: true, upstreamModel: true, enabled: true, capabilities: true },
  });
  const components = await prisma.componentcatalog.findMany({
    select: {
      id: true,
      name: true,
      estimatedModelTokens: true,
      activeContractId: true,
      isPublished: true,
    },
    orderBy: { id: "asc" },
  });
  const contractIds = components
    .map((c) => c.activeContractId)
    .filter((id): id is string => Boolean(id));
  const contracts = contractIds.length
    ? await prisma.componentcontract.findMany({
        where: { id: { in: contractIds } },
        select: { id: true, lifecycle: true, contract: true },
      })
    : [];
  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  const depMap = new Map(deployments.map((d) => [d.id, d]));
  const priceMap = new Map(pricings.map((p) => [p.deploymentId, p]));

  console.log("=== 1. 模型价格登记现状 ===");
  for (const d of deployments) {
    const p = priceMap.get(d.id);
    const hasDirect = p?.priceInputMicrosPerMillion != null && p?.priceOutputMicrosPerMillion != null;
    const hasCost = p?.costInputMicrosPerMillion != null && p?.costOutputMicrosPerMillion != null;
    console.log(
      `${d.id} | ${d.upstreamModel} | enabled=${d.enabled} | 价格登记=${p ? "有" : "无"} | 口径=${
        hasDirect ? "DIRECT_PRICE(售价已登记)" : hasCost ? "COST_PLUS_MARKUP(仅成本)" : "未登记"
      } | priceOrigin=${p?.priceOrigin ?? "—"} | priceStatus=${p?.priceStatus ?? "—"}`,
    );
  }

  // 取当前唯一可用于换算的口径：优先任一已登记价格的部署（报告用途，不作执行裁决）
  const usable = pricings.find(
    (p) => p.priceInputMicrosPerMillion != null && p.priceOutputMicrosPerMillion != null,
  ) ?? pricings.find((p) => p.costInputMicrosPerMillion != null && p.costOutputMicrosPerMillion != null);

  const unit = usable
    ? {
        input: usable.priceInputMicrosPerMillion ?? usable.costInputMicrosPerMillion,
        output: usable.priceOutputMicrosPerMillion ?? usable.costOutputMicrosPerMillion,
        kind:
          usable.priceInputMicrosPerMillion != null ? "DIRECT_PRICE" : "COST_PLUS_MARKUP",
        multiplier:
          usable.priceInputMicrosPerMillion != null
            ? BigInt(10_000)
            : usable.markupRateBps != null
              ? BigInt(10_000 + usable.markupRateBps)
              : GLOBAL_K_BPS,
        deploymentId: usable.deploymentId,
      }
    : null;

  console.log("\n=== 2. 组件扣点口径影响清单（旧口径 vs 算账中心新口径）===");
  if (!unit) {
    console.log("当前无任何已登记价格的模型部署 → 全部组件走兼容旧口径，扣费数额不变。");
  } else {
    console.log(
      `换算基准部署: ${unit.deploymentId} (${depMap.get(unit.deploymentId)?.upstreamModel ?? "—"})，口径 ${unit.kind}，乘数 ${unit.multiplier.toString()} bps`,
    );
    console.log("componentId | 名称 | 估算Token | 旧口径点数 | 新口径点数 | 差异 | 当前生效口径");
    let changed = 0;
    let same = 0;
    let unconvertible = 0;
    for (const c of components) {
      const total = Number(c.estimatedModelTokens);
      if (!Number.isFinite(total) || total <= 0) continue;
      const contract = c.activeContractId ? contractMap.get(c.activeContractId) : null;
      const steps = Array.isArray((contract?.contract as any)?.executionPlan?.steps)
        ? ((contract!.contract as any).executionPlan.steps as Array<{ maxOutputTokens?: number }>)
        : [];
      const maxOut = steps.reduce(
        (acc, s) => acc + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0),
        0,
      );
      const split = splitTokenEstimate(total, maxOut > 0 ? maxOut : null);
      const newPoints = estimatePoints(
        split.inputTokens,
        split.outputTokens,
        unit.input,
        unit.output,
        unit.multiplier,
      );
      const oldPoints = Math.floor(total);
      const diff = newPoints === null ? "—" : newPoints - oldPoints;
      const basis = newPoints === null ? "兼容旧口径(价格未登记)" : "算账中心换算";
      if (newPoints === null) unconvertible += 1;
      else if (newPoints === oldPoints) same += 1;
      else changed += 1;
      console.log(
        `${c.id} | ${c.name} | ${total} | ${oldPoints} | ${newPoints ?? "—"} | ${diff} | ${basis}`,
      );
    }
    console.log(
      `\n统计：发生改变 ${changed} 个，未变 ${same} 个，无法换算 ${unconvertible} 个`,
    );
  }

  console.log("\n=== 3. 待登记清单（需补齐价格才能脱离兼容旧口径）===");
  const pending = deployments.filter((d) => {
    const p = priceMap.get(d.id);
    return (
      d.enabled &&
      (!p ||
        ((p.priceInputMicrosPerMillion == null || p.priceOutputMicrosPerMillion == null) &&
          (p.costInputMicrosPerMillion == null || p.costOutputMicrosPerMillion == null)))
    );
  });
  if (pending.length === 0) {
    console.log("无（全部启用中的部署均已登记可换算价格）");
  } else {
    for (const d of pending) {
      console.log(`${d.id} | ${d.upstreamModel} | 需登记：售价(price*) 或 成本(cost*) 输入+输出`);
    }
  }
}

main()
  .catch((e) => {
    console.error("只读报告失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
