/**
 * 清理 C01 遗留的历史样例草稿（0.1.0-sample）
 *
 * 严格约束：
 *  - **仅**处理 componentId === "C01" 且 contractVersion === "0.1.0-sample" 且 lifecycle === "DRAFT" 的合同；
 *  - 若该合同被 componentcatalog.activeContractId 引用，则拒绝删除（绝不删生产激活合同）；
 *  - **绝不触碰 C07**（C07 的历史样例草稿保持原样）；
 *  - 幂等：不存在时输出 NO_OP；
 *  - 安全：匹配数量必须恰好为 1，否则拒绝执行（防止误删/批量删除）。
 *
 * 用法：npx tsx prisma/cleanup-c01-sample-draft.ts [--apply]
 */
import { prisma } from "@/lib/prisma";

const TARGET_COMPONENT = "C01";
const TARGET_VERSION = "0.1.0-sample";

async function main() {
  const apply = process.argv.includes("--apply");

  const matches = await prisma.componentcontract.findMany({
    where: { componentId: TARGET_COMPONENT, contractVersion: TARGET_VERSION, lifecycle: "DRAFT" },
    select: { id: true, lifecycle: true, contractVersion: true },
  });

  const comp = await prisma.componentcatalog.findUnique({
    where: { id: TARGET_COMPONENT },
    select: { activeContractId: true },
  });

  if (matches.length === 0) {
    console.log(JSON.stringify({ status: "NO_OP", reason: "未找到匹配的历史样例草稿", target: TARGET_COMPONENT, version: TARGET_VERSION }, null, 2));
    await prisma.$disconnect();
    return;
  }
  if (matches.length !== 1) {
    console.error(`CLEANUP_FAIL MATCH_COUNT: 期望恰好 1 条历史样例草稿，实际 ${matches.length} 条，拒绝执行。`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const target = matches[0];
  if (comp?.activeContractId === target.id) {
    console.error("CLEANUP_FAIL ACTIVE_REFERENCE: 目标草稿正被 activeContractId 引用，拒绝删除。");
    await prisma.$disconnect();
    process.exit(2);
  }

  if (!apply) {
    console.log(JSON.stringify({ status: "WOULD_DELETE", contractId: target.id, componentId: TARGET_COMPONENT, version: target.contractVersion, lifecycle: target.lifecycle }, null, 2));
    await prisma.$disconnect();
    return;
  }

  await prisma.componentcontract.delete({ where: { id: target.id } });
  console.log(JSON.stringify({ status: "DELETED", contractId: target.id, componentId: TARGET_COMPONENT, version: target.contractVersion, wroteDatabase: true }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CLEANUP_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
