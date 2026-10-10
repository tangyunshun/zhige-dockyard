/** 【只读】E4 验收：C46-C60 合同状态/执行证据/账务/文件上传/全量进度 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const ids = Array.from({ length: 15 }, (_, i) => `C${46 + i}`);
  const cats = await prisma.componentcatalog.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, contract: true, inputMode: true, activeContractId: true, estimatedModelTokens: true } });
  const allC = await prisma.componentcontract.findMany({ select: { id: true, componentId: true, contractVersion: true, lifecycle: true, contract: true } });
  const activeMap = new Map(allC.filter((c) => cats.some((k) => k.activeContractId === c.id)).map((c) => [c.componentId, c]));
  console.log("== 合同状态 ==");
  for (const c of cats) {
    const a = activeMap.get(c.id);
    const k = (a?.contract ?? {}) as any;
    const unsupported = k.unsupportedRequirements?.length ? `阻断x${k.unsupportedRequirements.length}` : null;
    console.log(JSON.stringify({ id: c.id, name: c.name?.slice(0, 16), flow: c.contract, mode: c.inputMode, ver: a?.contractVersion ?? "—", life: a?.lifecycle ?? "—", input: k.input?.kind ?? "—", out: k.output?.kind ?? "—", promptOK: k.qualityPolicy?.requiredSections ? k.qualityPolicy.requiredSections.every((s: string) => (k.executionPlan?.steps?.[0]?.promptTemplate ?? "").includes(s)) : (unsupported ? unsupported : "无章节"), est: k.billingPolicy?.estimatedTokens ?? "—" }));
  }
  // 执行任务与账务
  const tasks = await prisma.componenttask.findMany({ where: { type: { in: ids } }, select: { id: true, type: true, status: true, config: true } });
  let spent = 0, anomalies = 0;
  const byType = new Map<string, { s: number; f: number }>();
  for (const t of tasks) {
    const led = await prisma.pointledger.findMany({ where: { taskId: t.id }, select: { type: true, points: true } });
    const c = led.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
    const r = led.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
    spent += c - r;
    if (t.status === "FAILED" && c !== r) { anomalies++; console.log(`✗ ${t.type} ${t.id.slice(0, 8)} FAILED 未全退 ${c}/${r}`); }
    const e = byType.get(t.type) ?? { s: 0, f: 0 };
    if (t.status === "SUCCESS") e.s++;
    if (t.status === "FAILED") e.f++;
    byType.set(t.type, e);
  }
  console.log("== 执行分布（成功/失败） ==");
  for (const cid of ids) { const e = byType.get(cid); console.log(`${cid}: ${e ? `${e.s}/${e.f}` : "无任务"}`); }
  console.log(`费用: 净消费 ${spent} 点（${(spent / 100).toFixed(2)} 元）| 异常 ${anomalies}`);
  // 文件上传证据
  console.log("== 文件组件上传证据 ==");
  for (const c of cats.filter((k) => k.inputMode !== "text")) {
    const t = tasks.find((x) => x.type === c.id && x.status === "SUCCESS");
    if (!t) { console.log(`${c.id}: 无成功单`); continue; }
    const cfg = (t.config ?? {}) as any;
    console.log(JSON.stringify({ id: c.id, source: cfg?.inputSource?.sourceType, file: cfg?.inputSource?.fileName, size: cfg?.inputSource?.fileSize }));
  }
  // 全量进度
  const all = await prisma.componentcatalog.findMany({ select: { id: true, isPublished: true, activeContractId: true } });
  const ready = all.filter((c) => c.isPublished && c.activeContractId && allC.some((k) => k.id === c.activeContractId && k.lifecycle === "PUBLISHED"));
  const notReady = all.filter((c) => c.isPublished && !ready.some((r) => r.id === c.id)).map((c) => c.id);
  console.log("== 全量进度: 就绪", ready.length, "/ 60 | 未就绪:", notReady.join(" "));
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
