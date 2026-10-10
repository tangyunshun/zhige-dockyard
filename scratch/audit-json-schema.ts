/** 【只读】E3 JSON 组件的 schema 校验深度抽查 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  for (const cid of ["C36", "C38", "C39", "C41", "C42", "C44", "C24"]) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { activeContractId: true } });
    if (!cat?.activeContractId) continue;
    const row = await prisma.componentcontract.findUnique({ where: { id: cat.activeContractId }, select: { contract: true } });
    const k = (row!.contract as any);
    const out = k.output ?? {};
    const qp = k.qualityPolicy ?? {};
    console.log(JSON.stringify({ cid, schemaVersion: out.schemaVersion ?? null, structureKeys: out.structureConstraints ? Object.keys(out.structureConstraints) : null, requiredProps: out.structureConstraints?.requiredProperties ?? null, minLen: qp.minOutputLength ?? null }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
