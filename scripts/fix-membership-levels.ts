import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  删除错误的会员等级...\n");

  // 删除 PRO 和 ENTERPRISE
  const toDelete = ["PRO", "ENTERPRISE"];

  for (const name of toDelete) {
    try {
      await prisma.membershiplevel.delete({
        where: { name },
      });
      console.log(`✅ 已删除：${name}`);
    } catch (error) {
      console.error(`❌ 删除 ${name} 失败:`, error);
    }
  }

  console.log("\n✅ 清理完成！\n");

  // 显示剩余的等级
  const levels = await prisma.membershiplevel.findMany({
    orderBy: { sortOrder: "asc" },
  });

  console.log(`📊 当前数据库中有 ${levels.length} 个会员等级:\n`);
  levels.forEach((level) => {
    console.log(`- ${level.name} (${level.nameZh})`);
  });

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
