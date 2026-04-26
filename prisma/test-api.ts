import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('测试 API 数据查询...');
  
  const levels = await prisma.membershipLevel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  
  console.log(`\n找到 ${levels.length} 个会员等级:`);
  levels.forEach(level => {
    console.log(`\n${level.nameZh} (${level.name})`);
    console.log(`  - 图标：${level.icon || '无'}`);
    console.log(`  - 颜色：${level.color}`);
    console.log(`  - 描述：${level.description || '无'}`);
    console.log(`  - 推荐：${level.isRecommended}`);
    console.log(`  - 热门：${level.isPopular}`);
    console.log(`  - 月费：${level.priceMonthly / 100}元`);
    console.log(`  - 年费：${level.priceYearly / 100}元`);
  });
  
  await prisma.$disconnect();
}

main();
