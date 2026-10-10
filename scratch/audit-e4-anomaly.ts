/** 【只读】E4 异常深查：C57 未退款任务详情 + C57-C60 失败错误码分布 + 全量进度 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  // 1. C57 未全退的 FAILED 任务详情
  const tasks57 = await prisma.componenttask.findMany({ where: { type: "C57" }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, result: true, config: true, createdAt: true } });
  for (const t of tasks57) {
    const led = await prisma.pointledger.findMany({ where: { taskId: t.id }, select: { type: true, points: true } });
    const c = led.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
    const r = led.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
    const res = (t.result ?? {}) as any;
    const cfg = (t.config ?? {}) as any;
    if (c !== r || t.status === "FAILED") {
      console.log(JSON.stringify({ task: t.id.slice(0, 8), status: t.status, err: res?.errorCode ?? null, consume: c, refund: r, chargeAttempted: cfg?.chargeAttempted ?? null, at: t.createdAt }));
    }
  }
  // 2. C57-C60 失败错误码分布
  for (const cid of ["C57", "C58", "C59", "C60"]) {
    const failed = await prisma.componenttask.findMany({ where: { type: cid, status: "FAILED" }, select: { result: true } });
    const byErr = new Map<string, number>();
    for (const f of failed) { const e = ((f.result ?? {}) as any)?.errorCode ?? "null"; byErr.set(e, (byErr.get(e) ?? 0) + 1); }
    console.log(`${cid} 失败 ${failed.length}:`, JSON.stringify([...byErr.entries()]));
  }
  // 3. 全量进度
  const all = await prisma.componentcatalog.findMany({ select: { id: true, isPublished: true, activeContractId: true } });
  const allC = await prisma.componentcontract.findMany({ select: { id: true, lifecycle: true } });
  const ready = all.filter((c) => c.isPublished && c.activeContractId && allC.some((k) => k.id === c.activeContractId && k.lifecycle === "PUBLISHED"));
  const notReady = all.filter((c) => c.isPublished && !ready.some((r) => r.id === c.id)).map((c) => c.id);
  console.log("全量进度: 就绪", ready.length, "/ 60 | 未就绪:", notReady.join(" "));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
