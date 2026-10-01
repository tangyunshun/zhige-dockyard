/** 【只读】批次2试点全局对账：余额守恒 + 试点流水全量配对 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
const WS_ID = "ws-enterprise-1787927954618-9arzol";
async function main() {
  const q = await prisma.workspacequota.findUnique({ where: { workspaceId: WS_ID }, select: { tokenBalance: true } });
  const balance = Number(q?.tokenBalance ?? 0);
  // 试点全部流水：充值 + 试点任务（2026-10-01 之后）
  const ledgers = await prisma.pointledger.findMany({
    where: { workspaceId: WS_ID, createdAt: { gte: new Date("2026-10-01T00:00:00Z") } },
    orderBy: { createdAt: "asc" },
    select: { type: true, points: true, taskId: true, idempotencyKey: true, createdAt: true },
  });
  let sum = 0;
  const rows = ledgers.map((l) => { const p = Number(l.points); sum += p; return { t: l.type, p, task: l.taskId?.slice(0, 8) ?? "-", k: l.idempotencyKey?.slice(0, 22) }; });
  console.log("流水条数:", ledgers.length, "| 净额:", sum, "| 当前余额:", balance);
  for (const r of rows) console.log(JSON.stringify(r));
  // 每个试点任务的 CONSUME/REFUND 配对检查
  const byTask = new Map<string, { c: number; r: number }>();
  for (const l of ledgers) { if (!l.taskId) continue; const e = byTask.get(l.taskId) ?? { c: 0, r: 0 }; const p = Number(l.points); if (l.type === "CONSUME") e.c += p; if (l.type === "REFUND") e.r += p; byTask.set(l.taskId, e); }
  const tasks = await prisma.componenttask.findMany({ where: { id: { in: [...byTask.keys()] } }, select: { id: true, type: true, status: true } });
  console.log("\n任务配对：");
  for (const t of tasks) { const e = byTask.get(t.id)!; console.log(JSON.stringify({ task: t.id.slice(0, 8), type: t.type, status: t.status, consume: e.c, refund: e.r, net: e.c - e.r })); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
