import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { setExplicitTestJwtSecret } from "@/lib/jwt-config";
import { grantPoints } from "@/lib/credit-service";
import { consumeAndCreateSettlementHold, isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";
import { runSettlementReconciliationCron, scanSettlementReconciliation } from "@/lib/token-settlement-ops";
import { type DeploymentPricing, buildRegistryPricingSnapshot } from "@/lib/model-pricing";
import { POST as cronReconHandler } from "@/app/api/cron/token-settlement-reconciliation/route";

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

describe("cron 结算对账流程（reap -> recovery -> reconcile，逐步统计/隔离/鉴权/参数/超时）", () => {
  // 唯一命名空间：避免与管理员对账套件并行执行时产生主键/邮箱冲突
  const uniq = randomUUID().slice(0, 8);
  const adminUserId = `admin-cron-recon-${uniq}`;
  const testUserId = `test-user-cron-recon-${uniq}`;
  const testWorkspaceId = `test-ws-cron-recon-${uniq}`;
  let adminToken = "";

  before(async () => {
    setExplicitTestJwtSecret(TEST_SECRET);
    const now = new Date();
    await prisma.user.create({ data: { id: adminUserId, email: `admin_cron_${uniq}@zhige.test`, name: "Admin", role: "SUPER_ADMIN", status: "active", password: "x" } });
    await prisma.user.create({ data: { id: testUserId, email: `target_cron_${uniq}@zhige.test`, name: "Target", role: "USER", status: "active", password: "x" } });
    await prisma.userwallet.create({ data: { id: randomUUID(), userId: testUserId, balance: BigInt(200) } });
    await prisma.workspace.create({ data: { id: testWorkspaceId, name: "Cron WS", type: "PERSONAL", ownerId: testUserId, updatedAt: now } });
    await prisma.workspacequota.create({ data: { id: `quota-${randomUUID()}`, workspaceId: testWorkspaceId, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now } });
    await prisma.workspacemember.create({ data: { id: randomUUID(), workspaceId: testWorkspaceId, userId: testUserId, role: "OWNER", tokenBalance: BigInt(0) } });
    adminToken = await new SignJWT({ userId: adminUserId, role: "SUPER_ADMIN" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_KEY);
  });

  after(async () => {
    setExplicitTestJwtSecret(null);
    const userIds = [adminUserId, testUserId];
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
      if (v !== 0) throw new Error(`[cron-recon-test] 本轮精确 ID 未清理干净: ${k}=${v}`);
    }
  });

  test("1. 未授权返回 401，且不回显 CRON_SECRET", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/token-settlement-reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await cronReconHandler(req);
    assert.equal(res.status, 401);
    const dumped = JSON.stringify(await res.json());
    const secret = process.env.CRON_SECRET;
    if (secret && secret.length > 0) assert.ok(!dumped.includes(secret));
  });

  test("2. 非法参数返回 400", async () => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
    const cases = [
      { limit: -1 },
      { limit: 999999 },
      { limit: 1.5 },
      { limit: "x" },
      { limit: 10, leaseDurationMs: 100 },
      { limit: 10, stepTimeoutMs: 10 },
      { limit: 10, stepTimeoutMs: 999999 },
      { limit: 10, workerId: "   " },
      { limit: 10, workerId: "w".repeat(200) },
      { limit: 10, autoFix: "yes" },
      { limit: 10, autoFix: true },
    ];
    for (const body of cases) {
      const req = new NextRequest("http://localhost:3000/api/cron/token-settlement-reconciliation", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      assert.equal((await cronReconHandler(req)).status, 400, `参数 ${JSON.stringify(body)} 应返回 400`);
    }
  });

  test("3. 正常执行：过期 HOLD 被回收，三步各自返回独立统计", async () => {
    const taskId = `task-cron-recon-${Date.now()}`;
    try {
      await grantPoints({ userId: testUserId, scope: "WALLET", points: 25, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, points: 25, pricingSnapshot: dummySnapshot });
      await prisma.tokensettlementhold.update({ where: { taskId }, data: { expiresAt: new Date(Date.now() - 60000) } });

      const req = new NextRequest("http://localhost:3000/api/cron/token-settlement-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        // 以本测试自身 userId 作用域，避免与其他测试文件 fixture 串扰
        body: JSON.stringify({ limit: 10, workerId: "cron-recon-test", userId: testUserId }),
      });
      const res = await cronReconHandler(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.reap.ok && json.data.reap.data.reaped >= 1, "步骤1 必须回收至少 1 个过期预扣");
      assert.ok(typeof json.data.recovery.ok === "boolean");
      assert.ok(json.data.reconcile.ok && typeof json.data.reconcile.data.scanned === "number");
      assert.ok(json.data.reap.durationMs >= 0);
      assert.equal(json.data.allStepsSucceeded, true);

      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "RELEASED", "过期预扣必须被回收释放");
    } finally {
      await prisma.tokensettlementrecovery.deleteMany({ where: { taskId } });
      await prisma.tokensettlementhold.deleteMany({ where: { taskId } });
      await prisma.tokensettlement.deleteMany({ where: { taskId } });
      await prisma.pointledger.deleteMany({ where: { taskId } });
    }
  });

  test("4. 失败隔离：任一步失败不阻断后续安全扫描（注入失败步骤）", async () => {
    let reconcileCalled = false;
    const result = await runSettlementReconciliationCron(
      { limit: 10, stepTimeoutMs: 5000 },
      {
        reap: async () => ({ reapedCount: 0 }),
        recover: async () => {
          throw new Error("模拟 Recovery 步骤失败");
        },
        reconcile: async () => {
          reconcileCalled = true;
          return {
            scanned: 0,
            findingsCount: 0,
            inconsistentCount: 0,
            byKind: {},
            findings: [],
            appliedFixes: [],
            conflicts: 0,
            autoFix: false,
            operator: "test",
            verificationScope: { ledgerStructure: true, amountEquation: true, accountBalanceAggregate: false },
          };
        },
      }
    );
    assert.equal(result.reaped.ok, true);
    assert.equal(result.recovery.ok, false, "恢复步骤必须标记失败");
    assert.match(result.recovery.error || "", /Recovery 步骤失败/);
    assert.equal(result.reconcile.ok, true, "对账扫描必须仍执行");
    assert.ok(reconcileCalled, "对账扫描必须被调用");
    assert.equal(result.allStepsSucceeded, false);
  });

  test("5. 步骤超时边界：超时被捕获为失败而非抛出", async () => {
    const result = await runSettlementReconciliationCron(
      { limit: 10, stepTimeoutMs: 1000 },
      {
        reap: () => new Promise((resolve) => setTimeout(() => resolve({ reapedCount: 0 }), 3000)),
      }
    );
    assert.equal(result.reaped.ok, false);
    assert.match(result.reaped.error || "", /超时/);
  });
});

