/**
 * 写入/查看「真实历史成本·工时基准」（数据驱动，替代硬编码假设）
 *
 * 只写 systemconfig.COMPONENT_COST_BASELINE，**绝不触碰**价格、结算开关、合同与模型绑定。
 *
 * 用法：
 *   npx tsx scripts/set-cost-baseline.ts --show
 *   npx tsx scripts/set-cost-baseline.ts --personMonthYuan 20000 --cloudMin 30000 --cloudMax 120000 \
 *       --pmTestRatio 15 --source "2024-2025 交付项目工时台账" [--apply]
 *   不带 --apply 时为只读预演（DRY_RUN），不写库。
 */
import { prisma } from "@/lib/prisma";
import { COST_BASELINE_CONFIG_KEY, getComponentCostBaseline, validateCostBaseline } from "@/lib/component-cost-baseline";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "";
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if ("show" in args) {
    const current = await getComponentCostBaseline();
    console.log(JSON.stringify({ status: "SHOW", baseline: current }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const candidate = validateCostBaseline({
    personMonthYuan: Number(args.personMonthYuan),
    cloudHardwareRangeYuan: [Number(args.cloudMin), Number(args.cloudMax)],
    pmTestRatioPercent: Number(args.pmTestRatio),
    source: args.source ?? "",
    updatedAt: args.updatedAt && args.updatedAt.trim() ? args.updatedAt.trim() : new Date().toISOString(),
  });
  if (!candidate) {
    console.error(
      "BASELINE_INVALID: 参数非法。需要 --personMonthYuan >0、--cloudMin/--cloudMax 且 min<=max、--pmTestRatio 0~100、--source 非空。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  if (!("apply" in args)) {
    console.log(JSON.stringify({ status: "DRY_RUN", key: COST_BASELINE_CONFIG_KEY, baseline: candidate, wroteDatabase: false }, null, 2));
    await prisma.$disconnect();
    return;
  }

  await prisma.systemconfig.upsert({
    where: { key: COST_BASELINE_CONFIG_KEY },
    create: { key: COST_BASELINE_CONFIG_KEY, value: JSON.stringify(candidate) },
    update: { value: JSON.stringify(candidate) },
  });
  const after = await getComponentCostBaseline();
  console.log(JSON.stringify({ status: "UPDATED", key: COST_BASELINE_CONFIG_KEY, baseline: after, wroteDatabase: true }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("SET_COST_BASELINE_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
