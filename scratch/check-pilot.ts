/** 【只读】批次2试点痕迹 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const wl = await prisma.systemconfig.findUnique({ where: { key: "settlement_component_whitelist" } });
  console.log("whitelist config:", wl?.value ?? "(absent)");
  const recentLedgers = await prisma.pointledger.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { type: true, points: true, userId: true, taskId: true, createdAt: true, idempotencyKey: true } });
  for (const l of recentLedgers) console.log("ledger:", JSON.stringify({ type: l.type, points: Number(l.points), taskId: l.taskId?.slice(0, 12), key: l.idempotencyKey?.slice(0, 30), at: l.createdAt }));
  const recentTasks = await prisma.componenttask.findMany({ where: { type: { in: ["C01", "C07"] }, createdAt: { gte: new Date("2026-10-01") } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, type: true, status: true, createdAt: true, config: true } });
  for (const t of recentTasks) { const c = (t.config ?? {}) as any; console.log("task:", JSON.stringify({ type: t.type, status: t.status, at: t.createdAt, billingMode: c.billingMode, settlementStatus: c.settlementStatus ?? c.settlement?.status })); }
}
main().catch((e) => { console.error(e.message); }).finally(() => prisma.$disconnect());
