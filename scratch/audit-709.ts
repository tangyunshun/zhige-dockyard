import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const t = await prisma.componenttask.findUnique({ where: { id: { startsWith: "" } as any } }).catch(() => null);
  void t;
  const cand = await prisma.componenttask.findFirst({ where: { id: { startsWith: "70967ffc" } }, select: { id: true, type: true, status: true, createdAt: true, result: true, config: true } });
  if (!cand) { console.log("70967ffc 不存在"); return; }
  const led = await prisma.pointledger.findMany({ where: { taskId: cand.id }, select: { type: true, points: true } });
  console.log("70967ffc:", JSON.stringify({ type: cand.type, status: cand.status, at: cand.createdAt, err: ((cand.result ?? {}) as any)?.errorCode ?? null, chargeAttempted: ((cand.config ?? {}) as any)?.chargeAttempted ?? null, ledgers: led.map((l) => `${l.type}:${Number(l.points)}`) }));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
