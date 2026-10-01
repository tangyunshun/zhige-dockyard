/**
 * 【只读审计脚本】CORE-3 黄金链路 C01/C02/C07 现状核查
 *
 * ⚠️ 严格只读：本脚本只执行 prisma 的 findMany / findUnique / groupBy / count 查询，
 *    禁止任何 create / update / delete / upsert。不调用模型、不产生费用、不写任何表。
 *
 * 输出：目录状态、激活合同状态、模型部署状态、三组件任务分布与最近任务事实。
 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";

loadCliEnv();

const CORE3 = ["C01", "C02", "C07"];

function trimContract(c: unknown) {
  const t = (c ?? {}) as Record<string, unknown>;
  return {
    componentId: t.componentId,
    contractVersion: t.contractVersion,
    requiredCapabilities: t.requiredCapabilities ?? t.capabilities,
    inputMode: (t.input as Record<string, unknown>)?.mode ?? (t.input as Record<string, unknown>)?.type,
    outputType: (t.output as Record<string, unknown>)?.type ?? t.outputType,
    billingMode: t.billingMode,
    estimatedPoints: t.estimatedPoints,
    estimatedModelTokens: t.estimatedModelTokens,
    qualityPolicy: t.qualityPolicy ? Object.keys(t.qualityPolicy as object) : undefined,
  };
}

async function main() {
  console.log("========== 1) componentcatalog（C01/C02/C07）==========");
  const catalogs = await prisma.componentcatalog.findMany({
    where: { id: { in: CORE3 } },
    select: {
      id: true, name: true, category: true, isPublished: true,
      inputMode: true, accept: true, activeContractId: true,
      estimatedModelTokens: true, updatedAt: true,
    },
    orderBy: { id: "asc" },
  });
  for (const c of catalogs) console.log(JSON.stringify(c));

  console.log("\n========== 2) componentcontract（三组件全部版本）==========");
  const contracts = await prisma.componentcontract.findMany({
    where: { componentId: { in: CORE3 } },
    select: {
      id: true, componentId: true, contractVersion: true, lifecycle: true,
      publishedAt: true, publishedBy: true, createdAt: true, contract: true,
    },
    orderBy: [{ componentId: "asc" }, { createdAt: "desc" }],
  });
  for (const c of contracts) {
    console.log(JSON.stringify({
      id: c.id, componentId: c.componentId, version: c.contractVersion,
      lifecycle: c.lifecycle, publishedAt: c.publishedAt, createdAt: c.createdAt,
      isActiveForCatalog: catalogs.find((k) => k.id === c.componentId)?.activeContractId === c.id,
      contractKeyFields: trimContract(c.contract),
    }));
  }

  console.log("\n========== 3) modelprovider / modeldeployment（不含任何密钥）==========");
  const providers = await prisma.modelprovider.findMany({
    select: { id: true, name: true, protocol: true, enabled: true, baseUrl: true, sortOrder: true },
  });
  for (const p of providers) console.log("provider:", JSON.stringify(p));
  const deployments = await prisma.modeldeployment.findMany({
    select: {
      id: true, providerId: true, modelId: true, upstreamModel: true,
      displayName: true, contextLimit: true, capabilities: true, enabled: true,
    },
  });
  for (const d of deployments) console.log("deployment:", JSON.stringify(d));

  console.log("\n========== 3b) C07 激活合同完整 JSON（确认合同真实结构）==========");
  const c07Active = contracts.find(
    (c) => c.componentId === "C07" && c.id === catalogs.find((k) => k.id === "C07")?.activeContractId
  );
  if (c07Active) console.log(JSON.stringify(c07Active.contract, null, 1).slice(0, 3500));

  console.log("\n========== 4) componenttask 分布（type × status）==========");
  const grouped = await prisma.componenttask.groupBy({
    by: ["type", "status"],
    where: { type: { in: CORE3 } },
    _count: { _all: true },
    orderBy: { type: "asc" },
  });
  for (const g of grouped) console.log(JSON.stringify({ type: g.type, status: g.status, count: g._count._all }));

  console.log("\n========== 5) 每组件最近 3 条任务（含执行模式/合同版本元数据）==========");
  for (const compId of CORE3) {
    const tasks = await prisma.componenttask.findMany({
      where: { type: compId },
      select: {
        id: true, status: true, userId: true, tenantId: true, progress: true,
        createdAt: true, updatedAt: true, completedAt: true, config: true, result: true,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    for (const t of tasks) {
      const cfg = (t.config ?? {}) as Record<string, unknown>;
      const res = (t.result ?? {}) as Record<string, unknown>;
      console.log(JSON.stringify({
        id: t.id, type: compId, status: t.status, progress: t.progress,
        createdAt: t.createdAt, completedAt: t.completedAt,
        workspaceId: cfg.workspaceId,
        executionMode: cfg.executionMode,
        contractVersion: (cfg.contractSnapshot as Record<string, unknown>)?.contractVersion ?? cfg.contractVersion,
        hasResultColumn: t.result != null,
        resultErrorCode: res.errorCode,
      }));
    }
  }

  console.log("\n========== 6) 退款恢复队列（refundrecovery）概况 ==========");
  const rrGrouped = await prisma.refundrecovery.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  for (const r of rrGrouped) console.log(JSON.stringify({ status: r.status, count: r._count._all }));

  console.log("\n========== 7) Token 结算开关事实（systemconfig）==========");
  const cfgRows = await prisma.systemconfig.findMany({
    where: { key: { in: ["token_settlement", "settlement_enabled", "ai_pricing_config"] } },
    select: { key: true, value: true, updatedAt: true },
  });
  for (const row of cfgRows) {
    const v = String(row.value ?? "");
    console.log(JSON.stringify({ key: row.key, valuePreview: v.length > 200 ? v.slice(0, 200) + "..." : v, updatedAt: row.updatedAt }));
  }

  console.log("\n【只读审计完成】无任何写入。");
}

main()
  .catch((e) => { console.error("只读审计失败:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
