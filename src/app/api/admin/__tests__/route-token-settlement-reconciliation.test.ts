import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { setExplicitTestJwtSecret } from "@/lib/jwt-config";
import { grantPoints } from "@/lib/credit-service";
import { consumeAndCreateSettlementHold, enqueueSettlementRecovery } from "@/lib/token-settlement-service";
import { type DeploymentPricing, buildRegistryPricingSnapshot } from "@/lib/model-pricing";
import { GET as reconGet, POST as reconPost } from "../token-settlements/reconciliation/route";
import { GET as statsGet } from "../token-settlements/stats/route";

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
const dummySnapshot = buildRegistryPricingSnapshot({ providerId: "MagicAI", modelId: "gpt-5.5", pricing: dummyPricing });

describe("管理员 Token 结算对账接口（GET 分页筛选 / POST 运营动作 / 权限 / 幂等）", () => {
  // 唯一命名空间：避免与其他对账测试套件并行执行时产生主键/邮箱冲突
  const uniq = randomUUID().slice(0, 8);
  const adminUserId = `admin-recon-${uniq}`;
  const regularUserId = `regular-recon-${uniq}`;
  const testUserId = `test-user-recon-${uniq}`;
  const testWorkspaceId = `test-ws-recon-${uniq}`;
  let adminToken = "";
  let regularToken = "";

  before(async () => {
    setExplicitTestJwtSecret(TEST_SECRET);
    const now = new Date();
    await prisma.user.create({ data: { id: adminUserId, email: `admin_${uniq}@zhige.test`, name: "Admin", role: "SUPER_ADMIN", status: "active", password: "x" } });
    await prisma.user.create({ data: { id: regularUserId, email: `regular_${uniq}@zhige.test`, name: "Regular", role: "USER", status: "active", password: "x" } });
    await prisma.user.create({ data: { id: testUserId, email: `target_${uniq}@zhige.test`, name: "Target", role: "USER", status: "active", password: "x" } });
    await prisma.userwallet.create({ data: { id: randomUUID(), userId: testUserId, balance: BigInt(200) } });
    await prisma.workspace.create({ data: { id: testWorkspaceId, name: "Recon WS", type: "PERSONAL", ownerId: testUserId, updatedAt: now } });
    await prisma.workspacequota.create({ data: { id: `quota-${randomUUID()}`, workspaceId: testWorkspaceId, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now } });
    await prisma.workspacemember.create({ data: { id: randomUUID(), workspaceId: testWorkspaceId, userId: testUserId, role: "OWNER", tokenBalance: BigInt(0) } });

    adminToken = await new SignJWT({ userId: adminUserId, role: "SUPER_ADMIN" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_KEY);
    regularToken = await new SignJWT({ userId: regularUserId, role: "USER" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_KEY);
  });

  after(async () => {
    setExplicitTestJwtSecret(null);
    const userIds = [adminUserId, regularUserId, testUserId];
    await prisma.tokensettlementrecovery.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tokensettlementhold.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tokensettlement.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointledger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointgrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.userwallet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspace.deleteMany({ where: { id: testWorkspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    // 断言本轮精确 ID 零残留（清理失败不得吞掉；不删除历史残留数据）
    const residue = {
      recovery: await prisma.tokensettlementrecovery.count({ where: { userId: { in: userIds } } }),
      hold: await prisma.tokensettlementhold.count({ where: { userId: { in: userIds } } }),
      settlement: await prisma.tokensettlement.count({ where: { userId: { in: userIds } } }),
      ledger: await prisma.pointledger.count({ where: { userId: { in: userIds } } }),
      grant: await prisma.pointgrant.count({ where: { userId: { in: userIds } } }),
      member: await prisma.workspacemember.count({ where: { workspaceId: testWorkspaceId } }),
      quota: await prisma.workspacequota.count({ where: { workspaceId: testWorkspaceId } }),
      wallet: await prisma.userwallet.count({ where: { userId: { in: userIds } } }),
      workspace: await prisma.workspace.count({ where: { id: testWorkspaceId } }),
      user: await prisma.user.count({ where: { id: { in: userIds } } }),
    };
    for (const [k, v] of Object.entries(residue)) {
      if (v !== 0) throw new Error(`[admin-recon-test] 本轮精确 ID 未清理干净: ${k}=${v}`);
    }
  });

  test("1. 权限：普通用户 GET/POST 均返回 403，未授权 GET 返回 401", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation");
    assert.equal((await reconGet(unauthReq)).status, 401);

    const regularGet = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    assert.equal((await reconGet(regularGet)).status, 403);

    const regularPost = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${regularToken}` },
      body: JSON.stringify({ taskId: "x", action: "retry", reason: "r" }),
    });
    assert.equal((await reconPost(regularPost)).status, 403);
  });

  test("2. GET：管理员分页 + 筛选正常返回", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/admin/token-settlements/reconciliation?userId=${testUserId}&page=1&pageSize=10`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const res = await reconGet(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.records));
    assert.ok(json.data.pagination.total >= 0);
  });

  test("3. POST：非法 action / 缺 reason 返回 400", async () => {
    const badAction = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ taskId: "x", action: "delete", reason: "r" }),
    });
    assert.equal((await reconPost(badAction)).status, 400);

    const noReason = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ taskId: "x", action: "retry" }),
    });
    assert.equal((await reconPost(noReason)).status, 400);
  });

  test("4. POST mark-review：三表转复核，重复调用幂等", async () => {
    const taskId = `task-recon-api-mark-${Date.now()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, points: 20, pricingSnapshot: dummySnapshot });
    await enqueueSettlementRecovery({ taskId, userId: testUserId, workspaceId: testWorkspaceId, recoveryType: "SETTLEMENT_FAILED", error: "x" });

    const req = () =>
      new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ taskId, action: "mark-review", reason: "人工核查" }),
      });

    const res1 = await reconPost(req());
    assert.equal(res1.status, 200);
    const j1 = await res1.json();
    assert.equal(j1.data.status, "REQUIRES_REVIEW");
    assert.equal(j1.data.applied, true);

    const res2 = await reconPost(req());
    const j2 = await res2.json();
    assert.equal(j2.data.idempotent, true, "重复 mark-review 必须幂等");
  });

  test("5. POST release：REQUIRES_REVIEW 全额释放；版本冲突返回 409", async () => {
    const taskId = `task-recon-api-release-${Date.now()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 30, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, points: 30, pricingSnapshot: dummySnapshot });
    await enqueueSettlementRecovery({ taskId, userId: testUserId, workspaceId: testWorkspaceId, recoveryType: "RELEASE_FAILED", error: "x" });
    await prisma.tokensettlementrecovery.update({ where: { taskId }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlementhold.update({ where: { taskId }, data: { status: "REQUIRES_REVIEW" } });

    const conflict = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ taskId, action: "release", reason: "r", expectedSettlementVersion: 999 }),
    });
    assert.equal((await reconPost(conflict)).status, 409);

    const ok = new NextRequest("http://localhost:3000/api/admin/token-settlements/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ taskId, action: "release", reason: "全额释放" }),
    });
    const res = await reconPost(ok);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, "RELEASED");
  });

  test("6. GET /stats：管理员可读，普通用户 403，且不含敏感字段", async () => {
    const regularReq = new NextRequest("http://localhost:3000/api/admin/token-settlements/stats", {
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    assert.equal((await statsGet(regularReq)).status, 403);

    const req = new NextRequest(`http://localhost:3000/api/admin/token-settlements/stats?userId=${testUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await statsGet(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.recoveryStatusCounts);
    assert.ok(json.data.anomalies);
    const dumped = JSON.stringify(json).toLowerCase();
    assert.ok(!dumped.includes("secret") && !dumped.includes("jwt") && !dumped.includes("@zhige.test"));
  });
});
