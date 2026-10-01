import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = ["C01", "C02", "C07"];
  for (const cid of ids) {
    const cat: any = await prisma.componentcatalog.findUnique({
      where: { id: cid },
      select: { id: true, name: true, estimatedModelTokens: true, activeContractId: true },
    });
    const contract: any = await prisma.componentcontract.findFirst({
      where: { componentId: cid, lifecycle: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { contractVersion: true, lifecycle: true, contract: true },
    });
    const estTokens = contract?.contract
      ? (contract.contract as any)?.billingPolicy?.estimatedTokens ?? (contract.contract as any)?.estimatedTokens
      : null;
    const billingMode = contract?.contract
      ? (contract.contract as any)?.billingPolicy?.billingMode ?? (contract.contract as any)?.billingMode
      : null;
    const tasks: any[] = await prisma.componenttask.findMany({
      where: { type: cid },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, status: true, createdAt: true, result: true, config: true },
    });
    const succ = tasks.filter((t) => t.status === "SUCCESS").length;
    const fail = tasks.filter((t) => t.status === "FAILED").length;
    const running = tasks.filter((t) => t.status === "RUNNING").length;
    const latestFail = tasks.find((t) => t.status === "FAILED");
    let failInfo: any = null;
    if (latestFail) {
      const cons = await prisma.pointledger.findMany({
        where: { taskId: latestFail.id, type: "CONSUME" },
        select: { points: true },
      });
      const refs = await prisma.pointledger.findMany({
        where: { taskId: latestFail.id, type: "REFUND" },
        select: { points: true },
      });
      const rec = await prisma.refundrecovery.findMany({
        where: { taskId: latestFail.id },
        select: { id: true, status: true },
      });
      failInfo = {
        taskId: latestFail.id,
        code: (latestFail.result as any)?.errorCode,
        consume: cons.reduce((s, l) => s + Number(l.points), 0),
        refund: refs.reduce((s, l) => s + Number(l.points), 0),
        recovery: rec,
        hasArtifact: (latestFail.result as any)?.hasArtifact,
      };
    }
    console.log(`\n===== ${cid} =====`);
    console.log(`catalog.estimatedModelTokens = ${cat?.estimatedModelTokens}`);
    console.log(`activeContractId = ${cat?.activeContractId}`);
    console.log(`contractVersion = ${contract?.contractVersion} / lifecycle = ${contract?.lifecycle}`);
    console.log(`billingPolicy.estimatedTokens = ${estTokens} / billingMode = ${billingMode}`);
    console.log(`recent tasks: ${tasks.length} | SUCCESS=${succ} FAILED=${fail} RUNNING=${running}`);
    if (failInfo) console.log(`latest FAILED: ${JSON.stringify(failInfo)}`);
  }
  const runningAll = await prisma.componenttask.count({ where: { status: "RUNNING" } });
  console.log(`\nTOTAL RUNNING tasks = ${runningAll}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
});
