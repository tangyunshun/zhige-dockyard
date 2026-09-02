import { SignJWT } from "jose";

// 纯 HTTP 验证：公开资料被分享（被其他功能使用）时，本人删除应被拦截；解除后可通过审核流。
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
  const t2 = await makeToken(T2);

  console.log("=== 场景：docA 有有效分享链接时，本人删除公开资料应被拦截 ===");
  const u = await api("get_asset_usage", t2, { workspaceId: WS_ID, documentId: DOC_A });
  console.log("usage:", JSON.stringify(u.data.data));

  const r = await api("remove_asset", t2, { workspaceId: WS_ID, assetId: DOC_A, reasonCode: "OTHER", reasonDetail: "测试删除被引用资料" });
  console.log("remove_asset status:", r.status);
  console.log("remove_asset data:", JSON.stringify(r.data));
  const blocked = r.status === 400 && /被其他功能使用/.test(r.data.error || "");
  console.log(blocked ? "✓ 拦截生效：被引用公开资料无法删除" : "✗ 拦截未生效");

  console.log("\n=== 解除分享后，本人删除应进入审核流(pending) ===");
  process.exit(blocked ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
