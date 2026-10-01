/** 【只读】C07 v1.1.0 合同 promptTemplate 原文 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const cat = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { activeContractId: true } });
  const c = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! }, select: { contract: true } });
  const k = c!.contract as any;
  console.log("promptTemplate:", JSON.stringify(k.executionPlan.steps[0].promptTemplate));
  console.log("contractVersion:", k.contractVersion, "| lifecycle:", k.lifecycle, "| publishedAt:", k.publishedAt, "| publishedBy:", k.publishedBy);
  console.log("requiredSections:", JSON.stringify(k.qualityPolicy.requiredSections));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
