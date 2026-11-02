import { PrismaClient } from "@prisma/client";
import { LEGAL_DOCUMENTS } from "../src/lib/legal-document-content";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始播种知阁·舟坊服务条款与隐私协议全量官方文档 (v2026.2 纯净紧凑高亮版)...");

  const now = new Date();

  // 法律全文单一副本：统一引用 src/lib/legal-document-content.ts（seed 与 API 自愈共用同一份正源）
  const docsToSeed = Object.entries(LEGAL_DOCUMENTS).map(([category, doc], idx) => ({
    id: doc.id,
    title: doc.title,
    category,
    content: doc.content,
    tags: doc.tags,
    isPublished: true,
    sortOrder: idx + 1,
  }));

  for (const item of docsToSeed) {
    const existing = await prisma.systemdocument.findFirst({
      where: { category: item.category },
    });

    if (existing) {
      await prisma.systemdocument.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          content: item.content,
          tags: item.tags,
          isPublished: true,
          updatedAt: now,
        },
      });
      console.log(`✓ 成功更新数据库 systemdocument 表中的文档 [${item.category}] (${item.title})`);
    } else {
      await prisma.systemdocument.create({
        data: {
          id: item.id,
          title: item.title,
          content: item.content,
          category: item.category,
          tags: item.tags,
          isPublished: true,
          sortOrder: item.sortOrder,
          viewCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
      console.log(`✓ 成功插入数据库 systemdocument 表新文档 [${item.category}] (${item.title})`);
    }
  }

  const count = await prisma.systemdocument.count();
  console.log(`🎉 数据库 systemdocument 播种完成，当前共有 ${count} 条系统官方法律文档！\n`);
}

main()
  .catch((e) => {
    console.error("❌ seed-system-documents 执行失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
