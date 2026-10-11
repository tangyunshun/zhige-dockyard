/**
 * 加价率口径纠偏（问题3）：将旧版「乘数 *10000」存储（如 20000 = 误显 200%）规范为
 * 真正基点口径 2000 bps（= 20% 加价，售价 = 成本 × 1.20）。
 * 同时把主表 / 时段价的 markupRateBps 一并归一，保证估价与结算口径一致。
 *
 * 先用无参运行查看当前分布；确认后加 --apply 执行归一（统一为 2000 bps）。
 */
import { prisma } from "@/lib/prisma";

const CANONICAL_BPS = 2000; // 20%

async function distinctBps(table: "modelpricing" | "modelpricingperiod") {
  const rows = await (prisma as any)[table].groupBy({ by: ["markupRateBps"], _count: true });
  return rows as { markupRateBps: number; _count: number }[];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const cfg = await prisma.systemconfig.findUnique({ where: { key: "billing.markupCoefficientBps" } });
  const pricing = await distinctBps("modelpricing");
  const period = await distinctBps("modelpricingperiod");
  console.log("当前 billing.markupCoefficientBps =", cfg?.value ?? "(空)");
  console.log("modelpricing.markupRateBps 分布 =", JSON.stringify(pricing));
  console.log("modelpricingperiod.markupRateBps 分布 =", JSON.stringify(period));

  if (!apply) {
    console.log(`[DRY-RUN] 将统一归一为 ${CANONICAL_BPS} bps（= 20%）。加 --apply 执行。`);
    return;
  }
  await prisma.systemconfig.upsert({
    where: { key: "billing.markupCoefficientBps" },
    create: { key: "billing.markupCoefficientBps", value: String(CANONICAL_BPS) },
    update: { value: String(CANONICAL_BPS) },
  });
  const [m, p] = await prisma.$transaction([
    prisma.modelpricing.updateMany({ data: { markupRateBps: CANONICAL_BPS } }),
    prisma.modelpricingperiod.updateMany({ data: { markupRateBps: CANONICAL_BPS } }),
  ]);
  console.log(`[APPLY] systemconfig=2000；modelpricing 更新 ${m.count} 行；modelpricingperiod 更新 ${p.count} 行。`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
