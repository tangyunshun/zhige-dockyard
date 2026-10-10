/** 【只读】E2-FIX 流水配对与费用合计（C20-C31） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const ids = ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"];
  const tasks = await prisma.componenttask.findMany({ where: { type: { in: ids } }, select: { id: true, type: true, status: true } });
  let spent = 0, anomalies = 0;
  for (const t of tasks) {
    const led = await prisma.pointledger.findMany({ where: { taskId: t.id }, select: { type: true, points: true } });
    const c = led.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
    const r = led.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
    spent += c - r;
    if (t.status === "FAILED" && c !== r) { anomalies++; console.log("✗ FAILED 未全退:", t.id.slice(0, 8), t.type, c, r); }
    if (t.status === "SUCCESS" && c <= 0) { anomalies++; console.log("✗ SUCCESS 无扣费:", t.id.slice(0, 8)); }
  }
  console.log(JSON.stringify({ 任务数: tasks.length, 净消费点数: spent, 净消费元: spent / 100, 账务异常: anomalies }));
  // C24 JSON artifact 专项：JSON_VIEWER 校验行为
  const c24 = await prisma.componenttask.findFirst({ where: { type: "C24", status: "SUCCESS" }, select: { id: true, result: true } });
  if (c24) {
    const res = (c24.result ?? {}) as any;
    const art = res?.outputData?.artifacts?.[0] ?? res?.artifacts?.[0];
    console.log("C24 JSON artifact:", JSON.stringify({ type: art?.type, mime: art?.mimeType, renderer: art?.rendererType, contentPreview: typeof art?.content === "string" ? art.content.slice(0, 120) : JSON.stringify(art?.content)?.slice(0, 120) }));
  } else console.log("C24 无 SUCCESS 任务");
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
