/** 【授权写库】批次2试点充值：test01 企业空间 +500 点（=5 元授权上限），走 grantPoints 真实流水 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
import { grantPoints } from "../src/lib/credit-service";
loadCliEnv();
const USER_ID = "cmtd04l660000y2miz6av52qn";
const WS_ID = "ws-enterprise-1787927954618-9arzol";
async function main() {
  const r = await grantPoints({
    scope: "WORKSPACE",
    userId: USER_ID,
    workspaceId: WS_ID,
    points: 500,
    sourceType: "PILOT",
    type: "RECHARGE",
    title: "批次2押金结算试点充值（5元授权上限）",
    sourceId: "pilot-batch2",
    idempotencyKey: `PILOT_FUND:${WS_ID}:batch2`,
    remark: "BILLING-2-SETTLEMENT-PILOT 试点资金，负责人已授权（≤5 元）",
  });
  console.log("grant result:", JSON.stringify(r));
  const q = await prisma.workspacequota.findUnique({ where: { workspaceId: WS_ID }, select: { tokenBalance: true } });
  console.log("workspace tokenBalance:", q?.tokenBalance?.toString());
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
