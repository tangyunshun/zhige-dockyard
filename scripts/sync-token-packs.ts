/**
 * 算力包档位同步（一次性，可重复执行）。
 *
 * 背景（定价审核）：原阶梯「500 点/¥6（¥0.012/点）」比下一档「1000 点/¥10（¥0.010/点）」
 * 还贵——入门档单价倒挂；且 1000 点到 10000 点之间没有中间档。
 *
 * 本脚本把线上库中的算力包同步为修正后的阶梯（与 DEFAULT_TOKEN_PACKS 一致）：
 *   500 点/¥5（0.010）→ 1000 点/¥9（0.009）→ 5000 点/¥40（0.008）
 *   → 10000 点/¥70（0.007）→ 50000 点/¥300（0.006），单价单调递减。
 * 仅更新预置包自身字段；管理员新建的自定义包不动；已被删除的预置包不补回。
 *
 * 用法：npx tsx scripts/sync-token-packs.ts
 */
import { prisma } from "../src/lib/prisma";
import { DEFAULT_TOKEN_PACKS } from "../src/lib/token-pack-service";

(async () => {
  const model = (prisma as any).tokenpack;
  if (!model) {
    console.error("未找到 tokenpack 模型，终止。");
    process.exit(1);
  }

  // 尊重管理员彻底删除的预置包
  const deletedRow = await prisma.systemconfig.findUnique({ where: { key: "deleted_token_pack_ids" } });
  let deletedIds = new Set<string>();
  if (deletedRow?.value) {
    try {
      const arr = JSON.parse(String(deletedRow.value));
      if (Array.isArray(arr)) deletedIds = new Set(arr.map(String));
    } catch {
      // 配置损坏时按空集合处理，不影响同步
    }
  }

  let created = 0;
  let updated = 0;
  for (const item of DEFAULT_TOKEN_PACKS) {
    if (deletedIds.has(item.id)) {
      console.log(`  - ${item.id} 已被管理员删除，跳过`);
      continue;
    }
    const existing = await model.findUnique({ where: { id: item.id } }).catch(() => null);
    if (!existing) {
      await model.create({
        data: {
          id: item.id,
          name: item.name,
          points: BigInt(item.points),
          price: item.price,
          icon: item.icon,
          color: item.color,
          description: item.description,
          isPopular: item.isPopular,
          isActive: item.isActive,
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
        },
      }).catch(() => null);
      created += 1;
      console.log(`  + 新建 ${item.id} ${item.name}：${item.points} 点/¥${item.price}`);
    } else {
      await model.update({
        where: { id: item.id },
        data: {
          name: item.name,
          points: BigInt(item.points),
          price: item.price,
          icon: item.icon,
          color: item.color,
          description: item.description,
          isPopular: item.isPopular,
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
        },
      }).catch(() => null);
      updated += 1;
      console.log(`  ~ 更新 ${item.id} ${item.name}：${item.points} 点/¥${item.price}`);
    }
  }

  const all = await model.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("\n===== 同步结果 =====");
  console.log(`新建 ${created} 个，更新 ${updated} 个`);
  all.forEach((p: any) => {
    const pts = Number(p.points);
    console.log(`  ${p.name}：${pts} 点 / ¥${p.price}（¥${(p.price / pts).toFixed(4)}/点）`);
  });

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("同步失败:", String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
