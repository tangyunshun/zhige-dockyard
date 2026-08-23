import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const personalWs = await prisma.workspace.findFirst({
    where: { type: "PERSONAL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!personalWs) return;
  console.log("个人空间:", personalWs.id);

  const [taskCount, completed, inProgress] = await Promise.all([
    prisma.componenttask.count({ where: { tenantId: personalWs.id } }),
    prisma.componenttask.count({ where: { tenantId: personalWs.id, status: "COMPLETED" } }),
    prisma.componenttask.count({ where: { tenantId: personalWs.id, status: "IN_PROGRESS" } }),
  ]);
  console.log(`componenttask 总数: ${taskCount} | COMPLETED: ${completed} | IN_PROGRESS: ${inProgress}`);

  // 按 type 分组看任务组件类型分布
  const grouped = await prisma.componenttask.groupBy({
    by: ["type"],
    where: { tenantId: personalWs.id },
    _count: { id: true },
  });
  console.log("按 type 分布:", JSON.stringify(grouped));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
