import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  for (const cid of ["C26", "C27", "C28", "C29"]) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { activeContractId: true } });
    const contracts = await prisma.componentcontract.findMany({ where: { componentId: cid }, select: { contractVersion: true, lifecycle: true } });
    console.log(JSON.stringify({ cid, active: !!cat?.activeContractId, contracts: contracts.map((c) => `${c.contractVersion}:${c.lifecycle}`) }));
  }
  // 全量合同就绪盘点
  const cats = await prisma.componentcatalog.findMany({ select: { id: true, isPublished: true, activeContractId: true } });
  const allContracts = await prisma.componentcontract.findMany({ select: { id: true, componentId: true, contractVersion: true, lifecycle: true } });
  const ready = cats.filter((c) => c.isPublished && c.activeContractId && allContracts.some((k) => k.id === c.activeContractId && k.lifecycle === "PUBLISHED"));
  console.log("全量合同就绪:", ready.length, "→", ready.map((r) => r.id).join(" "));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
