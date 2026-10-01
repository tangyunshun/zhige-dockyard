/** 【只读】批次1验收：价格登记冻结状态 + priceOrigin client 就绪 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const deps = await prisma.modeldeployment.findMany({
    select: { id: true, modelId: true, enabled: true, pricing: { select: { priceKind: true, costInputMicrosPerMillion: true, costOutputMicrosPerMillion: true, saleInputMicrosPerMillion: true, saleOutputMicrosPerMillion: true, priceOrigin: true, verificationStatus: true } } },
  });
  for (const d of deps) console.log(JSON.stringify(d));
  const byo = await (prisma as any).workspaceByoModel?.count?.() ?? "table-or-field-check";
  console.log("byo count:", byo);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
