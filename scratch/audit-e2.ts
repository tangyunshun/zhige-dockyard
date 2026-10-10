/** 【只读】E2 审核：C20-C25 合同设计差异化 + 执行证据 + C22 目录修复 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  for (const cid of ["C20", "C21", "C22", "C23", "C24", "C25"]) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { name: true, activeContractId: true, contract: true, estimatedModelTokens: true, inputMode: true } });
    const contracts = cat?.activeContractId
      ? [await prisma.componentcontract.findUnique({ where: { id: cat.activeContractId }, select: { contractVersion: true, lifecycle: true, contract: true } })]
      : await prisma.componentcontract.findMany({ where: { componentId: cid }, select: { contractVersion: true, lifecycle: true, contract: true } });
    for (const row of contracts) {
      const k = (row?.contract ?? {}) as any;
      console.log(JSON.stringify({
        cid, ver: row?.contractVersion, life: row?.lifecycle,
        dirFlow: cat?.contract, dirTokens: cat?.estimatedModelTokens,
        inputKind: k.input?.kind,
        fileMimes: k.input?.fileConstraints ? (k.input.fileConstraints.acceptedMimes ?? []).slice(0, 4) : null,
        outputKind: k.output?.kind,
        renderer: k.output?.rendererType,
        reqSections: k.qualityPolicy?.requiredSections,
        promptOK: k.qualityPolicy?.requiredSections?.every((s: string) => (k.executionPlan?.steps?.[0]?.promptTemplate ?? "").includes(s)),
        caps: k.executionPlan?.steps?.[0]?.requiredCapabilities,
        est: k.billingPolicy?.estimatedTokens,
      }));
    }
  }
  const tasks = await prisma.componenttask.findMany({ where: { type: { in: ["C20", "C21", "C22", "C23", "C24", "C25"] } }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, status: true, createdAt: true, result: true } });
  for (const t of tasks) {
    const res = (t.result ?? {}) as any;
    const led = await prisma.pointledger.findMany({ where: { taskId: t.id }, select: { type: true, points: true } });
    const c = led.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
    const r = led.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
    console.log(JSON.stringify({ cid: t.type, task: t.id.slice(0, 8), status: t.status, at: t.createdAt, err: res?.errorCode ?? null, consume: c, refund: r, net: c - r }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
