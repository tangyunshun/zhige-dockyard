import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
const USER_ID = "cmr7qn72l0003uuhb42pzscva"; // test-01

async function main() {
  const token = await new SignJWT({ userId: USER_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);

  const base = "http://localhost:3000";
  const tests = [
    ["个人空间 9nn8g7", "ws-personal-1783252748700-9nn8g7"],
    ["个人空间 z2o3jy", "ws-personal-1783232038008-z2o3jy"],
    ["企业空间", "ws_1783254751673_fwwpmbgg"],
  ];

  for (const [name, wsId] of tests) {
    const r = await fetch(`${base}/api/studio?action=bound&workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.text();
    let d: any = null;
    try { d = JSON.parse(body); } catch { /* ignore */ }
    const ids = Array.isArray(d?.data) ? d.data : (d?.error || body.slice(0, 80));
    console.log(`[bound ${name}] HTTP ${r.status} | ${Array.isArray(ids) ? ids.length + " 个: " + ids.join(", ") : ids}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
