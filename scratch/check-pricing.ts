/** 【只读】部署价格冻结状态 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const deps = await prisma.modeldeployment.findMany({
    select: { modelId: true, enabled: true, pricing: true },
  });
  for (const d of deps) {
    const p = d.pricing as any;
    console.log(JSON.stringify({ model: d.modelId, enabled: d.enabled, hasPricing: !!p, priceKind: p?.priceKind, verification: p?.verificationStatus, priceOrigin: p?.priceOrigin }));
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
