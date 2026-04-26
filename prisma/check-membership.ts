import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('检查会员等级数据...');
  
  try {
    const levels = await prisma.membershipLevel.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    
    console.log(`找到 ${levels.length} 个会员等级:`);
    levels.forEach(level => {
      console.log(`- ${level.nameZh} (${level.name}): ${level.description}`);
    });
  } catch (error: any) {
    console.error('查询失败:', error.message);
    console.error('完整错误:', error);
  }
  
  await prisma.$disconnect();
}

main();
