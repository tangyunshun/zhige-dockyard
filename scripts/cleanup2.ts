import { prisma } from "../src/lib/prisma";

// 清理拦截测试数据：删除测试资料、其分享链接与残留的删除申请记录。MySQL 多连接，可与 dev server 并存。
const DOC_A = "test-del-docA-001";
const DOC_B = "test-del-docB-001";

async function main() {
  await prisma.documentremoval.deleteMany({ where: { documentId: { in: [DOC_A, DOC_B] } } });
  await prisma.documentshare.deleteMany({ where: { documentId: DOC_A } });
  await prisma.document.deleteMany({ where: { id: { in: [DOC_A, DOC_B] } } });
  console.log("cleaned test docs + removal records");
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
