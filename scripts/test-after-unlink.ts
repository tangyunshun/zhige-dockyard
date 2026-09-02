import { prisma } from "../src/lib/prisma";
import { SignJWT } from "jose";

// 验证闭环：解除公开资料的分享链接后，本人删除应能通过前置校验并进入管理员审核流(pending)。
const SECRET = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
const BASE = "http://localhost:3000/api/studio";
const T2 = "cmtee69280000prvn3ohjlxoy";
const WS_ID = "ws-enterprise-1787927954618-9arzol";
const DOC_A = "test-del-docA-001";

function makeToken(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(SECRET);
}
async function api(action: string, token: string, body: any) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  // 解除（撤销）docA 的所有分享链接
  await prisma.documentshare.deleteMany({ where: { documentId: DOC_A } });
  console.log("已解除 docA 的全部分享链接");

  const t2 = await makeToken(T2);
  const r = await api("remove_asset", t2, { workspaceId: WS_ID, assetId: DOC_A, reasonCode: "OTHER", reasonDetail: "解除分享后提交删除" });
  console.log("after unlink status:", r.status);
  console.log("after unlink data:", JSON.stringify(r.data));
  const ok = r.data?.success === true && r.data?.data?.pending === true;
  console.log(ok ? "✓ 解除分享后，本人删除进入审核流（pending=true）" : "✗ 解除后仍未通过");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
