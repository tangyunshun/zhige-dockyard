import { prisma } from "../src/lib/prisma";

// 删除测试资料 docA 的全部分享链接，解除“被其他功能使用”状态。
// 必须在 dev server 停止时单独运行（单 Prisma 进程，避免与 dev server 竞争 SQLite）。
const DOC_A = "6296db18-f9b8-4494-a2bc-762a30c614f6";

async function main() {
  const d = await prisma.documentshare.deleteMany({ where: { documentId: DOC_A } });
  console.log("deleted shares:", d.count);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
