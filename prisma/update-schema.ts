import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("添加 isRecommended 和 isPopular 字段到数据库...");

  try {
    // 添加字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE MembershipLevel 
      ADD COLUMN isRecommended BOOLEAN DEFAULT FALSE NOT NULL,
      ADD COLUMN isPopular BOOLEAN DEFAULT FALSE NOT NULL
    `);
    console.log("✓ 字段添加成功");

    // 更新白银会员为推荐
    await prisma.$executeRawUnsafe(`
      UPDATE MembershipLevel SET isRecommended = TRUE WHERE name = 'SILVER'
    `);
    console.log("✓ 白银会员标记为推荐");

    // 更新黄金会员为热门
    await prisma.$executeRawUnsafe(`
      UPDATE MembershipLevel SET isPopular = TRUE WHERE name = 'GOLD'
    `);
    console.log("✓ 黄金会员标记为热门");

    // 验证数据
    const levels = await prisma.membershipLevel.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        name: true,
        nameZh: true,
        isRecommended: true,
        isPopular: true,
      },
    });

    console.log("\n会员等级数据:");
    levels.forEach((level) => {
      console.log(
        `- ${level.nameZh} (${level.name}): 推荐=${level.isRecommended}, 热门=${level.isPopular}`,
      );
    });
  } catch (error: any) {
    console.error("操作失败:", error.message);
    if (error.message.includes("Duplicate column name")) {
      console.log("字段可能已经存在，继续执行后续操作...");
    } else {
      throw error;
    }
  }

  await prisma.$disconnect();
}

main();
