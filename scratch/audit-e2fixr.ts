/** 【只读】E2-FIX-R 验收：十二组件任务/流水/费用/JSON artifact 全量核对 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const ids = ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"];
  const tasks = await prisma.componenttask.findMany({ where: { type: { in: ids } }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, status: true, createdAt: true, result: true } });
  let spent = 0, anomalies = 0;
  const perType = new Map<string, { tasks: Array<{ id: string; status: string; c: number; r: number }> }>();
  for (const t of tasks) {
    const led = await prisma.pointledger.findMany({ where: { taskId: t.id }, select: { type: true, points: true } });
    const c = led.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
    const r = led.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
    spent += c - r;
    if (t.status === "FAILED" && c !== r) { anomalies++; console.log(`✗ FAILED 未全退 ${t.type} ${t.id.slice(0, 8)}: ${c}/${r}`); }
    if (t.status === "SUCCESS" && c <= 0) { anomalies++; console.log(`✗ SUCCESS 无扣费 ${t.type} ${t.id.slice(0, 8)}`); }
    const e = perType.get(t.type) ?? { tasks: [] };
    e.tasks.push({ id: t.id.slice(0, 8), status: t.status, c, r });
    perType.set(t.type, e);
  }
  for (const cid of ids) {
    const e = perType.get(cid);
    if (!e) { console.log(`${cid}: 无任务`); continue; }
    for (const t of e.tasks) console.log(`${cid} ${t.id} ${t.status} 扣${t.c} 退${t.r} 净${t.c - t.r}`);
  }
  console.log(`合计: 任务 ${tasks.length} | 净消费 ${spent} 点（${(spent / 100).toFixed(2)} 元）| 账务异常 ${anomalies}`);
  // C24/C29 JSON artifact 专项
  for (const cid of ["C24", "C29"]) {
    const t = tasks.filter((x) => x.type === cid && x.status === "SUCCESS").pop();
    if (!t) { console.log(`${cid}: 无 SUCCESS 任务可核 artifact`); continue; }
    const full = await prisma.componenttask.findUnique({ where: { id: t.id }, select: { result: true } });
    const res = (full?.result ?? {}) as any;
    const art = res?.outputData?.artifacts?.[0] ?? res?.artifacts?.[0];
    console.log(`${cid} artifact:`, JSON.stringify({ type: art?.type, mime: art?.mimeType, renderer: art?.rendererType, preview: (typeof art?.content === "string" ? art.content : JSON.stringify(art?.content))?.slice(0, 150) }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
