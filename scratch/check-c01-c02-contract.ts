/** 【只读】C01/C02 激活合同关键字段 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  for (const cid of ["C01", "C02"]) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { activeContractId: true } });
    if (!cat?.activeContractId) { console.log(cid, "NO ACTIVE CONTRACT"); continue; }
    const c = await prisma.componentcontract.findUnique({ where: { id: cat.activeContractId }, select: { contract: true } });
    const k = (c?.contract ?? {}) as any;
    console.log(JSON.stringify({
      cid,
      inputKind: k.input?.kind,
      outputKind: k.output?.kind,
      renderer: k.output?.rendererType,
      billingMode: k.billingPolicy?.mode,
      estimatedPoints: k.billingPolicy?.estimatedPoints ?? k.billingPolicy?.estimatedModelTokens ?? null,
      capabilities: k.requiredCapabilities ?? k.capabilities ?? k.executionPlan?.steps?.[0]?.requiredCapabilities ?? null,
      steps: (k.executionPlan?.steps ?? []).map((s: any) => ({ type: s.type, hasPrompt: !!s.promptTemplate })),
    }));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
