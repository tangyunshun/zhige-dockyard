import { prisma } from "../src/lib/prisma";
import { getPlatformDefaultDeploymentId } from "../src/lib/model-registry";
import { isTokenSettlementFeatureEnabled } from "../src/lib/token-settlement-service";

async function runReadOnlyVerify() {
  const componentId = "C13";

  // 1. 查询 C13 的 catalog 记录 (包含 activeContractId)
  const catalog = await prisma.componentcatalog.findUnique({
    where: { id: componentId },
    select: { id: true, activeContractId: true },
  });

  // 2. 查询 C13 的数据库合同记录 (所有生命周期)
  const contracts = await prisma.componentcontract.findMany({
    where: { componentId },
    select: {
      id: true,
      componentId: true,
      contractVersion: true,
      lifecycle: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. 统计是否存在 PUBLISHED 合同
  const publishedContracts = contracts.filter((c) => c.lifecycle === "PUBLISHED");

  // 4. 默认模型部署是否覆盖 TEXT_GENERATION
  const pdId = await getPlatformDefaultDeploymentId();
  const pd = pdId
    ? await prisma.modeldeployment.findUnique({
        where: { id: pdId },
        select: {
          id: true,
          enabled: true,
          capabilities: true,
          provider: { select: { enabled: true } },
        },
      })
    : null;
  const pdEnabled = Boolean(pd && pd.enabled && pd.provider?.enabled === true);
  const deploymentCapabilities: string[] = pdEnabled && Array.isArray(pd?.capabilities)
    ? (pd?.capabilities as unknown as string[]).map((c) => String(c))
    : [];
  const coversTextGeneration = deploymentCapabilities.includes("TEXT_GENERATION");

  // 5. C13 是否被其他合同激活状态冲突
  const activeContractId = catalog?.activeContractId || null;
  let activeContractConflict = false;
  if (activeContractId) {
    const activeContract = contracts.find((c) => c.id === activeContractId);
    if (!activeContract || activeContract.lifecycle !== "PUBLISHED") {
      activeContractConflict = true;
    }
  }

  // 6. C13 最近任务数量及 REAL_MODEL/SUCCESS/FAILED 统计
  const totalTasks = await prisma.componenttask.count({
    where: { type: componentId },
  });

  const successTasks = await prisma.componenttask.count({
    where: {
      type: componentId,
      status: { in: ["SUCCESS", "COMPLETED", "success", "completed"] },
    },
  });

  const failedTasks = await prisma.componenttask.count({
    where: {
      type: componentId,
      status: { in: ["FAILED", "failed", "ERROR", "error"] },
    },
  });

  const recentTasks = await prisma.componenttask.findMany({
    where: { type: componentId },
    select: {
      status: true,
      result: true,
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  let realModelTasksCount = 0;
  for (const t of recentTasks) {
    if (t.result && typeof t.result === "object") {
      const resObj = t.result as Record<string, unknown>;
      if (resObj.executionMode === "REAL_MODEL" || resObj.modelUsed) {
        realModelTasksCount++;
      }
    }
  }

  // 7. 当前 settlementEnabled 和 billingMode
  const settlementEnabled = isTokenSettlementFeatureEnabled();
  const billingMode = "ESTIMATED_COMPATIBILITY";

  // 8. 严格格式化输出：只输出组件 ID、合同版本、生命周期、能力名和计数
  const output = {
    componentId,
    contracts: contracts.map((c) => ({
      contractVersion: c.contractVersion,
      lifecycle: c.lifecycle,
    })),
    contractsCount: contracts.length,
    activeContractIdExists: Boolean(activeContractId),
    publishedContractsCount: publishedContracts.length,
    platformDeployment: {
      enabled: pdEnabled,
      capabilities: deploymentCapabilities,
      coversTextGeneration,
    },
    activeContractConflict,
    taskStats: {
      totalTasksCount: totalTasks,
      successCount: successTasks,
      failedCount: failedTasks,
      recentRealModelTasksCount: realModelTasksCount,
    },
    billing: {
      settlementEnabled,
      billingMode,
    },
  };

  console.log("=== C13 READONLY VERIFY RESULT ===");
  console.log(JSON.stringify(output, null, 2));

  await prisma.$disconnect();
}

runReadOnlyVerify().catch((e) => {
  console.error("VERIFY_ERROR", e);
  process.exit(1);
});
