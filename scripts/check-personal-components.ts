import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const personalWs = await prisma.workspace.findFirst({
    where: { type: "PERSONAL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!personalWs) {
    console.log("未找到个人空间");
    return;
  }
  console.log("个人空间:", personalWs.id, personalWs.name);

  // componentusage 全量（按组件聚合）
  const usages = await prisma.componentusage.findMany({
    where: { workspaceId: personalWs.id },
    select: { id: true, componentId: true, userId: true, usedAt: true, metadata: true },
    orderBy: { usedAt: "asc" },
  });

  console.log(`\ncomponentusage 记录总数: ${usages.length}`);
  const agg = new Map<string, { count: number; enabled: string; sample: string }>();
  usages.forEach((u) => {
    let enabled: string = "null";
    try {
      const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
      enabled = meta && typeof meta.enabled === "boolean" ? String(meta.enabled) : "无enabled";
    } catch { enabled = "解析失败"; }
    const key = u.componentId;
    if (!agg.has(key)) agg.set(key, { count: 0, enabled, sample: JSON.stringify(u.metadata) });
    const e = agg.get(key)!;
    e.count += 1;
  });
  agg.forEach((v, k) => console.log(`  - ${k} | 记录${v.count}条 | enabled=${v.enabled} | metadata=${v.sample.slice(0, 100)}`));

  // 与 getBoundComponentCount 一致的口径
  let bound = 0;
  const seen = new Set<string>();
  usages.forEach((u) => {
    if (!u.metadata) return;
    try {
      const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
      if (meta && typeof meta.enabled === "boolean") {
        if (!seen.has(u.componentId)) { seen.add(u.componentId); bound++; }
      }
    } catch {
      if (!seen.has(u.componentId)) { seen.add(u.componentId); bound++; }
    }
  });
  console.log(`\n按 enabled 口径统计的装配组件数: ${bound}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
