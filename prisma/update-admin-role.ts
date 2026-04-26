import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("更新管理员用户角色...");

  // 更新 admin 用户的角色为 'admin'
  const adminUserId = "ef92998b-40d4-11f1-8f58-6c24082b0409";
  const updated = await prisma.user.update({
    where: { id: adminUserId },
    data: { role: "admin" },
  });

  console.log(`✓ 已更新用户 ${updated.name} 的角色为：${updated.role}`);

  // 验证更新
  const user = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  console.log("\n管理员用户信息:");
  console.log(`- 名称：${user?.name}`);
  console.log(`- ID: ${user?.id}`);
  console.log(`- 角色：${user?.role}`);
  console.log(`- 状态：${user?.status}`);
  console.log(
    `- 是否管理员：${["admin", "super_admin", "superadmin", "ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(user?.role || "")}`,
  );

  await prisma.$disconnect();
}

main();
