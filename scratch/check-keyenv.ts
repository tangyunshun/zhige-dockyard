import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const p = await prisma.modelprovider.findMany({ select: { name: true, enabled: true, apiKeyEnv: true } });
  for (const x of p) console.log(JSON.stringify({ name: x.name, enabled: x.enabled, apiKeyEnv: x.apiKeyEnv }));
  const d = await prisma.modeldeployment.findFirst({ where: { modelId: "deepseek-flash" }, select: { id: true, providerId: true } });
  console.log("deepseek deployment:", JSON.stringify(d));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
