const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("=== 正在全量核查数据库中的空间与已装配组件明细 ===");
  
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, type: true, ownerId: true }
  });
  
  for (const ws of workspaces) {
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId: ws.id },
      select: { componentId: true, metadata: true, usedAt: true }
    });

    const boundComps = [];
    usages.forEach(u => {
      if (!u.metadata) return;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
        if (meta && meta.enabled !== false) {
          boundComps.push(u.componentId);
        }
      } catch (e) {
        boundComps.push(u.componentId);
      }
    });

    console.log(`\n【工作空间】: ${ws.name} (ID: ${ws.id}, 类型: ${ws.type})`);
    console.log(`- 真实装配组件总数: ${boundComps.length} 个`);
    console.log(`- 具体装配组件列表: [${boundComps.join(", ")}]`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
