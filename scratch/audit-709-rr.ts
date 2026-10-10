import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const rr = await prisma.refundrecovery.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { taskId: true, status: true, points: true, createdAt: true } });
  console.log("refundrecovery 最新记录:", JSON.stringify(rr.map((r) => ({ task: r.taskId.slice(0, 8), s: r.status, p: Number(r.points) }))));
  const ws = await prisma.workspacequota.findUnique({ where: { workspaceId: "ws-enterprise-1787927954618-9arzol" }, select: { tokenBalance: true } });
  const led = await prisma.pointledger.aggregate({ _sum: { points: true } });
  console.log("空间余额:", ws?.tokenBalance?.toString(), "| 全库流水净额(应≈总发放):", Number(led._sum.points ?? 0));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
