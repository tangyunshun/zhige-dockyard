// 通过真实装配 API 将 C01/C02/C07 绑定到授权的 test-01 工作空间（测试环境设置，非生产改动）。
import fs from "fs";
import path from "path";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const workspaceId = process.env.WORKSPACE_ID || "";
const statePath = path.join(process.cwd(), ".codebuddy", "browser-storage-state.json");
const cookieVal = (JSON.parse(fs.readFileSync(statePath, "utf-8")).cookies || [])[0]?.value || "";

async function main() {
  if (!workspaceId || !cookieVal) {
    console.error("MISSING workspaceId or storage state");
    process.exit(2);
  }
  for (const cid of ["C01", "C02", "C07"]) {
    const res = await fetch(`${BASE}/api/studio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieVal}` },
      body: JSON.stringify({ action: "bind", componentId: cid, workspaceId }),
    });
    const data: any = await res.json().catch(() => ({}));
    console.log(`${cid} -> http=${res.status} success=${data.success} msg=${data.message || ""}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
