import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      ownerId: true,
      createdAt: true,
      _count: {
        select: {
          workspacemember: true,
          document: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("=== 所有工作空间清单 ===");
  for (const w of workspaces) {
    console.log(`ID: ${w.id} | 名称: ${w.name} | 类型: ${w.type} | 成员数: ${w._count.workspacemember} | 文档数: ${w._count.document}`);
  }

  const docs = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      workspaceId: true,
      filePath: true,
      type: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== 所有文档清单 (共 ${docs.length} 篇) ===`);
  for (const d of docs) {
    console.log(`[${d.workspaceId}] ${d.title} (type: ${d.type}, status: ${d.status}, path: ${d.filePath})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
