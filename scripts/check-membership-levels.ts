import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 检查数据库中的会员等级数据...\n");

  const levels = await prisma.membershiplevel.findMany({
    orderBy: { sortOrder: "asc" },
  });

  console.log(`📊 当前数据库中有 ${levels.length} 个会员等级:\n`);
  levels.forEach((level) => {
    console.log(`- ${level.name} (${level.nameZh})`);
    console.log(`  价格：月付 ¥${level.priceMonthly}, 年付 ¥${level.priceYearly}`);
    console.log(`  状态：${level.isActive ? "启用" : "停用"}`);
    console.log();
  });

  // 检查是否有错误的等级
  const incorrectLevels = levels.filter(
    (l) => !["FREE", "BRONZE", "SILVER", "GOLD", "DIAMOND", "CROWN"].includes(l.name),
  );

  if (incorrectLevels.length > 0) {
    console.log(`⚠️  发现 ${incorrectLevels.length} 个不正确的会员等级:`);
    incorrectLevels.forEach((l) => {
      console.log(`  - ${l.name} (${l.nameZh})`);
    });
    console.log("\n💡 建议删除这些不正确的等级并重新插入正确的 6 个等级\n");
  } else {
    console.log("✅ 会员等级数据正确\n");
  }

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
