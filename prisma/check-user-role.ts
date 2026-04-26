import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('检查用户角色...');
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });
  
  console.log(`\n找到 ${users.length} 个用户:`);
  users.forEach(user => {
    console.log(`\n- ${user.name} (${user.email})`);
    console.log(`  - ID: ${user.id}`);
    console.log(`  - 角色：${user.role}`);
    console.log(`  - 状态：${user.status}`);
    console.log(`  - 是否管理员：${user.role === 'admin' || user.role === 'superadmin'}`);
  });
  
  await prisma.$disconnect();
}

main();
