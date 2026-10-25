/**
 * 一次性清理管理员授权映射（PLATFORM_ADMIN_PERMISSIONS）：
 *  1. 剔除各管理员权限包中已不在权限目录的失效 key（目录删键后的残留，会让“已分配 N 项”虚高）；
 *  2. 删除对应用户已不存在的孤儿条目（用户被删/降级后遗留的映射，纯污染数据）。
 * 幂等可重复执行。
 */
import { prisma } from "../src/lib/prisma";

const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
const MAPPING_KEY = "PLATFORM_ADMIN_PERMISSIONS";

(async () => {
  const catalogRow = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
  const catalog = JSON.parse(catalogRow?.value || "[]");
  const validKeys = new Set<string>();
  catalog.forEach((g: any) => (g.keys || []).forEach((k: any) => validKeys.add(k.key)));

  const mapRow = await prisma.systemconfig.findUnique({ where: { key: MAPPING_KEY } });
  const mapping: Record<string, string[]> = mapRow?.value ? JSON.parse(mapRow.value) : {};

  const userIds = Object.keys(mapping);
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, role: true },
  });
  const existingIds = new Set(existingUsers.map((u) => u.id));
  const emailById = new Map(existingUsers.map((u) => [u.id, u.email]));

  let removedOrphans = 0;
  let cleanedKeys = 0;
  const nextMapping: Record<string, string[]> = {};

  for (const [uid, keys] of Object.entries(mapping)) {
    if (!existingIds.has(uid)) {
      console.log(`删除孤儿映射条目：${uid}（用户不存在，原 ${(keys as string[]).length} 项）`);
      removedOrphans++;
      continue;
    }
    const arr = Array.isArray(keys) ? (keys as string[]) : [];
    const cleaned = arr.filter((k) => validKeys.has(k));
    const dropped = arr.length - cleaned.length;
    if (dropped > 0) {
      console.log(`剔除失效键：${emailById.get(uid) || uid} 移除 ${dropped} 项（${arr.filter((k) => !validKeys.has(k)).join(", ")}）`);
      cleanedKeys += dropped;
    }
    if (cleaned.length > 0) {
      nextMapping[uid] = cleaned;
    }
  }

  await prisma.systemconfig.upsert({
    where: { key: MAPPING_KEY },
    create: { key: MAPPING_KEY, value: JSON.stringify(nextMapping) },
    update: { value: JSON.stringify(nextMapping) },
  });

  console.log(`\n完成：剔除失效键 ${cleanedKeys} 个，删除孤儿条目 ${removedOrphans} 个，剩余有效授权 ${Object.keys(nextMapping).length} 位管理员`);
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(String(e).slice(0, 600));
  await prisma.$disconnect();
  process.exit(1);
});
