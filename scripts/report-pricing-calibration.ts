/**
 * 【只读报告脚本 · 严禁写操作】
 * 批次 1 收尾项 8「定价校准」：
 *   1. 只读统计各组件历史 SUCCESS 任务的真实 usage（输入 / 输出 Token）：均值、P50、P95、样本数；
 *   2. 用真实均值 × 模型单价 × 加价系数 k=2.0，输出每组件单位经济表（成本 / 售价 / 毛利）；
 *   3. 给出建议写回 componentcatalog.estimatedModelTokens 的「Token 估算」校准值。
 *
 * 本脚本只执行 findMany / count，绝不 create / update / delete。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 从任务 config 中解析真实 usage（兼容多种历史落库形状） */
function pickUsage(cfg: unknown): { input: number; output: number; total: number } | null {
  if (!cfg || typeof cfg !== "object") return null;
  const c = cfg as Record<string, any>;
  const candidates = [c.execution, c.usage, c.modelUsage, c];
  for (const u of candidates) {
    if (!u || typeof u !== "object") continue;
    const input = Number(u.inputTokens ?? u.promptTokens);
    const output = Number(u.outputTokens ?? u.completionTokens);
    const total = Number(u.totalTokens ?? (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0));
    if (Number.isFinite(input) && Number.isFinite(output) && (input > 0 || output > 0)) {
      return { input, output, total: Number.isFinite(total) ? total : input + output };
    }
  }
  return null;
}

function mean(xs: number[]) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function pct(xs: number[], p: number) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

/** 加价系数 k（与 billing.markupCoefficientBps 默认一致：20000 = 2.0） */
const K = 2.0;
/** 1 元 = 100 算力点 */
const POINTS_PER_YUAN = 100;
/** 单位：微元 / 百万 Token */
const MICROS_PER_YUAN = 1_000_000;

async function main() {
  // 1. 取当前已登记单价（成本或售价）作为计价基准
  const pricings = await prisma.modelpricing.findMany({
    select: {
      deploymentId: true,
      costInputMicrosPerMillion: true,
      costOutputMicrosPerMillion: true,
      priceInputMicrosPerMillion: true,
      priceOutputMicrosPerMillion: true,
    },
  });
  const base = pricings.find(
    (p) => p.costInputMicrosPerMillion != null && p.costOutputMicrosPerMillion != null,
  );
  if (!base) {
    console.log("未找到任何登记了成本价的部署，无法做单位经济测算。");
    return;
  }
  const costInYuan = (base.costInputMicrosPerMillion ?? 0) / MICROS_PER_YUAN;
  const costOutYuan = (base.costOutputMicrosPerMillion ?? 0) / MICROS_PER_YUAN;
  console.log(
    `计价基准部署 ${base.deploymentId}：成本 输入 ${costInYuan} 元/百万、输出 ${costOutYuan} 元/百万；k=${K}`,
  );

  // 2. 只读统计历史 SUCCESS 任务真实用量
  const total = await prisma.componenttask.count({ where: { status: "SUCCESS" } });
  console.log(`[只读] SUCCESS 任务总数：${total}`);
  const tasks = await prisma.componenttask.findMany({
    where: { status: "SUCCESS" },
    // 组件归因字段为 type（与 2B 快照报告「按 componenttask.type 归因」口径一致）
    select: { id: true, type: true, config: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const byComp = new Map<string, { input: number[]; output: number[] }>();
  let parsed = 0;
  for (const t of tasks) {
    const u = pickUsage(t.config);
    if (!u) continue;
    parsed += 1;
    const key = String(t.type ?? "UNKNOWN");
    const cur = byComp.get(key) ?? { input: [], output: [] };
    cur.input.push(u.input);
    cur.output.push(u.output);
    byComp.set(String(t.type ?? "UNKNOWN"), cur);
  }
  console.log(`[只读] 解析到真实 usage 的任务数：${parsed} / ${tasks.length}`);

  const catalog = await prisma.componentcatalog.findMany({
    select: { id: true, name: true, estimatedModelTokens: true },
  });
  const catMap = new Map(catalog.map((c) => [c.id, c]));

  console.log(
    "\n=== 单位经济表（真实用量均值 × 成本 × k=2.0）===",
  );
  console.log(
    "componentId | 名称 | 样本 | 输入均值 | 输出均值 | 输入P95 | 输出P95 | 现行估算值 | 建议校准值(Token) | 成本(元) | 售价(元) | 售价(点) | 毛利(元)",
  );

  for (const [componentId, v] of [...byComp.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const inMean = mean(v.input);
    const outMean = mean(v.output);
    const inP95 = pct(v.input, 95);
    const outP95 = pct(v.output, 95);
    const cost = (inMean / 1_000_000) * costInYuan + (outMean / 1_000_000) * costOutYuan;
    const price = cost * K;
    const points = Math.ceil(price * POINTS_PER_YUAN);
    const gross = price - cost;
    const cat = catMap.get(componentId);
    // 建议校准值：以真实均值总量为准（回归 Token 本义）
    const suggested = Math.round(inMean + outMean);
    console.log(
      `${componentId} | ${cat?.name ?? "—"} | ${v.input.length} | ${Math.round(inMean)} | ${Math.round(outMean)} | ${Math.round(inP95)} | ${Math.round(outP95)} | ${cat?.estimatedModelTokens ?? "—"} | ${suggested} | ${cost.toFixed(4)} | ${price.toFixed(4)} | ${points} | ${gross.toFixed(4)}`,
    );
  }

  console.log(
    "\n注：本脚本为只读，不写回 componentcatalog；校准值需负责人确认后再由受控脚本写入。",
  );
}

main()
  .catch((e) => {
    console.error("只读校准报告失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
