import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ent = await prisma.workspace.findFirst({
    where: { type: "ENTERPRISE" },
    select: { id: true, name: true },
  });
  if (!ent) {
    console.log("未找到企业空间");
    return;
  }
  const usages = await prisma.componentusage.findMany({
    where: { workspaceId: ent.id },
    select: { componentId: true, metadata: true },
  });
  const set = new Set<string>();
  usages.forEach((u) => {
    if (!u.metadata) return;
    try {
      const m = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
      if (m && typeof m.enabled === "boolean") set.add(u.componentId);
    } catch {
      set.add(u.componentId);
    }
  });
  console.log("企业空间:", ent.name);
  console.log("componentusage 总数:", usages.length, "| 装配组件数:", set.size);
  console.log("组件:", Array.from(set).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
