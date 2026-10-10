/** 【只读】C26-C31 目录语义（材料定制输入） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const cats = await prisma.componentcatalog.findMany({ where: { id: { in: ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"] } }, select: { id: true, name: true, description: true, inputMode: true, accept: true, activeContractId: true } });
  for (const c of cats) {
    let kind = "?";
    if (c.activeContractId) {
      const row = await prisma.componentcontract.findUnique({ where: { id: c.activeContractId }, select: { contract: true } });
      kind = `${(row!.contract as any).input?.kind}->${(row!.contract as any).output?.kind}`;
    }
    console.log(JSON.stringify({ id: c.id, name: c.name, desc: c.description?.slice(0, 50), inputMode: c.inputMode, accept: c.accept?.slice(0, 30), io: kind }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
