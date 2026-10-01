/** 【只读】阶段 A 验收：6 行写库逐行核对 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const cfg = await prisma.systemconfig.findMany({ where: { key: { in: ["billing_usage_calibration", "billing.minPointsPerTask", "minPointsPerTask"] } } });
  for (const c of cfg) console.log("systemconfig:", c.key, "=", c.value?.slice(0, 120));
  for (const cid of ["C01", "C02", "C07"]) {
    const c = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { estimatedModelTokens: true } });
    console.log(`catalog ${cid}.estimatedModelTokens =`, c?.estimatedModelTokens);
  }
  const dep = await prisma.modeldeployment.findFirst({ where: { modelId: "deepseek-flash" }, select: { id: true, enabled: true, pricing: true } });
  const p = dep?.pricing as any;
  console.log("modelpricing deepseek-flash:", JSON.stringify({ hasPricing: !!p, costIn: p?.costInputMicrosPerMillion, costOut: p?.costOutputMicrosPerMillion, saleIn: p?.saleInputMicrosPerMillion, saleOut: p?.saleOutputMicrosPerMillion, verification: p?.verificationStatus, priceOrigin: p?.priceOrigin, currency: p?.currency, priceKind: p?.priceKind }));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
