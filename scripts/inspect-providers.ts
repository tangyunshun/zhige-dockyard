import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await prisma.modelprovider.findMany({
    select: {
      id: true,
      name: true,
      baseUrl: true,
      apiKeyEnv: true,
      apiKeyCipher: true,
      enabled: true,
      _count: { select: { deployments: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  for (const r of rows) {
    console.log(
      `${r.name}\t| env=${r.apiKeyEnv || "(none)"}\t| cipher?=${!!r.apiKeyCipher}\t| enabled=${r.enabled}\t| deployments=${r._count.deployments}`,
    );
  }
  const deepseek = await prisma.modelprovider.findMany({ where: { name: { contains: "deepseek" } }, select: { id: true, name: true } });
  console.log("DEEPSEEK_MATCH:", JSON.stringify(deepseek));
  const magic = await prisma.modelprovider.findMany({ where: { name: { contains: "Magic" } }, select: { id: true, name: true } });
  console.log("MAGIC_MATCH:", JSON.stringify(magic));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
