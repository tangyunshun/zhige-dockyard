import { SignJWT } from "jose";

// 纯 HTTP API 测试：脚本不连接数据库，所有写操作均由 dev server 进程执行，
// 避免两个 Prisma 进程竞争同一个 SQLite 文件导致 IDLE_TIMEOUT。
const SECRET = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
const BASE = "http://localhost:3000/api/studio";
const T1 = "cmtd04l660000y2miz6av52qn"; // test-01 (ADMIN/OWNER)
const T2 = "cmtee69280000prvn3ohjlxoy"; // test-02 (MEMBER，资料上传人)
const WS_ID = "a4ce0e19-58e1-4e67-bdc7-43217b406269";
const DOC_A = "6296db18-f9b8-4494-a2bc-762a30c614f6";
const DOC_B = "d7578613-a197-413b-ba4d-2e9928b1e99a";

function makeToken(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(SECRET);
}

async function api(action: string, token: string, body: any, method: "GET" | "POST" = "POST") {
  const headers: any = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let url = BASE;
  if (method === "GET") {
    url = `${BASE}?${new URLSearchParams({ action, ...(body || {}) })}`;
  }
  const res = await fetch(url, { method, headers, body: method === "POST" ? JSON.stringify({ action, ...body }) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

let pass = 0,
  fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

async function main() {
  const token1 = await makeToken(T1);
  const token2 = await makeToken(T2);
  console.log("tokens ready, ws", WS_ID);

  // 记录“本人红点”基线：此时 docA 仍是 active（无 PENDING/APPROVED 本人移除）
  const beforeCount = (await api("documents", token2, { workspaceId: WS_ID }, "GET")).data?.activeRemovalCount;

  console.log("\n[1] test-02 删除自己资料A（应走申请）");
  const r1 = await api("remove_asset", token2, { workspaceId: WS_ID, assetId: DOC_A, reasonCode: "OUTDATED", reasonDetail: "内容过时申请删除" });
  check("remove_asset 成功", r1.data.success === true, r1.data);
  check("返回 pending=true", r1.data.data?.pending === true, r1.data.data);

  console.log("\n[2] test-01 列出删除申请");
  const r2 = await api("list_deletion_requests", token1, { workspaceId: WS_ID });
  check("list_deletion_requests 成功", r2.data.success === true, r2.status);
  const req = (r2.data.data || []).find((x: any) => x.documentId === DOC_A);
  check("申请列表含资料A", !!req, r2.data.data);
  check("requesterName 含 test-02", req && /test-02/.test(req.requesterName || ""), req?.requesterName);

  console.log("\n[3] test-01 同意删除");
  const r3 = await api("approve_deletion", token1, { workspaceId: WS_ID, removalId: req?.id });
  check("approve_deletion 成功", r3.data.success === true, r3.data);

  console.log("\n[4] test-02 本人 documents：不显示红色标识/确认恢复");
  const r4 = await api("documents", token2, { workspaceId: WS_ID }, "GET");
  check("documents 成功", r4.data.success === true, r4.status);
  const itemA = (r4.data.data || []).find((x: any) => x.id === DOC_A);
  check("本人可见资料A(REMOVED)", itemA && itemA.status === "REMOVED", itemA?.status);
  check("removal.removedBy === test-02（本人删的）", itemA?.removal?.removedBy === T2, itemA?.removal?.removedBy);
  check("pendingRemoval 为 null（已审完）", itemA?.pendingRemoval == null, itemA?.pendingRemoval);
  // 核心：本人删除自己资料，即便被管理员同意移除，本人红点计数不应增加
  check("本人删除不增加本人红点(before==after)", r4.data.data?.activeRemovalCount === beforeCount, {
    before: beforeCount,
    after: r4.data.data?.activeRemovalCount,
  });

  console.log("\n[5] 权限校验");
  const r5 = await api("list_deletion_requests", token2, { workspaceId: WS_ID });
  check("普通成员列申请应 403", r5.status === 403, r5.status);
  const r6 = await api("approve_deletion", token2, { workspaceId: WS_ID, removalId: "x" });
  check("普通成员同意应 403", r6.status === 403, r6.status);

  console.log("\n[6] reject 流程（资料B）");
  const r7 = await api("remove_asset", token2, { workspaceId: WS_ID, assetId: DOC_B, reasonCode: "OTHER", reasonDetail: "测试驳回理由" });
  check("资料B删除申请 pending", r7.data.data?.pending === true, r7.data.data);
  const r2b = await api("list_deletion_requests", token1, { workspaceId: WS_ID });
  const reqB = (r2b.data.data || []).find((x: any) => x.documentId === DOC_B);
  const r8 = await api("reject_deletion", token1, { workspaceId: WS_ID, removalId: reqB?.id, rejectReason: "理由不充分，暂不同意" });
  check("reject_deletion 成功", r8.data.success === true, r8.data);
  const r9 = await api("documents", token2, { workspaceId: WS_ID }, "GET");
  const itemB = (r9.data.data || []).find((x: any) => x.id === DOC_B);
  check("驳回后本人资料B仍 active（未删）", itemB?.status === "active", itemB?.status);
  check("驳回后本人资料B pendingRemoval 为 null", itemB?.pendingRemoval == null, itemB?.pendingRemoval);

  console.log(`\n==== 结果：PASS ${pass} / FAIL ${fail} ====`);
  console.log("提示：本测试已将资料A置为REMOVED并留下APPROVED审批记录、资料B留下REJECTED记录，均为测试文档，可手动复原。");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
