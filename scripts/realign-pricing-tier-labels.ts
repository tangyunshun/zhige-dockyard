/**
 * 复杂度档位标签对齐（一次性，幂等）。
 *
 * 背景（严格审查发现）：售价归位脚本按「价格 ≥200 打 PREMIUM、≥100 打 HEAVY」打标，
 * 与后台面板四档建议售价（轻量 50 / 中量 100 / 重量 200 / 旗舰 300）错位：
 * 100 点组件被打成「重量级」（面板重量级建议 200 点），200 点被打成「旗舰级」（旗舰建议 300 点）。
 * 管理员在面板里看到的档位与库里标签矛盾，重新选档会意外改价。
 *
 * 对齐规则（按价格就近归档）：≥250 旗舰 / ≥150 重量 / ≥75 中量 / 其余轻量。
 * 仅修正标签 pricingComplexity，绝不改售价。
 *
 * 用法：npx tsx scripts/realign-pricing-tier-labels.ts
 */
import { prisma } from "../src/lib/prisma";

function tierOf(price: number): "PREMIUM" | "HEAVY" | "MEDIUM" | "LIGHT" {
  if (price >= 250) return "PREMIUM";
  if (price >= 150) return "HEAVY";
  if (price >= 75) return "MEDIUM";
  return "LIGHT";
}

(async () => {
  const comps = await prisma.componentcatalog.findMany({
    select: { id: true, name: true, estimatedModelTokens: true, pricingComplexity: true },
    orderBy: { id: "asc" },
  });

  let fixed = 0;
  for (const c of comps) {
    const expected = tierOf(c.estimatedModelTokens);
    if (c.pricingComplexity !== expected) {
      await prisma.componentcatalog.update({
        where: { id: c.id },
        data: { pricingComplexity: expected },
      });
      fixed += 1;
      console.log(`  ~ ${c.id} ${c.name}：${c.pricingComplexity ?? "（空）"} → ${expected}（售价 ${c.estimatedModelTokens} 点）`);
    }
  }
  console.log(`\n标签对齐完成：修正 ${fixed} 个，其余 ${comps.length - fixed} 个本就一致`);

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("对齐失败:", String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
