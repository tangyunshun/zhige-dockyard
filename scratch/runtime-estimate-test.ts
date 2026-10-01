/** 【审核测试行为】运行时实测估价接口（真实 HTTP）：签发测试 JWT + 请求 C01/C02/C07 */
import { loadCliEnv } from "../scripts/cli-env";
loadCliEnv();
import { SignJWT } from "jose";

const USER_ID = "cmtd04l660000y2miz6av52qn";
const WS_ID = "ws-enterprise-1787927954618-9arzol";

async function main() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const token = await new SignJWT({ userId: USER_ID, issuedAt: new Date().toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret);

  for (const cid of ["C01", "C02", "C07"]) {
    const res = await fetch(`http://127.0.0.1:3000/api/billing/estimate?componentId=${cid}&workspaceId=${WS_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    console.log(JSON.stringify({ componentId: cid, http: res.status, success: body?.success, points: body?.data?.points ?? body?.points, estimateSource: body?.data?.snapshot?.estimateSource ?? body?.snapshot?.estimateSource, minApplied: body?.data?.snapshot?.minPointsPerTaskApplied ?? body?.snapshot?.minPointsPerTaskApplied, billingBasis: body?.data?.basis ?? body?.basis, error: body?.error ?? null }));
  }
}
main().catch((e) => { console.error("FAIL:", e.message); process.exitCode = 1; });
