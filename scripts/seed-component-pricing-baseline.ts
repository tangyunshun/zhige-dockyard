/**
 * 组件定价基线初始化（幂等，可重复执行）。
 *
 * 背景（定价审核）：60 个存量组件均未配置「成本测算模型 / 成本底线 / 复杂度」，
 * 导致「低于成本禁止保存」的防亏本红线对存量组件完全不生效。
 *
 * 本脚本只做**补空**，绝不覆盖管理员已做的选择：
 *  - 仅处理 costModelDeploymentId 为空的组件；
 *  - 成本测算模型 = 平台默认模型部署（执行链路 resolveDefaultDeployment 的同源口径，
 *    保证底线与真实执行成本对齐）；无平台默认时回退为「首个已启用且登记了成本价的部署」；
 *  - 成本底线按该模型 + 组件现有预估 Token 计算写入；
 *  - 绝不改动组件售价（estimatedModelTokens）——定价是管理员的商业决策。
 *
 * 用法：npx tsx scripts/seed-component-pricing-baseline.ts
 */
import { prisma } from "../src/lib/prisma";
import { getPlatformDefaultDeploymentId } from "../src/lib/model-registry";
import { computeCostFloorPoints } from "../src/lib/component-cost-floor";

(async () => {
  // 1. 解析成本测算模型：平台默认优先，否则首个已启用且有成本价的部署
  let deploymentId = await getPlatformDefaultDeploymentId();
  let deploymentLabel = "平台默认模型";
  if (!deploymentId) {
    const pricings = await prisma.modelpricing.findMany({
      where: {
        OR: [
          { costInputMicrosPerMillion: { gt: 0 } },
          { costOutputMicrosPerMillion: { gt: 0 } },
        ],
      },
      select: { deploymentId: true },
    });
    const pricedIds = new Set(pricings.map((p) => p.deploymentId));
    const fallback = await prisma.modeldeployment.findFirst({
      where: { enabled: true, id: { in: Array.from(pricedIds) } },
      orderBy: [{ providerId: "asc" }, { modelId: "asc" }],
      select: { id: true, providerId: true, modelId: true },
    });
    if (!fallback) {
      console.error("未找到可用的成本测算模型（无平台默认模型，且没有登记成本价的启用部署），终止。请先在模型注册表配置。");
      process.exit(1);
    }
    deploymentId = fallback.id;
    deploymentLabel = `回退部署 ${fallback.providerId}/${fallback.modelId}`;
  }
  const deployment = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    select: { providerId: true, modelId: true, contextLimit: true },
  });
  console.log(`成本测算模型：${deploymentLabel}（${deployment?.providerId}/${deployment?.modelId}，上下文上限 ${deployment?.contextLimit}）`);

  // 2. 仅补空：costModelDeploymentId 为空的组件
  const targets = await prisma.componentcatalog.findMany({
    where: { costModelDeploymentId: null },
    select: {
      id: true,
      name: true,
      estimatedModelTokens: true,
      estimatedInputTokens: true,
      estimatedOutputTokens: true,
      pricingComplexity: true,
    },
    orderBy: { id: "asc" },
  });
  console.log(`待初始化组件：${targets.length} 个（已配置的自动跳过）`);

  let updated = 0;
  const belowFloor: string[] = [];
  const noFloor: string[] = [];

  for (const c of targets) {
    const inTok = c.estimatedInputTokens && c.estimatedInputTokens > 0 ? c.estimatedInputTokens : 4000;
    const outTok = c.estimatedOutputTokens && c.estimatedOutputTokens > 0 ? c.estimatedOutputTokens : 2000;
    const floor = await computeCostFloorPoints(deploymentId, inTok, outTok);
    if (floor == null) {
      noFloor.push(c.id);
      continue;
    }
    await prisma.componentcatalog.update({
      where: { id: c.id },
      data: {
        costModelDeploymentId: deploymentId,
        costFloorPoints: floor,
        // 预估 Token 补默认值（库默认 4000/2000，防御性写入，保证与底线计算口径一致）
        estimatedInputTokens: inTok,
        estimatedOutputTokens: outTok,
      },
    });
    updated += 1;
    if (c.estimatedModelTokens < floor) {
      belowFloor.push(`${c.id} ${c.name}：售价 ${c.estimatedModelTokens} < 底线 ${floor}`);
    }
    console.log(`  ✓ ${c.id} ${c.name}：底线 ${floor} 点，现售价 ${c.estimatedModelTokens} 点${c.estimatedModelTokens < floor ? "（⚠ 低于底线，需管理员调价）" : ""}`);
  }

  // 3. 汇总
  const all = await prisma.componentcatalog.findMany({
    select: { costModelDeploymentId: true, costFloorPoints: true },
  });
  console.log("\n===== 初始化结果 =====");
  console.log(`本次写入：${updated} 个组件`);
  console.log(`无法计算底线（模型未登记成本价）：${noFloor.length} 个${noFloor.length ? ` -> ${noFloor.join(", ")}` : ""}`);
  console.log(`售价低于底线的组件：${belowFloor.length} 个${belowFloor.length ? `\n  - ${belowFloor.join("\n  - ")}` : ""}`);
  console.log(`全库已有成本底线的组件：${all.filter((c) => c.costFloorPoints != null).length}/${all.length}`);

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("初始化失败:", String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
