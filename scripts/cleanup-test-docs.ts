import { prisma } from "../src/lib/prisma";

// 复位测试文档：删除 attach 到测试资料的删除申请记录，并把资料A恢复为 active。
// 必须在 dev server 停止时单独运行（单 Prisma 进程，避免与 dev server 竞争 SQLite）。
const DOC_A = "6296db18-f9b8-4494-a2bc-762a30c614f6";
const DOC_B = "d7578613-a197-413b-ba4d-2e9928b1e99a";

async function main() {
  await prisma.documentremoval.deleteMany({ where: { documentId: { in: [DOC_A, DOC_B] } } });
  await prisma.document.update({ where: { id: DOC_A }, data: { status: "active" } });
  console.log("cleaned test docs (removal records removed, docA restored to active)");
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
