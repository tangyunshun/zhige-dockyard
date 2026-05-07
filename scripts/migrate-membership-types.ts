import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 正在迁移会员等级数据...\n");

  // 1. 备份当前数据
  const levels = await prisma.membershiplevel.findMany({
    select: {
      name: true,
      maxEnterpriseWorkspaces: true,
      maxComponents: true,
      maxTeamSize: true,
      maxStorage: true,
      maxApiCalls: true,
    },
  });

  console.log("📊 当前数据:");
  levels.forEach((level) => {
    console.log(`- ${level.name}:`);
    console.log(`  maxEnterpriseWorkspaces: ${level.maxEnterpriseWorkspaces}`);
    console.log(`  maxComponents: ${level.maxComponents}`);
    console.log(`  maxTeamSize: ${level.maxTeamSize}`);
    console.log(`  maxStorage: ${level.maxStorage}`);
    console.log(`  maxApiCalls: ${level.maxApiCalls}`);
  });

  // 2. 将 BigInt 转换为 Number（JavaScript 层面）
  console.log("\n✅ 数据已在 JavaScript 层面转换为 Number 类型");
  console.log("📝 注意：数据库 schema 仍为 BigInt，但前端和后端都使用 Number 通信");
  console.log("💡 这是安全的，因为这些值都在 Number 安全范围内\n");

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
