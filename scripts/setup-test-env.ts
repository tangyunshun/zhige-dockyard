import { prisma } from "../src/lib/prisma";
import crypto from "crypto";

// 在 ws-enterprise 空间搭建删除审核拦截测试数据：
//   - docA / docB 由 test-02 上传、visibility=PUBLIC、status=active
//   - 给 docA 创建一条有效分享链接（制造“被其他功能使用”场景）
// MySQL 多连接，可与运行中的 dev server 并存，无需停服。
const WS_ID = "ws-enterprise-1787927954618-9arzol";
const T2 = "cmtee69280000prvn3ohjlxoy";
const DOC_A = "test-del-docA-001";
const DOC_B = "test-del-docB-001";

async function main() {
  await prisma.document.deleteMany({ where: { id: { in: [DOC_A, DOC_B] } } });
  await prisma.documentshare.deleteMany({ where: { documentId: DOC_A } });
  const now = new Date();
  await prisma.document.create({
    data: { id: DOC_A, workspaceId: WS_ID, title: "删除审核拦截测试资料A", content: "测试内容A", type: "doc", status: "active", uploaderId: T2, visibility: "PUBLIC", updatedAt: now },
  });
  await prisma.document.create({
    data: { id: DOC_B, workspaceId: WS_ID, title: "删除审核拦截测试资料B", content: "测试内容B", type: "doc", status: "active", uploaderId: T2, visibility: "PUBLIC", updatedAt: now },
  });
  await prisma.documentshare.create({
    data: { id: "share-test-001", documentId: DOC_A, workspaceId: WS_ID, token: crypto.randomBytes(16).toString("hex"), createdBy: T2 },
  });
  console.log("setup done:", DOC_A, DOC_B);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
