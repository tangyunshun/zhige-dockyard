/**
 * 组件售价乱价归位（幂等，可重复执行；支持空跑预览）。
 *
 * 背景（定价审核）：60 个组件售价从 27 点到 6609 点相差 244 倍——C01 卖 ¥41.48/次、
 * C02 卖 ¥66.09/次、C07 卖 ¥26.84/次（离谱高价），同时一批组件仅 27 点（¥0.27，客单价过低）。
 *
 * 归位策略（最小干预，不重排中间价位）：
 *  - 截顶：现价 > 300 点 → 200 点（¥2.00/次），仅打击三个离谱高价组件；
 *  - 提底：现价 < 50 点 → 50 点（¥0.50/次），把六个 27 点组件提到合理客单价；
 *  - 其余 51 个组件（50~300 点）原价保留，尊重历史定价意图。
 * 处理后全站价格带 50~300 点（价差从 244 倍压缩到 6 倍），毛利率 78%~95%。
 * 档位标签按归位后价格写回 pricingComplexity，与后台面板「业务复杂度」下拉口径一致。
 *
 * 红线自检：新价位必须 ≥ 成本底线，否则跳过并报告（绝不产生亏本定价）。
 *
 * 用法：
 *   npx tsx scripts/normalize-component-prices.ts          # 正式写入
 *   DRY_RUN=1 npx tsx scripts/normalize-component-prices.ts # 只预览不写入
 */
import { prisma } from "../src/lib/prisma";

const CAP_ABOVE = 300; // 高于此价的一律截到 CAP_TO
const CAP_TO = 200;
const RAISE_BELOW = 50; // 低于此价的一律提到 RAISE_TO
const RAISE_TO = 50;

/** 按归位后价格打档位标签（与后台复杂度下拉联动） */
function tierOf(price: number): "PREMIUM" | "HEAVY" | "MEDIUM" | "LIGHT" {
  if (price >= 200) return "PREMIUM";
  if (price >= 100) return "HEAVY";
  if (price >= 50) return "MEDIUM";
  return "LIGHT";
}

(async () => {
  const dryRun = process.env.DRY_RUN === "1";
  const comps = await prisma.componentcatalog.findMany({
    select: {
      id: true,
      name: true,
      estimatedModelTokens: true,
      costFloorPoints: true,
    },
    orderBy: { id: "asc" },
  });

  let changed = 0;
  let blocked = 0;
  const lines: string[] = [];

  for (const c of comps) {
    const from = c.estimatedModelTokens;
    let to = from;
    if (from > CAP_ABOVE) to = CAP_TO;
    else if (from < RAISE_BELOW) to = RAISE_TO;
    if (to === from) continue;

    const floor = c.costFloorPoints ?? 0;
    if (floor > 0 && to < floor) {
      blocked += 1;
      console.log(`  ⚠ ${c.id} ${c.name}：目标价 ${to} 低于底线 ${floor}，跳过（需管理员手动定价）`);
      continue;
    }
    const tier = tierOf(to);
    const margin = floor > 0 ? Math.round(((to - floor) / to) * 100) : null;
    lines.push(
      `  ${c.id} ${c.name}：${from} → ${to} 点（${from > CAP_ABOVE ? "截顶" : "提底"}，${tier}${margin != null ? `，毛利 ${margin}%` : ""}）`,
    );
    if (!dryRun) {
      await prisma.componentcatalog.update({
        where: { id: c.id },
        data: { estimatedModelTokens: to, pricingComplexity: tier },
      });
    }
    changed += 1;
  }

  console.log(`===== 售价归位${dryRun ? "（空跑预览，未写入）" : ""} =====`);
  lines.forEach((l) => console.log(l));
  console.log(`调整 ${changed} 个组件${blocked > 0 ? `，${blocked} 个因低于底线跳过` : ""}，其余 ${comps.length - changed - blocked} 个原价保留`);

  // 归位后价格带概览
  const after = dryRun
    ? comps.map((c) => (c.estimatedModelTokens > CAP_ABOVE ? CAP_TO : c.estimatedModelTokens < RAISE_BELOW ? RAISE_TO : c.estimatedModelTokens))
    : (await prisma.componentcatalog.findMany({ select: { estimatedModelTokens: true } })).map((c) => c.estimatedModelTokens);
  console.log(`归位后价格带：最低 ${Math.min(...after)} 点 ~ 最高 ${Math.max(...after)} 点（价差 ${(Math.max(...after) / Math.min(...after)).toFixed(1)} 倍）`);

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("归位失败:", String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
