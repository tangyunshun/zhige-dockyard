/**
 * 一次性脚本：清理历史上误迁移到系统帮助文档表（systemdocument）的两条组件业务数据。
 *
 * 运行：npx tsx scripts/cleanup-migrated-docs.ts
 *
 * 说明：这两条记录此前由 src/app/api/documents/list/route.ts 与
 * src/app/api/admin/documents/route.ts 的 GET 分支每次访问时执行 deleteMany 清理；
 * 现移除接口内的写操作，改为由本脚本一次性安全删除，既保留清理效果，又消除 GET 接口产生写操作的安全隐患。
 * 脚本为幂等：记录不存在时跳过，打印结果后退出。
 */
import { prisma } from "../src/lib/prisma";

const STRAY_IDS = ["doc_mig_1792267375767_7", "doc_mig_1792267375780_9"];

async function main() {
  console.log("🔍 开始核查历史误迁移系统文档记录...");

  for (const id of STRAY_IDS) {
    const existing = await prisma.systemdocument.findUnique({ where: { id } });
    if (!existing) {
      console.log(`✓ [${id}] 不存在，已跳过（幂等）`);
      continue;
    }
    console.log(`⚠️ [${id}] 命中记录：title="${existing.title}" category="${existing.category}"`);
    await prisma.systemdocument.delete({ where: { id } });
    console.log(`🗑️ [${id}] 已删除`);
  }

  const remaining = await prisma.systemdocument.findMany({
    where: { id: { in: STRAY_IDS } },
    select: { id: true },
  });
  console.log(
    remaining.length === 0
      ? "🎉 全部误迁移记录已清理完毕。"
      : `⚠️ 仍有残留：${remaining.map((r) => r.id).join(", ")}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("❌ 清理脚本执行失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
