import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== 正在只读检索用户表 ===");
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`用户表总数: ${allUsers.length} 条记录`);
  console.log("-----------------------------------------");
  for (const u of allUsers) {
    console.log(`[USER] id=${u.id} | name="${u.name}" | email="${u.email}" | role="${u.role}" | status="${u.status}"`);
  }
  console.log("-----------------------------------------");
}

main()
  .catch((e) => console.error("查询失败:", e))
  .finally(() => prisma.$disconnect());
