import { prisma } from "../src/lib/prisma";
import crypto from "crypto";

// 给测试资料 docA 插入一条有效分享链接，制造“被其他功能使用”的场景。
// 必须在 dev server 停止时单独运行（单 Prisma 进程，避免与 dev server 竞争 SQLite）。
const DOC_A = "6296db18-f9b8-4494-a2bc-762a30c614f6";
const WS_ID = "a4ce0e19-58e1-4e67-bdc7-43217b406269";
const T2 = "cmtee69280000prvn3ohjlxoy";

async function main() {
  const existing = await prisma.documentshare.findFirst({ where: { documentId: DOC_A, revokedAt: null } });
  if (existing) {
    console.log("share already exists:", existing.id);
    return;
  }
  const share = await prisma.documentshare.create({
    data: {
      id: `share_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      documentId: DOC_A,
      workspaceId: WS_ID,
      token: crypto.randomBytes(16).toString("hex"),
      createdBy: T2,
    },
  });
  console.log("created share:", share.id);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
