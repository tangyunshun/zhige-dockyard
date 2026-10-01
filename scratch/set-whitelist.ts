/** 【授权写库】批次2灰度白名单：settlement_component_whitelist = ["C01","C07"]（授权表内 1 行） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const before = await prisma.systemconfig.findUnique({ where: { key: "settlement_component_whitelist" } });
  console.log("before:", before?.value ?? "(absent)");
  await prisma.systemconfig.upsert({
    where: { key: "settlement_component_whitelist" },
    update: { value: JSON.stringify(["C01", "C07"]) },
    create: { key: "settlement_component_whitelist", value: JSON.stringify(["C01", "C07"]) },
  });
  const after = await prisma.systemconfig.findUnique({ where: { key: "settlement_component_whitelist" } });
  console.log("after:", after?.value);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
