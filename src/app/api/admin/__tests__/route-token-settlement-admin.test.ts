import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { setExplicitTestJwtSecret } from "@/lib/jwt-config";
import { grantPoints, getBalanceSummary } from "@/lib/credit-service";
import {
  consumeAndCreateSettlementHold,
  enqueueSettlementRecovery,
} from "@/lib/token-settlement-service";
import {
  type DeploymentPricing,
  buildRegistryPricingSnapshot,
} from "@/lib/model-pricing";
import { GET as listHandler, DELETE as deleteHandler } from "../token-settlements/route";
import { POST as resolveHandler } from "../token-settlements/[taskId]/resolve/route";
import { POST as cronRecoveryHandler } from "@/app/api/cron/token-settlement-recovery/route";

const TEST_SECRET = "zhige-super-admin-test-secret-key-at-least-32-chars!";
const JWT_KEY = new TextEncoder().encode(TEST_SECRET);

const dummyPricing: DeploymentPricing = {
  currency: "CNY",
  costInputMicrosPerMillion: 5_000_000,
  costOutputMicrosPerMillion: 30_000_000,
  costCacheReadMicrosPerMillion: null,
  costCacheWriteMicrosPerMillion: null,
  priceInputMicrosPerMillion: 10_000_000,
  priceOutputMicrosPerMillion: 60_000_000,
  priceCacheReadMicrosPerMillion: null,
  priceCacheWriteMicrosPerMillion: null,
  priceSource: "VERIFIED",
  priceStatus: "VERIFIED",
  markupRateBps: null,
  priceVersion: 1,
  effectiveFrom: new Date().toISOString(),
};
const dummySnapshot = buildRegistryPricingSnapshot({
  providerId: "MagicAI",
  modelId: "gpt-5.5",
  pricing: dummyPricing,
});

