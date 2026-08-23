import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const wsIds = [
    { id: "ws-personal-1783232038008-z2o3jy", name: "个人空间(z2o3jy)" },
    { id: "ws-personal-1783252748700-9nn8g7", name: "个人空间(9nn8g7)" },
    { id: "ws_1783254751673_fwwpmbgg", name: "企业空间" },
  ];

  for (const ws of wsIds) {
    const rows = await prisma.componentusage.findMany({
      where: { workspaceId: ws.id },
      select: { componentId: true, metadata: true, usedAt: true },
      orderBy: { usedAt: "asc" },
    });
    console.log(`\n=== ${ws.name} (${ws.id}) ===`);
    rows.forEach((r) => {
      const meta = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
      console.log(`  ${r.componentId} | enabled=${meta?.enabled ?? "null"} | usedAt=${r.usedAt.toISOString()}`);
    });
  }

  // 所有 test-01 相关的个人空间（可能有多个）
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: "test-01" } }] },
    select: { id: true, name: true, email: true },
  });
  console.log("\ntest-01 用户:", JSON.stringify(users));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
