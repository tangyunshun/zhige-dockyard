import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const p = await prisma.modelpricing.findFirst({
    where: { deployment: { modelId: "gpt-5.5" } },
    select: { markupRateBps: true, costInputMicrosPerMillion: true, costOutputMicrosPerMillion: true, priceInputMicrosPerMillion: true, priceOutputMicrosPerMillion: true, priceSource: true, priceStatus: true, priceVersion: true, effectiveFrom: true },
  });
  console.log(JSON.stringify(p, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
