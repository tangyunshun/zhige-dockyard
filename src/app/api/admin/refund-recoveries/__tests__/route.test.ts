import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { consumePoints } from "@/lib/credit-service";
import { enqueueRefundRecovery } from "@/lib/refund-recovery";
import { GET, POST } from "../route";

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const B = (n: number): bigint => BigInt(n);

async function makeAdminToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

describe("管理员退款恢复接口真实 HTTP 级测试 (GET / POST)", { skip: !process.env.DATABASE_URL }, () => {
  test("未授权请求必须返回 401 或 403", async () => {
    // 1. 无认证头的 GET
    const getReq = new NextRequest("http://localhost:3000/api/admin/refund-recoveries");
    const getRes = await GET(getReq);
    assert.ok(getRes.status === 401 || getRes.status === 403, `未授权 GET 应返回 401/403，实际返回 ${getRes.status}`);

    // 2. 无认证头的 POST
    const postReq = new NextRequest("http://localhost:3000/api/admin/refund-recoveries", {
      method: "POST",
      body: JSON.stringify({ id: "some-id" }),
    });
    const postRes = await POST(postReq);
    assert.ok(postRes.status === 401 || postRes.status === 403, `未授权 POST 应返回 401/403，实际返回 ${postRes.status}`);
  });

  test("GET 接口安全序列化：HTTP 200 返回且 BigInt 字段安全转换为字符串 DTO", async () => {
    const adminId = "adm_u_" + randomUUID();
    const taskId = "adm_task_" + randomUUID();
    const wid = "adm_ws_" + randomUUID();
    let recoveryId = "";
    try {
      // 创建具有 SUPER_ADMIN 角色的平台管理员
      await prisma.user.create({
        data: {
          id: adminId,
          password: "x",
          role: "SUPER_ADMIN",
          status: "active",
        },
      });

      // 插入一条待退款记录，点数包含大数值
      const enqueueRes = await enqueueRefundRecovery({
        taskId,
        userId: adminId,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: {
          skipped: false,
          unlimited: false,
          consumed: 120,
          ledgerIds: ["mock_ledger_adm"],
          details: [{ ledgerId: "mock_ledger_adm", grantId: "g_adm", kind: "WALLET", scope: "WALLET", sourceType: "ONLINE", points: 120 }],
          balanceAfter: 80,
          monthlyTokenUsedIncremented: 0,
        },
        error: "SIMULATED_ADMIN_TEST_ERROR",
      });
      assert.equal(enqueueRes.ok, true);

      const token = await makeAdminToken(adminId);
      const req = new NextRequest(`http://localhost:3000/api/admin/refund-recoveries?status=PENDING&page=1&limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await GET(req);
      assert.equal(res.status, 200, "授权管理员 GET 查询应返回 HTTP 200");

      // 验证 response.json() 能够正常反序列化（无 BigInt 抛错）
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data?.records), "data.records 必须为数组");

      const target = body.data.records.find((r: any) => r.taskId === taskId);
      assert.ok(target, "返回列表中必须包含刚创建的待退款记录");
      recoveryId = target.id;

      // 验证 BigInt 字段全部安全转为 string
      assert.equal(typeof target.points, "string");
      assert.equal(target.points, "120");
      assert.equal(typeof target.monthlyUsedRollback, "string");
      assert.equal(target.monthlyUsedRollback, "0");

      // 验证 DTO 字段完整性
      assert.equal(target.status, "PENDING");
      assert.equal(typeof target.retryCount, "number");
      assert.equal(typeof target.createdAt, "string");
      assert.equal(typeof target.updatedAt, "string");
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
    }
  });

  test("POST 接口重试及幂等性：重试成功返回 HTTP 200，第二次重试 refunded=0", async () => {
    const adminId = "adm_u_post_" + randomUUID();
    const uid = "usr_u_post_" + randomUUID();
    const wid = "adm_ws_post_" + randomUUID();
    const qid = "adm_q_post_" + randomUUID();
    const memberId = "adm_mem_post_" + randomUUID();
    const taskId = "adm_task_post_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      // 1. 创建超管用户和普通用户
      await prisma.user.create({
        data: { id: adminId, password: "x", role: "SUPER_ADMIN", status: "active" },
      });
      await prisma.user.create({
        data: { id: uid, password: "x", role: "USER", status: "active" },
      });
      await prisma.workspace.create({
        data: { id: wid, name: "adm_post_ws", type: "ENTERPRISE", ownerId: uid, updatedAt: now },
      });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(0), tokenBalance: B(100) },
      });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      // 2. 真实扣费 35 点
      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 35,
        componentId: "C07",
        componentName: "接口测试组件",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "adm_post_ws",
        idempotencyKey: `CONSUME:${taskId}`,
      });

      // 3. 记录待退款恢复
      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        componentId: "C07",
        componentName: "接口测试组件",
        workspaceType: "ENTERPRISE",
        workspaceName: "adm_post_ws",
        error: "SIMULATED_FAILURE_FOR_POST_TEST",
      });

      const listRes = await prisma.refundrecovery.findFirst({ where: { taskId } });
      assert.ok(listRes);
      recoveryId = listRes!.id;

      const token = await makeAdminToken(adminId);

      // 4. 第一次 POST 重试
      const postReq1 = new NextRequest("http://localhost:3000/api/admin/refund-recoveries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: recoveryId }),
      });

      const postRes1 = await POST(postReq1);
      assert.equal(postRes1.status, 200, "第一次重试必须返回 HTTP 200");
      const body1 = await postRes1.json();
      assert.equal(body1.success, true);
      assert.equal(body1.data.status, "SETTLED");
      assert.equal(body1.data.refunded, 35);

      // 5. 第二次 POST 重试（幂等校验）
      const postReq2 = new NextRequest("http://localhost:3000/api/admin/refund-recoveries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: recoveryId }),
      });

      const postRes2 = await POST(postReq2);
      assert.equal(postRes2.status, 200, "第二次重试必须返回 HTTP 200");
      const body2 = await postRes2.json();
      assert.equal(body2.success, true);
      assert.equal(body2.data.status, "SETTLED");
      assert.equal(body2.data.refunded, 0, "第二次重试退款点数必须为 0，杜绝重复到账");
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: [adminId, uid] } } }).catch(() => {});
    }
  });
});