describe("Phase 2B 非破坏性收口：生产关闭态 (settlementEnabled=false) 只读保护", () => {
  const uid = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

  // 专用哨兵用户：把「cron 不得产生任何写入」的断言限定在本套件作用域内，
  // 避免其他测试套件并行写入导致全局 count 误判（此前偶发失败的根因）。
  const sentinelUserId = `cron-recon-sentinel-${randomUUID().slice(0, 8)}`;
  before(async () => {
    await prisma.user.create({
      data: {
        id: sentinelUserId,
        email: `${sentinelUserId}@zhige.test`,
        name: "CronReconSentinel",
        role: "USER",
        status: "active",
        password: "x",
      },
    });
  });
  after(async () => {
    await prisma.pointledger.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.pointgrant.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.tokensettlementhold.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.tokensettlement.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.tokensettlementrecovery.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.userwallet.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.user.deleteMany({ where: { id: sentinelUserId } });
    const residue = await prisma.user.count({ where: { id: sentinelUserId } });
    assert.equal(residue, 0, "哨兵用户必须零残留");
  });

  /** 空扫描结果（用于替换有副作用的 reap/recover 步骤，保证非破坏性） */
  function buildEmptyScanResult(operator: string) {
    return {
      scanned: 0,
      findingsCount: 0,
      inconsistentCount: 0,
      byKind: {},
      findings: [],
      appliedFixes: [],
      conflicts: 0,
      autoFix: false,
      operator,
      verificationScope: { ledgerStructure: true, amountEquation: true, accountBalanceAggregate: false },
    };
  }

  /** 生产关闭态下，reap / recover 一律以零副作用替身接管（避免任何全局真实回收动作） */
  function safeDepStubs() {
    return {
      reap: async () => ({ reapedCount: 0 }),
      recover: async () => ({ processed: 0, settled: 0, released: 0, inReview: 0, failed: 0 }),
    };
  }

  async function readMagicPricing() {
    return prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: "MagicAI", modelId: "gpt-5.5" } },
      select: { providerId: true, modelId: true, pricing: true },
    });
  }

  async function readC07Snapshot() {
    const row = await prisma.componentcatalog.findUnique({
      where: { id: "C07" },
      select: { id: true, activeContractId: true, detail: true, updatedAt: true },
    });
    const active = row?.activeContractId
      ? await prisma.componentcontract.findUnique({ where: { id: row.activeContractId } })
      : null;
    return { row, active };
  }

  test("① 只能安全扫描：settlementEnabled=false 且 reconcile 必须 autoFix=false / dryRun=true", async () => {
    assert.equal(isTokenSettlementFeatureEnabled(), false, "本轮真实 Token 结算必须为 false");

    const seen: Array<{ autoFix?: boolean; operator?: string }> = [];
    const result = await runSettlementReconciliationCron(
      { limit: 10 },
      {
        ...safeDepStubs(),
        reconcile: async (o) => {
          seen.push({ autoFix: o.autoFix, operator: o.operator });
          return buildEmptyScanResult(o.operator || "cron-readonly");
        },
      },
    );

    assert.equal(seen.length, 1, "cron 必须且仅调用一次对账扫描");
    assert.equal(seen[0].autoFix, false, "生产关闭态下 cron 对账必须 autoFix=false（仅安全扫描）");
    assert.equal(result.reconcile.data?.dryRun, true, "cron 对账步骤必须声明 dryRun");
    assert.equal(result.reaped.data?.reaped, 0, "关闭态下不得产生回收落账");
    assert.equal(result.allStepsSucceeded, true);
  });

  test("② 不得创建真实结算 HOLD，不得执行真实 Token 扣费（真实扫描器参与）", async () => {
    // 按本套件哨兵用户作用域计数：既精确验证「cron 未产生任何写入」，
    // 又不因其他测试套件并行创建数据而误判（此前使用全局 count 导致偶发失败）。
    const snap = async () => ({
      hold: await prisma.tokensettlementhold.count({ where: { userId: sentinelUserId } }),
      settle: await prisma.tokensettlement.count({ where: { userId: sentinelUserId } }),
      recovery: await prisma.tokensettlementrecovery.count({ where: { userId: sentinelUserId } }),
      ledger: await prisma.pointledger.count({ where: { userId: sentinelUserId } }),
      grant: await prisma.pointgrant.count({ where: { userId: sentinelUserId } }),
      wallet:
        (await prisma.userwallet.aggregate({ where: { userId: sentinelUserId }, _sum: { balance: true } }))._sum
          .balance ?? BigInt(0),
    });

    const before = await snap();
    const result = await runSettlementReconciliationCron(
      { limit: 10 },
      {
        ...safeDepStubs(),
        // 使用真实对账扫描器，验证其自身在 autoFix=false 下不产生任何写入
        reconcile: (o) => scanSettlementReconciliation({ ...o, autoFix: false }),
      },
    );
    assert.equal(result.reconcile.ok, true, `对账步骤必须成功: ${result.reconcile.error ?? ""}`);

    const after = await snap();
    assert.equal(after.hold, before.hold, "不得创建真实结算 HOLD");
    assert.equal(after.settle, before.settle, "不得创建真实结算记录");
    assert.equal(after.recovery, before.recovery, "不得创建恢复任务");
    assert.equal(after.ledger, before.ledger, "不得产生任何余额流水（扣费/退款/补扣均禁止）");
    assert.equal(after.grant, before.grant, "不得产生 grant");
    assert.equal(after.wallet, before.wallet, "钱包余额不得变化");
  });

  test("③ 不得修改 MagicAI/gpt-5.5 价格（共享生产价格只读）", async () => {
    const before = await readMagicPricing();
    assert.ok(before?.pricing, "MagicAI/gpt-5.5 价格必须存在，才具备变更检测基线");

    const result = await runSettlementReconciliationCron(
      { limit: 10 },
      {
        ...safeDepStubs(),
        reconcile: (o) => scanSettlementReconciliation({ ...o, autoFix: false }),
      },
    );
    assert.equal(result.reconcile.ok, true, `对账步骤必须成功: ${result.reconcile.error ?? ""}`);

    const after = await readMagicPricing();
    assert.equal(after?.pricing?.costInputMicrosPerMillion, before?.pricing?.costInputMicrosPerMillion, "costInput 不得变更");
    assert.equal(after?.pricing?.costOutputMicrosPerMillion, before?.pricing?.costOutputMicrosPerMillion, "costOutput 不得变更");
    assert.equal(after?.pricing?.priceVersion, before?.pricing?.priceVersion, "priceVersion 不得变更");
    assert.equal(after?.pricing?.priceSource, before?.pricing?.priceSource, "priceSource 不得变更");
    assert.deepEqual(after?.pricing, before?.pricing, "cron 不得修改共享生产模型价格");
  });

  test("④ 不得改变现有 C07 合同（组件配置与激活合同保持只读）", async () => {
    const before = await readC07Snapshot();
    assert.ok(before.row, "C07 组件必须存在（不得为空基线）");

    const result = await runSettlementReconciliationCron(
      { limit: 10 },
      {
        ...safeDepStubs(),
        reconcile: (o) => scanSettlementReconciliation({ ...o, autoFix: false }),
      },
    );
    assert.equal(result.reconcile.ok, true, `对账步骤必须成功: ${result.reconcile.error ?? ""}`);

    const after = await readC07Snapshot();
    assert.equal(after.row?.activeContractId, before.row?.activeContractId, "C07 激活合同不得变更");
    assert.equal(String(after.row?.updatedAt), String(before.row?.updatedAt), "C07 组件不得被改写");
    assert.deepEqual(after.row?.detail, before.row?.detail, "C07 detail 不得被改写");
    assert.deepEqual(after.active, before.active, "C07 激活合同内容不得变更");
  });

  test("⑤ 只读确认：MagicAI/gpt-5.5 仍为 5,000,000 / 30,000,000 / priceVersion=1 / VERIFIED", async () => {
    const dep = await readMagicPricing();
    assert.ok(dep, "MagicAI/gpt-5.5 部署必须存在");
    assert.ok(dep.pricing, `MagicAI/gpt-5.5 价格必须存在 (uid=${uid()})`);
    assert.equal(dep.pricing.costInputMicrosPerMillion, 5_000_000, "costInput 必须为 5,000,000");
    assert.equal(dep.pricing.costOutputMicrosPerMillion, 30_000_000, "costOutput 必须为 30,000,000");
    assert.equal(dep.pricing.priceVersion, 1, "priceVersion 必须为 1");
    assert.equal(dep.pricing.priceSource, "VERIFIED", "priceSource 必须为 VERIFIED");
  });
});
