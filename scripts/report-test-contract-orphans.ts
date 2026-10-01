/**
 * 历史测试组件 dry-run-only 报告（**只读**，绝不删除）
 *
 * 报告对象：
 *  - componentcatalog 中 id 前缀为 TEST_COMP_ / API_TEST_C_ 的历史测试组件；
 *  - 其下的 componentcontract（含 lifecycle、组件当前 activeContractId）；
 *  - 关联的 operationlog；
 *  - activeContractId 是否指向非 PUBLISHED 合同（数据一致性违规）。
 *
 * 硬性约束：
 *  - 本脚本在任何情况下都**不执行删除/更新**；
 *  - 一旦传入 --apply 立即拒绝并退出（真正删除必须人工另行确认）。
 */

import { prisma } from "../src/lib/prisma";

const TARGET_PREFIXES = ["TEST_COMP_", "API_TEST_C_"] as const;

interface ContractRow {
  id: string;
  componentId: string;
  contractVersion: string;
  lifecycle: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
}

type ResidueCategory = "CURRENT_ROUND" | "HISTORICAL";

interface ComponentReport {
  componentId: string;
  componentCreatedAt: Date;
  /** CURRENT_ROUND=本轮（--since 窗口内）新增测试残留；HISTORICAL=历史残留 */
  category: ResidueCategory;
  activeContractId: string | null;
  activeContractLifecycle: string | null;
  activeContractConsistent: boolean;
  contractCount: number;
  publishedCount: number;
  draftCount: number;
  archivedCount: number;
  contracts: ContractRow[];
  operationLogCount: number;
  operationLogActions: Record<string, number>;
}

function summarize(c: ContractRow[]) {
  return {
    contractCount: c.length,
    publishedCount: c.filter((x) => x.lifecycle === "PUBLISHED").length,
    draftCount: c.filter((x) => x.lifecycle === "DRAFT").length,
    archivedCount: c.filter((x) => x.lifecycle === "ARCHIVED").length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // 时间窗口：用于区分「本轮新增测试残留」与「历史残留」（默认 24 小时；可用 --since=<ISO> 覆盖）
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const since = sinceArg
    ? new Date(sinceArg.slice("--since=".length))
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (Number.isNaN(since.getTime())) {
    console.error("[report-test-contract-orphans] --since 必须为合法 ISO 时间，例如 --since=2026-09-21T00:00:00Z");
    process.exit(2);
  }
  if (args.includes("--apply")) {
    console.error("[report-test-contract-orphans] 拒绝执行 --apply：本脚本为 dry-run-only，不提供任何删除能力。");
    console.error("如需清理，请在人工复核本报告后另行执行经确认的清理流程。");
    process.exit(2);
  }

  const components = await prisma.componentcatalog.findMany({
    where: {
      OR: TARGET_PREFIXES.map((p) => ({ id: { startsWith: p } })),
    },
    select: {
      id: true,
      activeContractId: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  });

  const componentIds = components.map((c) => c.id);

  const contracts: ContractRow[] = componentIds.length
    ? (
        await prisma.componentcontract.findMany({
          where: { componentId: { in: componentIds } },
          select: {
            id: true,
            componentId: true,
            contractVersion: true,
            lifecycle: true,
            publishedAt: true,
            publishedBy: true,
            createdAt: true,
          },
          orderBy: [{ componentId: "asc" }, { contractVersion: "asc" }],
        })
      ).map((x) => ({ ...x }))
    : [];

  const contractIds = contracts.map((c) => c.id);

  const logs = contractIds.length || componentIds.length
    ? await prisma.operationlog.findMany({
        where: {
          OR: [
            { resource: { in: componentIds } },
            ...(contractIds.length ? [{ resource: { in: contractIds } }] : []),
          ],
        },
        select: { id: true, resource: true, action: true, userId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    : [];

  const reports: ComponentReport[] = components.map((comp) => {
    const own = contracts.filter((c) => c.componentId === comp.id);
    const active = comp.activeContractId ? own.find((c) => c.id === comp.activeContractId) : undefined;
    const ownLogs = logs.filter((l) => l.resource === comp.id || (!!comp.activeContractId && l.resource === comp.activeContractId));
    const actions: Record<string, number> = {};
    for (const l of ownLogs) actions[l.action] = (actions[l.action] ?? 0) + 1;

    return {
      componentId: comp.id,
      componentCreatedAt: comp.createdAt,
      category: comp.createdAt >= since ? "CURRENT_ROUND" : "HISTORICAL",
      activeContractId: comp.activeContractId,
      activeContractLifecycle: active?.lifecycle ?? null,
      // activeContractId 为空（无激活合同）或指向 PUBLISHED 均视为一致；指向 DRAFT/ARCHIVED 为违规
      activeContractConsistent: !comp.activeContractId || active?.lifecycle === "PUBLISHED",
      ...summarize(own),
      contracts: own,
      operationLogCount: ownLogs.length,
      operationLogActions: actions,
    };
  });

  const inconsistent = reports.filter((r) => !r.activeContractConsistent);

  const currentRound = reports.filter((r) => r.category === "CURRENT_ROUND");
  const historical = reports.filter((r) => r.category === "HISTORICAL");
  const activeContracts = reports
    .filter((r) => r.activeContractId)
    .map((r) => ({
      componentId: r.componentId,
      activeContractId: r.activeContractId,
      contractVersion: r.contracts.find((c) => c.id === r.activeContractId)?.contractVersion ?? null,
      activeContractLifecycle: r.activeContractLifecycle,
      category: r.category,
    }));

  const summary = {
    mode: "DRY-RUN-ONLY",
    prefixes: TARGET_PREFIXES,
    since: since.toISOString(),
    componentCount: reports.length,
    contractCount: contracts.length,
    operationLogCount: logs.length,
    // 分类一：本轮新增测试残留（创建时间在 --since 窗口内）
    currentRoundComponentCount: currentRound.length,
    currentRoundComponentIds: currentRound.map((r) => r.componentId),
    // 分类二：历史残留
    historicalComponentCount: historical.length,
    historicalComponentIds: historical.map((r) => r.componentId),
    // 分类三：当前激活合同清单
    activeContractCount: activeContracts.length,
    activeContracts,
    // 分类四：违规 —— activeContractId 指向非 PUBLISHED 或指向缺失合同
    nonPublishedActiveContractCount: inconsistent.length,
    nonPublishedActiveComponentIds: inconsistent.map((r) => r.componentId),
    deletedAnything: false,
  };

  console.log("=== TEST_COMP_* / API_TEST_C_* dry-run 报告（只读，未删除任何数据） ===");
  console.log(JSON.stringify({ summary, components: reports }, null, 2));

  if (inconsistent.length > 0) {
    console.warn(
      `\n[WARN] ${inconsistent.length} 个组件的 activeContractId 指向非 PUBLISHED 合同或指向缺失合同：` +
        `${inconsistent.map((r) => r.componentId).join(", ")}`,
    );
  }
  console.log("\n如需清理上述历史残留，请在人工确认本报告后另行执行清理流程（本脚本不提供删除能力）。");
}

main()
  .catch((e) => {
    console.error("[report-test-contract-orphans] 报告生成失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
