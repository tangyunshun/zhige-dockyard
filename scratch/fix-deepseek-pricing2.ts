/** 【授权写库】补全 deepseek-flash markupRateBps=10000（成本×2 = 售价，与全局 k=2.0 同口径） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const dep = await prisma.modeldeployment.findFirst({ where: { modelId: "deepseek-flash" }, select: { id: true } });
  if (!dep) throw new Error("not found");
  const before = await prisma.modelpricing.findUnique({ where: { deploymentId: dep.id }, select: { markupRateBps: true, costInputMicrosPerMillion: true, costOutputMicrosPerMillion: true } });
  console.log("before:", JSON.stringify(before));
  await prisma.modelpricing.update({ where: { deploymentId: dep.id }, data: { markupRateBps: 10000 } });
  const after = await prisma.modelpricing.findUnique({ where: { deploymentId: dep.id }, select: { markupRateBps: true } });
  console.log("after:", JSON.stringify(after));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
