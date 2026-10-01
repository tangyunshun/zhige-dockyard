/**
 * 冻结条件 8 只读核对：成功/失败任务的 task / artifact(result) / usage / pointledger / refundrecovery 可追溯性。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
function loadEnvConfig(p: string) { for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(p, f)); }
loadEnvConfig(process.cwd());

const IDS = [
  { tag: "C07-SUCCESS", id: "892f1342-b370-4e09-9f0a-c143263e7688" },
  { tag: "C01-SUCCESS", id: "f8dab90e-c9f3-4111-852f-04778b142cd4" },
  { tag: "C02-SUCCESS", id: "9aadb743-0d0b-4e5b-823b-bedae4b7a845" },
  { tag: "C07-FAIL", id: "c8137ad8-4adc-46aa-befc-aa144a19f15a" },
  { tag: "C01-FAIL", id: "9f50545a-b64a-4dc4-8067-a4ea973c9b99" },
  { tag: "C02-FAIL", id: "e064f279-e1a0-400c-8f35-2d4c7e1a7eb5" },
];

async function main() {
  const out: Array<Record<string, unknown>> = [];
  for (const { tag, id } of IDS) {
    const task = await prisma.componenttask.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, config: true, result: true, createdAt: true },
    });
    if (!task) { out.push({ tag, id, found: false }); continue; }
    const cfg = (task.config as Record<string, unknown>) ?? {};
    const result = (task.result as Record<string, unknown>) ?? {};
    const artifacts = Array.isArray(result.artifacts) ? (result.artifacts as unknown[]).length : 0;
    const consume = await prisma.pointledger.findMany({ where: { taskId: id, type: "CONSUME" }, select: { points: true } });
    const refund = await prisma.pointledger.findMany({ where: { taskId: id, type: "REFUND" }, select: { points: true } });
    const recovery = await prisma.refundrecovery.count({ where: { taskId: id } });
    out.push({
      tag, id,
      found: true, type: task.type, status: task.status,
      executionMode: cfg.executionMode,
      resultExecutionMode: result.executionMode, artifacts,
      usage: cfg.usage,
      consume: consume.map((c) => Number(c.points)),
      refund: refund.map((r) => Number(r.points)),
      recoveryRows: recovery,
    });
  }
  console.log(JSON.stringify({ traceability: out }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e)); prisma.$disconnect(); process.exit(2); });
