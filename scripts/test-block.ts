import { SignJWT } from "jose";

// 纯 HTTP 验证：公开资料被分享（被其他功能使用）时，本人删除应被拦截。
const SECRET = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
const BASE = "http://localhost:3000/api/studio";
const T2 = "cmtee69280000prvn3ohjlxoy";
const WS_ID = "a4ce0e19-58e1-4e67-bdc7-43217b406269";
const DOC_A = "6296db18-f9b8-4494-a2bc-762a30c614f6";

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
  const token2 = await makeToken(T2);
  console.log("=== 场景：docA 有有效分享链接时，本人删除公开资料应被拦截 ===");
  const r1 = await api("get_asset_usage", token2, { workspaceId: WS_ID, documentId: DOC_A });
  console.log("usage:", JSON.stringify(r1.data.data));

  const r2 = await api("remove_asset", token2, {
    workspaceId: WS_ID,
    assetId: DOC_A,
    reasonCode: "OTHER",
    reasonDetail: "测试删除被引用资料",
  });
  console.log("remove_asset status:", r2.status);
  console.log("remove_asset data:", JSON.stringify(r2.data));
  const blocked = r2.status === 400 && /被其他功能使用/.test(r2.data.error || "");
  console.log(blocked ? "✓ 拦截生效：被引用公开资料无法删除" : "✗ 拦截未生效");
  process.exit(blocked ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