describe("管理员 Token 结算单查询与人工复核路由端点测试", () => {
  const adminUserId = `admin-test-${Date.now()}`;
  const regularUserId = `regular-user-${Date.now()}`;
  const testUserId = `test-user-${Date.now()}`;
  const testWorkspaceId = `test-ws-${Date.now()}`;

  let adminToken: string;
  let regularToken: string;

  before(async () => {
    setExplicitTestJwtSecret(TEST_SECRET);

    // 1. 创建测试超级管理员用户
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: `admin_${Date.now()}@zhige.test`,
        name: "Admin Tester",
        role: "SUPER_ADMIN",
        status: "active",
        password: "hash",
      },
    });

    // 2. 创建普通用户（无管理权限）
    await prisma.user.create({
      data: {
        id: regularUserId,
        email: `regular_${Date.now()}@zhige.test`,
        name: "Regular User",
        role: "USER",
        status: "active",
        password: "hash",
      },
    });

    // 3. 创建被结算的业务用户与钱包
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `target_${Date.now()}@zhige.test`,
        name: "Target User",
        role: "USER",
        status: "active",
        password: "hash",
      },
    });

    await prisma.userwallet.create({
      data: {
        id: randomUUID(),
        userId: testUserId,
        balance: BigInt(200),
      },
    });

    const now = new Date();
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: "Test Settlement Workspace",
        type: "PERSONAL",
        ownerId: testUserId,
        updatedAt: now,
      },
    });

    await prisma.workspacequota.create({
      data: {
        id: `quota-${randomUUID()}`,
        workspaceId: testWorkspaceId,
        membershipLevelId: "FREE",
        tokenBalance: BigInt(0),
        updatedAt: now,
      },
    });

    await prisma.workspacemember.create({
      data: {
        id: randomUUID(),
        workspaceId: testWorkspaceId,
        userId: testUserId,
        role: "OWNER",
        tokenBalance: BigInt(0),
      },
    });

    // 签发测试 JWT
    adminToken = await new SignJWT({ userId: adminUserId, role: "SUPER_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_KEY);

    regularToken = await new SignJWT({ userId: regularUserId, role: "USER" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_KEY);
  });

  after(async () => {
    setExplicitTestJwtSecret(null);
    const userIds = [adminUserId, regularUserId, testUserId];
    await prisma.$executeRawUnsafe(
      `DELETE FROM \`tokensettlementrecovery\` WHERE \`userId\` IN ('${userIds.join("','")}')`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM \`tokensettlementhold\` WHERE \`userId\` IN ('${userIds.join("','")}')`
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM \`tokensettlement\` WHERE \`userId\` IN ('${userIds.join("','")}')`
    );
    await prisma.pointledger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointgrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.userwallet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspace.deleteMany({ where: { id: testWorkspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  test("1. 未授权或普通用户调用人工复核端点返回 403 权限拒绝", async () => {
    const fakeTaskId = `task-auth-${Date.now()}`;

    // 1.1 无 token 请求
    const unauthReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${fakeTaskId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RELEASE" }),
    });
    const unauthRes = await resolveHandler(unauthReq, { params: Promise.resolve({ taskId: fakeTaskId }) });
    assert.equal(unauthRes.status, 401);

    // 1.2 普通非管理员用户请求
    const forbiddenReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${fakeTaskId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${regularToken}`,
      },
      body: JSON.stringify({ action: "RELEASE" }),
    });
    const forbiddenRes = await resolveHandler(forbiddenReq, { params: Promise.resolve({ taskId: fakeTaskId }) });
    assert.equal(forbiddenRes.status, 403);
  });

  test("2. 请求参数无效或结算单未处于 REQUIRES_REVIEW 状态时返回 400", async () => {
    const taskIdBadParam = `task-bad-param-${Date.now()}`;

    // 2.1 action 非法
    const badActionReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdBadParam}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "UNKNOWN_ACTION", auditRemark: "备注" }),
    });
    const badActionRes = await resolveHandler(badActionReq, { params: Promise.resolve({ taskId: taskIdBadParam }) });
    assert.equal(badActionRes.status, 400);

    // 2.2 actualPoints 负数
    const badPointsReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdBadParam}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "SETTLE", actualPoints: -5, auditRemark: "备注" }),
    });
    const badPointsRes = await resolveHandler(badPointsReq, { params: Promise.resolve({ taskId: taskIdBadParam }) });
    assert.equal(badPointsRes.status, 400);

    // 2.3 actualPoints 小数
    const decimalReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdBadParam}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "SETTLE", actualPoints: 10.5, auditRemark: "小数拒绝" }),
    });
    const decimalRes = await resolveHandler(decimalReq, { params: Promise.resolve({ taskId: taskIdBadParam }) });
    assert.equal(decimalRes.status, 400);

    // 2.4 actualPoints 非法字符串/NaN
    const nanReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdBadParam}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "SETTLE", actualPoints: "not_a_number", auditRemark: "NaN拒绝" }),
    });
    const nanRes = await resolveHandler(nanReq, { params: Promise.resolve({ taskId: taskIdBadParam }) });
    assert.equal(nanRes.status, 400);

    // 2.5 结算单尚在 HOLD 状态，不可直接管理员复核
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdBadParam,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 20,
      pricingSnapshot: dummySnapshot,
    });

    const notReviewReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdBadParam}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "RELEASE", auditRemark: "测试未处于复核状态" }),
    });
    const notReviewRes = await resolveHandler(notReviewReq, { params: Promise.resolve({ taskId: taskIdBadParam }) });
    assert.equal(notReviewRes.status, 400);
    const body = await notReviewRes.json();
    assert.equal(body.code, "INVALID_STATE_FOR_ADMIN_RESOLVE");
  });

  test("3. 管理员成功裁决 RELEASE：预扣全额原路退还，三表终态一致", async () => {
    const taskIdRelease = `task-admin-release-${Date.now()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 30, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdRelease,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 30,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟进入人工复核态
    await enqueueSettlementRecovery({
      taskId: taskIdRelease,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "测试进入人工复核",
    });
    await prisma.tokensettlementrecovery.update({ where: { taskId: taskIdRelease }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdRelease }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlementhold.update({ where: { taskId: taskIdRelease }, data: { status: "REQUIRES_REVIEW" } });

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    const releaseReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdRelease}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        action: "RELEASE",
        auditRemark: "经排查模型未产生实际消耗，全额释放",
      }),
    });

    const res = await resolveHandler(releaseReq, { params: Promise.resolve({ taskId: taskIdRelease }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, "RELEASED");
    assert.equal(json.data.releasedPoints, 30);

    // 验证账户可用余额增加 30
    const balAfter = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfter.available, (balBefore.available ?? 0) + 30);

    // 验证三表同步变为 RELEASED
    const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdRelease } });
    const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdRelease } });
    const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdRelease } });
    assert.equal(settle.status, "RELEASED");
    assert.equal(hold.status, "RELEASED");
    assert.equal(recovery.status, "RELEASED");
  });

  test("4. 管理员成功裁决 SETTLE：核定实际消耗多退少补，三表终态一致", async () => {
    const taskIdSettle = `task-admin-settle-${Date.now()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdSettle,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟进入人工复核态
    await enqueueSettlementRecovery({
      taskId: taskIdSettle,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "SETTLEMENT_FAILED",
      error: "测试进入人工复核",
    });
    await prisma.tokensettlementrecovery.update({ where: { taskId: taskIdSettle }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdSettle }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlementhold.update({ where: { taskId: taskIdSettle }, data: { status: "REQUIRES_REVIEW" } });

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    // 预扣 50，管理员核定实际消耗 35（释放退回 15 点）
    const settleReq = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdSettle}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        action: "SETTLE",
        actualPoints: 35,
        auditRemark: "日志核定实际消耗 35 点",
      }),
    });

    const res = await resolveHandler(settleReq, { params: Promise.resolve({ taskId: taskIdSettle }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, "SETTLED");
    assert.equal(json.data.actualPricePoints, 35);
    assert.equal(json.data.releasedPoints, 15);

    // 可用余额增加 15 点退还
    const balAfter = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfter.available, (balBefore.available ?? 0) + 15);

    const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdSettle } });
    assert.equal(settle.status, "SETTLED");
  });

  test("5. 重复调用已处理任务幂等安全返回 200", async () => {
    const taskIdIdempotent = `task-admin-idem-${Date.now()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdIdempotent,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 20,
      pricingSnapshot: dummySnapshot,
    });
    await enqueueSettlementRecovery({
      taskId: taskIdIdempotent,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "待复核",
    });
    await prisma.tokensettlementrecovery.update({ where: { taskId: taskIdIdempotent }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdIdempotent }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlementhold.update({ where: { taskId: taskIdIdempotent }, data: { status: "REQUIRES_REVIEW" } });

    // 第一次调用 RELEASE
    const req1 = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdIdempotent}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ action: "RELEASE", auditRemark: "首次释放" }),
    });
    const res1 = await resolveHandler(req1, { params: Promise.resolve({ taskId: taskIdIdempotent }) });
    assert.equal(res1.status, 200);

    const balAfterFirst = await getBalanceSummary(testUserId, testWorkspaceId);

    // 第二次重复调用
    const req2 = new NextRequest(`http://localhost:3000/api/admin/token-settlements/${taskIdIdempotent}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ action: "RELEASE", auditRemark: "重复点击释放" }),
    });
    const res2 = await resolveHandler(req2, { params: Promise.resolve({ taskId: taskIdIdempotent }) });
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.success, true);
    assert.equal(json2.data.status, "RELEASED");

    const balAfterSecond = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfterSecond.available, balAfterFirst.available, "重复调用绝不二次退款");
  });

  test("6. GET 结算单列表查询接口正常返回与筛选", async () => {
    const listReq = new NextRequest("http://localhost:3000/api/admin/token-settlements?status=ALL&page=1&pageSize=10", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await listHandler(listReq);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.records));
    assert.ok(json.data.pagination.total >= 0);
  });

  test("7. 路由级测试：POST /api/cron/token-settlement-recovery 优先回收过期 HOLD，返回 6 项完整统计并进入释放/恢复队列", async () => {
    const taskIdCron = `task-cron-expired-${Date.now()}`;
    try {
      await grantPoints({ userId: testUserId, scope: "WALLET", points: 25, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({
        taskId: taskIdCron,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        points: 25,
        pricingSnapshot: dummySnapshot,
      });

      // 将预扣记录的 expiresAt 更新为过去时间以模拟过期
      const pastTime = new Date(Date.now() - 60000);
      await prisma.tokensettlementhold.update({
        where: { taskId: taskIdCron },
        data: { expiresAt: pastTime },
      });

      const cronReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ limit: 10, workerId: "test-cron-worker" }),
      });

      const cronRes = await cronRecoveryHandler(cronReq);
      assert.equal(cronRes.status, 200);
      const json = await cronRes.json();
      assert.equal(json.success, true);
      assert.ok(typeof json.data.reaped === "number" && json.data.reaped >= 1, "必须至少扫描并回收了 1 个过期预扣");
      assert.ok(typeof json.data.processed === "number");
      assert.ok(typeof json.data.settled === "number");
      assert.ok(typeof json.data.released === "number");
      assert.ok(typeof json.data.inReview === "number");
      assert.ok(typeof json.data.failed === "number");

      // 验证单据状态已被自动释放
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdCron } });
      assert.equal(settle.status, "RELEASED");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdCron } });
      assert.equal(hold.status, "RELEASED");
    } finally {
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementrecovery\` WHERE \`taskId\` = '${taskIdCron}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementhold\` WHERE \`taskId\` = '${taskIdCron}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlement\` WHERE \`taskId\` = '${taskIdCron}'`);
      await prisma.pointledger.deleteMany({ where: { taskId: taskIdCron } });
    }
  });

  test("8. cron 路由：未授权返回 401，非法参数返回 400，且不回显密钥", async () => {
    // 8.1 无凭据返回 401
    const unauthReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const unauthRes = await cronRecoveryHandler(unauthReq);
    assert.equal(unauthRes.status, 401);
    const unauthJson = await unauthRes.json();
    const dumped = JSON.stringify(unauthJson);
    const secret = process.env.CRON_SECRET;
    if (secret && secret.length > 0) {
      assert.ok(!dumped.includes(secret), "401 错误响应不得包含 CRON_SECRET 明文");
    }

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    } as Record<string, string>;

    // 8.2 limit 为负数
    const badLimitReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: -5 }),
    });
    assert.equal((await cronRecoveryHandler(badLimitReq)).status, 400);

    // 8.3 limit 超出上限
    const overLimitReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: 999999 }),
    });
    assert.equal((await cronRecoveryHandler(overLimitReq)).status, 400);

    // 8.4 limit 非整数/非有限
    const nanLimitReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: "not_a_number" }),
    });
    assert.equal((await cronRecoveryHandler(nanLimitReq)).status, 400);

    // 8.5 leaseDurationMs 非法
    const badLeaseReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: 10, leaseDurationMs: 100 }),
    });
    assert.equal((await cronRecoveryHandler(badLeaseReq)).status, 400);

    // 8.6 workerId 为空
    const emptyWorkerReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: 10, workerId: "   " }),
    });
    assert.equal((await cronRecoveryHandler(emptyWorkerReq)).status, 400);

    // 8.7 workerId 超长
    const longWorkerReq = new NextRequest("http://localhost:3000/api/cron/token-settlement-recovery", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ limit: 10, workerId: "w".repeat(200) }),
    });
    assert.equal((await cronRecoveryHandler(longWorkerReq)).status, 400);
  });

  test("9. 管理员安全删除与批量删除结算单测试", async () => {
    // 9.1 无权限校验 (403)
    const noAuthReq = new NextRequest("http://localhost:3000/api/admin/token-settlements", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${regularToken}`,
      },
      body: JSON.stringify({ taskIds: ["some-task-id"] }),
    });
    const noAuthRes = await deleteHandler(noAuthReq);
    assert.equal(noAuthRes.status, 403);

    // 9.2 参数缺失校验 (400)
    const emptyReq = new NextRequest("http://localhost:3000/api/admin/token-settlements", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ taskIds: [] }),
    });
    const emptyRes = await deleteHandler(emptyReq);
    assert.equal(emptyRes.status, 400);

    // 9.3 构造两条测试数据：一条 SETTLED（可删），一条 REQUIRES_REVIEW（保护不可删）
    const settledTaskId = `del-settled-${Date.now()}`;
    const reviewTaskId = `del-review-${Date.now()}`;

    // 创建 SETTLED 记录及关联 Hold
    await prisma.tokensettlementhold.create({
      data: {
        id: randomUUID(),
        taskId: settledTaskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        holdPoints: BigInt(50),
        status: "SETTLED",
        idempotencyKey: `idemp-${settledTaskId}`,
        holdDetails: { buckets: [] },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.tokensettlement.create({
      data: {
        id: randomUUID(),
        taskId: settledTaskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        status: "SETTLED",
        holdPoints: BigInt(50),
        actualPricePoints: BigInt(40),
        releasedPoints: BigInt(10),
        pricingSnapshot: dummySnapshot as any,
        settlementVersion: 1,
      },
    });

    // 创建 REQUIRES_REVIEW 记录及关联 Hold
    await prisma.tokensettlementhold.create({
      data: {
        id: randomUUID(),
        taskId: reviewTaskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        holdPoints: BigInt(60),
        status: "REQUIRES_REVIEW",
        idempotencyKey: `idemp-${reviewTaskId}`,
        holdDetails: { buckets: [] },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.tokensettlement.create({
      data: {
        id: randomUUID(),
        taskId: reviewTaskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        status: "REQUIRES_REVIEW",
        holdPoints: BigInt(60),
        pricingSnapshot: dummySnapshot as any,
        settlementVersion: 1,
      },
    });

    // 9.4 批量删除两项：SETTLED 应该成功删除，REQUIRES_REVIEW 应该被安全跳过
    const batchDelReq = new NextRequest("http://localhost:3000/api/admin/token-settlements", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ taskIds: [settledTaskId, reviewTaskId] }),
    });
    const batchDelRes = await deleteHandler(batchDelReq);
    assert.equal(batchDelRes.status, 200);
    const batchDelJson = await batchDelRes.json();

    assert.equal(batchDelJson.success, true);
    assert.equal(batchDelJson.deletedCount, 1, "应成功删除 1 条 SETTLED 单据");
    assert.equal(batchDelJson.skippedCount, 1, "应安全跳过 1 条 REQUIRES_REVIEW 单据");
    assert.ok(
      batchDelJson.skipped.some((s: any) => s.taskId === reviewTaskId && s.reason.includes("待人工复核")),
      "跳过原因中应明确提示待人工复核"
    );

    // 9.5 数据库层面校验：SETTLED 关联记录已被清理，REQUIRES_REVIEW 依然完整留存
    const settledCheck = await prisma.tokensettlement.findUnique({ where: { taskId: settledTaskId } });
    assert.equal(settledCheck, null, "已结算单据在数据库中应被彻底清理");

    const reviewCheck = await prisma.tokensettlement.findUnique({ where: { taskId: reviewTaskId } });
    assert.ok(reviewCheck, "待复核单据在数据库中必须安然无恙留存");

    // 9.6 清理测试用待复核单据
    await prisma.tokensettlement.deleteMany({ where: { taskId: reviewTaskId } });
    await prisma.tokensettlementhold.deleteMany({ where: { taskId: reviewTaskId } });
  });
});
