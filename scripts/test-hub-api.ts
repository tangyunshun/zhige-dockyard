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

  // 完整 list 返回
  const r1 = await fetch(`${base}/api/workspace/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d1 = await r1.json().catch(() => null);
  console.log(`[workspace/list] HTTP ${r1.status} | workspaces: ${d1?.workspaces?.length ?? "?"}`);
  (d1?.workspaces || []).forEach((w: any) => {
    console.log(`  - ${w.id} | ${w.name} | ${w.type} | componentCount=${w.componentCount}`);
  });

  // dashboard 返回
  const r2 = await fetch(`${base}/api/user/workspace-hub/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d2 = await r2.json().catch(() => null);
  console.log(`\n[dashboard] HTTP ${r2.status}`);
  if (d2?.data?.personalWorkspace) {
    console.log(`  personalWorkspace: ${d2.data.personalWorkspace.id} | ${d2.data.personalWorkspace.name} | componentCount=${d2.data.personalWorkspace.componentCount}`);
  } else {
    console.log("  personalWorkspace: 无");
  }
  if (d2?.data?.enterpriseWorkspaces) {
    console.log(`  enterpriseWorkspaces: ${d2.data.enterpriseWorkspaces.length} 个`);
    d2.data.enterpriseWorkspaces.forEach((w: any) => console.log(`    - ${w.id} | ${w.name} | componentCount=${w.componentCount}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
