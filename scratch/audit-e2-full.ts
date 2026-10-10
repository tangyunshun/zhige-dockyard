/** 【只读】E2 扩展全量审核：C20-C31 执行证据 + 越界组件抽审 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const ids = ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"];
  const tasks = await prisma.componenttask.findMany({ where: { type: { in: ids } }, select: { id: true, type: true, status: true, result: true } });
  const byType = new Map<string, { s: number; f: number; other: number }>();
  for (const t of tasks) {
    const e = byType.get(t.type) ?? { s: 0, f: 0, other: 0 };
    if (t.status === "SUCCESS") e.s++;
    else if (t.status === "FAILED") e.f++;
    else e.other++;
    byType.set(t.type, e);
  }
  console.log("执行任务分布（成功/失败/其他）:");
  for (const cid of ids) { const e = byType.get(cid); console.log(`  ${cid}: ${e ? `${e.s}/${e.f}/${e.other}` : "无任务"}`); }
  // 越界组件抽审：C26/C30/C31 合同关键字段
  for (const cid of ["C26", "C30", "C31"]) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { name: true, contract: true, activeContractId: true } });
    const row = cat?.activeContractId ? await prisma.componentcontract.findUnique({ where: { id: cat.activeContractId }, select: { contract: true } }) : null;
    const k = (row?.contract ?? {}) as any;
    console.log(JSON.stringify({ cid, name: cat?.name?.slice(0, 18), flow: cat?.contract, inputKind: k.input?.kind, outputKind: k.output?.kind, reqSections: k.qualityPolicy?.requiredSections, promptOK: k.qualityPolicy?.requiredSections?.every((s: string) => (k.executionPlan?.steps?.[0]?.promptTemplate ?? "").includes(s)), est: k.billingPolicy?.estimatedTokens }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
