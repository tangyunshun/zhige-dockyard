/** 【授权写库】补全 deepseek-flash modelpricing 定价模式字段（1 行 update）：
 *  priceKind=COST_PLUS_MARKUP + markupRateBps=10000（成本×2 = 售价，与全局 k=2.0 同口径，
 *  保证估价路径（算账中心 multiplier）与结算路径（resolveEffectiveUserPrice）售价一致） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const gpt = await prisma.modelpricing.findFirst({ where: { deployment: { modelId: "gpt-5.5" } }, select: { priceKind: true, markupRateBps: true, costInputMicrosPerMillion: true } });
  console.log("gpt-5.5 惯例:", JSON.stringify(gpt));
  const dep = await prisma.modeldeployment.findFirst({ where: { modelId: "deepseek-flash" }, select: { id: true } });
  if (!dep) throw new Error("deepseek deployment not found");
  const before = await prisma.modelpricing.findUnique({ where: { deploymentId: dep.id }, select: { priceKind: true, markupRateBps: true } });
  console.log("deepseek before:", JSON.stringify(before));
  await prisma.modelpricing.update({
    where: { deploymentId: dep.id },
    data: { priceKind: "COST_PLUS_MARKUP", markupRateBps: 10000 },
  });
  const after = await prisma.modelpricing.findUnique({ where: { deploymentId: dep.id }, select: { priceKind: true, markupRateBps: true } });
  console.log("deepseek after:", JSON.stringify(after));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
