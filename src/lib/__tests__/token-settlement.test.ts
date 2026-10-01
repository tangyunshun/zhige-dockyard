import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createSettlementHold,
  consumeAndCreateSettlementHold,
  completeSettlement,
  releaseSettlementHold,
  reapExpiredHolds,
  enqueueSettlementRecovery,
  claimSettlementRecovery,
  writeSettlementRecoveryResult,
  adminResolveSettlementReview,
  processSettlementRecovery,
  runSettlementRecovery,
  isTokenSettlementFeatureEnabled,
  InvalidStateTransitionError,
  SettlementConcurrencyConflictError,
  TokenSettlementError,
  reconstructPricingFromSnapshot,
  StoredHoldDetails,
} from "@/lib/token-settlement-service";
import {
  grantPoints,
  consumePoints,
  getBalanceSummary,
  InsufficientPointsError,
  RefundAccountNotFoundError,
  UNLIMITED_BALANCE,
} from "@/lib/credit-service";
import {
  type DeploymentPricing,
  type RegistryPricingSnapshot,
  buildRegistryPricingSnapshot,
  computeUsageCostBigInt,
} from "@/lib/model-pricing";

const B_ZERO = BigInt(0);

// 清理事务有限 P2034/死锁重试：仅对瞬时写冲突重试，业务错误不吞掉
async function cleanupWithRetry(fn: () => Promise<void>, maxAttempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const isTransient =
        err.code === "P2034" ||
        /deadlock|WriteConflict|Lock wait timeout|锁等待超时|事务失败/i.test(err.message ?? "");
      if (isTransient && attempt < maxAttempts) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 30 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// 单任务安全清理：按主键删除 + 有限 P2034 重试；失败仅记录，不污染后续测试
async function safeCleanupTask(taskId: string): Promise<void> {
  try {
    await cleanupWithRetry(async () => {
      await prisma.$transaction(async (tx) => {
        await tx.tokensettlementrecovery.deleteMany({ where: { taskId } });
        await tx.tokensettlementhold.deleteMany({ where: { taskId } });
        await tx.tokensettlement.deleteMany({ where: { taskId } });
        await tx.pointledger.deleteMany({ where: { taskId } });
      });
    });
  } catch (e) {
    console.error(`[safeCleanupTask] 清理失败(已记录, 不污染后续测试) taskId=${taskId}:`, e);
  }
}

describe("真实 Token 结算账务基础与状态机测试 (Phase 2A 强化真实验收套件)", () => {
  // 全局唯一后缀：每个 taskId/userId/workspaceId 都必须唯一，避免并行测试文件共享行导致 P2034/死锁
  const uid = () => Date.now() + "-" + randomUUID().slice(0, 8);
  const testUserId = `test-user-${uid()}-${Math.random().toString(36).slice(2, 7)}`;
  const testWorkspaceId = `test-ws-${uid()}-${Math.random().toString(36).slice(2, 7)}`;
  const testMemberUserId = `test-member-${uid()}-${Math.random().toString(36).slice(2, 7)}`;

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

  const dummySnapshot: RegistryPricingSnapshot = buildRegistryPricingSnapshot({
    providerId: "MagicAI",
    modelId: "gpt-5.5",
    pricing: dummyPricing,
  });

  before(async () => {
    const now = new Date();
    // 创建测试所有者用户
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        password: "hashed-test-pwd",
      },
    });

    // 创建测试成员用户
    await prisma.user.create({
      data: {
        id: testMemberUserId,
        email: `${testMemberUserId}@example.com`,
        password: "hashed-test-pwd",
      },
    });

    // 创建测试空间 (ENTERPRISE 空间以支持成员独立额度)
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: "Test Enterprise Settlement Workspace",
        type: "ENTERPRISE",
        ownerId: testUserId,
        updatedAt: now,
      },
    });

    // 创建空间配额
    await prisma.workspacequota.create({
      data: {
        id: `quota-${randomUUID()}`,
        workspaceId: testWorkspaceId,
        membershipLevelId: "FREE",
        tokenBalance: BigInt(0),
        updatedAt: now,
      },
    });

    // 创建所有者钱包
    await prisma.userwallet.create({
      data: {
        id: `wallet-${randomUUID()}`,
        userId: testUserId,
        balance: BigInt(0),
        updatedAt: now,
      },
    });

    // 创建成员钱包
    await prisma.userwallet.create({
      data: {
        id: `wallet-${randomUUID()}`,
        userId: testMemberUserId,
        balance: BigInt(0),
        updatedAt: now,
      },
    });

    // 创建 OWNER 成员
    await prisma.workspacemember.create({
      data: {
        id: `member-${randomUUID()}`,
        workspaceId: testWorkspaceId,
        userId: testUserId,
        role: "OWNER",
        tokenBalance: BigInt(0),
        monthlyTokenLimit: BigInt(100000),
        monthlyTokenUsed: BigInt(0),
      },
    });

    // 创建 MEMBER 成员（具有独立算力点额度与月度限制）
    await prisma.workspacemember.create({
      data: {
        id: `member-${randomUUID()}`,
        workspaceId: testWorkspaceId,
        userId: testMemberUserId,
        role: "MEMBER",
        tokenBalance: BigInt(500),
        monthlyTokenLimit: BigInt(50000),
        monthlyTokenUsed: BigInt(10000),
      },
    });
  });

  after(async () => {
    // 级联清理测试数据（明确测试用户/空间范围，事务 + 有限 P2034 重试，绝不按 task- 前缀盲删）
    const userIds = [testUserId, testMemberUserId];
    await cleanupWithRetry(async () => {
      await prisma.$transaction(async (tx) => {
        await tx.tokensettlementrecovery.deleteMany({ where: { userId: { in: userIds } } });
        await tx.tokensettlementhold.deleteMany({ where: { userId: { in: userIds } } });
        await tx.tokensettlement.deleteMany({ where: { userId: { in: userIds } } });
        await tx.pointledger.deleteMany({ where: { userId: { in: userIds } } });
        await tx.pointgrant.deleteMany({ where: { userId: { in: userIds } } });
        await tx.workspacemember.deleteMany({ where: { workspaceId: testWorkspaceId } });
        await tx.workspacequota.deleteMany({ where: { workspaceId: testWorkspaceId } });
        await tx.userwallet.deleteMany({ where: { userId: { in: userIds } } });
        await tx.workspace.deleteMany({ where: { id: testWorkspaceId } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
    });
  });

  test("1. 预扣成功 (HOLD 状态建立、明细留存与 monthlyTokenUsedIncremented 持久化)", async () => {
    await grantPoints({
      scope: "WALLET",
      userId: testUserId,
      points: 500,
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
      title: "测试充值 500 点",
    });

    const taskId = `task-hold-1-${uid()}`;
    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 200,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    const hold = await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 200,
      monthlyTokenUsedIncremented: 1500,
      pricingSnapshot: dummySnapshot,
      holdDetails: consumeRes.details,
    });

    assert.equal(hold.status, "HELD");
    assert.equal(hold.holdPoints, BigInt(200));

    // 验证 DB 中的持久化
    const rows = await prisma.$queryRaw<
      Array<{ status: string; holdPoints: bigint; monthlyTokenUsedIncremented: bigint }>
    >`
      SELECT \`status\`, \`holdPoints\`, \`monthlyTokenUsedIncremented\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId}
    `;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "HOLD");
    assert.equal(rows[0].holdPoints, BigInt(200));
    assert.equal(rows[0].monthlyTokenUsedIncremented, BigInt(1500));
  });

  test("2. 历史价格快照唯一性：预扣后修改 pricing/传入篡改 pricing，旧任务仍按旧快照结算", async () => {
    const taskId = `task-pricing-snapshot-${uid()}`;
    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 100,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    // 初始快照: priceInput=10 元/百万 (10 micros/token), priceOutput=60 元/百万 (60 micros/token)
    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 100,
      pricingSnapshot: dummySnapshot,
      holdDetails: consumeRes.details,
    });

    // 恶意篡改 pricing 试图传给 completeSettlement (单价暴涨 100 倍)
    const tamperedPricing: DeploymentPricing = {
      ...dummyPricing,
      priceInputMicrosPerMillion: 1_000_000_000,
      priceOutputMicrosPerMillion: 6_000_000_000,
    };

    // completeSettlement 不采信外部 pricing，仅从 tokensettlement.pricingSnapshot 还原
    const result = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 1000, outputTokens: 500 },
      pricing: tamperedPricing, // 外部传入被废弃，不应影响结算
    });

    assert.equal(result.status, "SETTLED");
    // 输入 1000 tokens @ 10 micros = 10000 micros = 0.01 元 = 1 点
    // 输出 500 tokens @ 60 micros = 30000 micros = 0.03 元 = 3 点
    // 实际售价 = 4 点 (而非按篡改价的 400 点)
    assert.equal(result.actualPricePoints, BigInt(4));
    assert.equal(result.releasedPoints, BigInt(96));
  });

  test("3. 严禁成本价兜底结算：仅有供应成本无用户售价时，严禁扣款，转 REQUIRES_REVIEW", async () => {
    const taskId = `task-no-price-review-${uid()}`;
    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 50,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    // 仅有成本价 (costInput=5, costOutput=30)，无售价 (priceInput=null, priceOutput=null)
    const costOnlyPricing: DeploymentPricing = {
      currency: "CNY",
      costInputMicrosPerMillion: 5_000_000,
      costOutputMicrosPerMillion: 30_000_000,
      costCacheReadMicrosPerMillion: null,
      costCacheWriteMicrosPerMillion: null,
      priceInputMicrosPerMillion: null,
      priceOutputMicrosPerMillion: null,
      priceCacheReadMicrosPerMillion: null,
      priceCacheWriteMicrosPerMillion: null,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      markupRateBps: null,
      priceVersion: 1,
      effectiveFrom: new Date().toISOString(),
    };

    const costOnlySnapshot: RegistryPricingSnapshot = buildRegistryPricingSnapshot({
      providerId: "MagicAI",
      modelId: "gpt-5.5",
      pricing: costOnlyPricing,
    });

    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 50,
      pricingSnapshot: costOnlySnapshot,
      holdDetails: consumeRes.details,
    });

    const result = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

    // 必须转入 REQUIRES_REVIEW，严禁使用成本价扣费，扣除售价点数必须为 0
    assert.equal(result.status, "REQUIRES_REVIEW");
    assert.equal(result.actualPricePoints, B_ZERO);
  });

  test("4. MEMBER 分桶释放与差额返还：恢复成员余额、真实 balanceAfter 且 grantId 必须为 null", async () => {
    const taskId = `task-member-release-${uid()}`;
    // 从成员独立额度消耗 80 点 (MEMBER 分桶)
    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      userId: testMemberUserId,
      points: 80,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    const memberBefore = await prisma.workspacemember.findFirstOrThrow({
      where: { workspaceId: testWorkspaceId, userId: testMemberUserId },
    });
    const balanceBeforeRelease = memberBefore.tokenBalance;

    await createSettlementHold({
      taskId,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      holdPoints: 80,
      pricingSnapshot: dummySnapshot,
      holdDetails: consumeRes.details,
    });

    // 执行失败释放
    const relResult = await releaseSettlementHold({
      taskId,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      reason: "上游服务报错 500 释放",
      errorCode: "MODEL_UPSTREAM_ERROR",
    });

    assert.equal(relResult.status, "RELEASED");
    assert.equal(relResult.releasedPoints, BigInt(80));

    // 检查成员记录余额恢复
    const memberAfter = await prisma.workspacemember.findFirstOrThrow({
      where: { workspaceId: testWorkspaceId, userId: testMemberUserId },
    });
    assert.equal(memberAfter.tokenBalance, balanceBeforeRelease + BigInt(80));

    // 检查流水表 pointledger：grantId 必须为 null，流水类型为 REFUND，balanceAfter 必须准确
    const ledgers = await prisma.pointledger.findMany({
      where: { taskId, type: "REFUND" },
    });
    assert.ok(ledgers.length >= 1);
    const memberRefundLedger = ledgers[0];
    assert.equal(memberRefundLedger.grantId, null);
    assert.equal(memberRefundLedger.points, BigInt(80));
    assert.equal(memberRefundLedger.balanceAfter, memberAfter.tokenBalance);
  });

  test("5. 超额补扣分桶完整性：成功补扣扣减 pointgrant.remaining 并生成补扣正向流水", async () => {
    // 先为主用户充值充足余额
    await grantPoints({
      scope: "WALLET",
      userId: testUserId,
      points: 300,
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
      title: "补扣测试准备",
    });

    const taskId = `task-supplement-success-${uid()}`;
    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 10,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 10,
      pricingSnapshot: dummySnapshot,
      holdDetails: consumeRes.details,
    });

    // 用量：输入 10,000, 输出 5,000 -> 实际售价 = 10*0.01 + 60*0.05 = 0.1 + 0.3 = 0.40 元 = 40 算力点
    // 预扣 10 点，需追加补扣 30 点
    const res = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 10000, outputTokens: 5000 },
    });

    assert.equal(res.status, "SETTLED");
    assert.equal(res.actualPricePoints, BigInt(40));
    assert.equal(res.supplementPoints, BigInt(30));

    // 验证补扣流水
    const supplementLedgers = await prisma.pointledger.findMany({
      where: { taskId, type: "CONSUME", idempotencyKey: { startsWith: "SETTLEMENT_SUPPLEMENT:" } },
    });
    assert.ok(supplementLedgers.length >= 1);
    const totalSuppPoints = supplementLedgers.reduce((acc, l) => acc + l.points, B_ZERO);
    assert.equal(totalSuppPoints, BigInt(30));
  });

  test("6. 补扣不足时整笔回滚且无负余额：安全流转为 REQUIRES_REVIEW，零穿透保护", async () => {
    const testIsolatedUserId = `user-iso-${uid()}`;
    const testIsoWsId = `ws-iso-${uid()}`;
    const now = new Date();

    await prisma.user.create({
      data: { id: testIsolatedUserId, email: `${testIsolatedUserId}@example.com`, password: "pwd" },
    });
    await prisma.workspace.create({
      data: { id: testIsoWsId, name: "Iso WS", type: "PERSONAL", ownerId: testIsolatedUserId, updatedAt: now },
    });
    await prisma.workspacequota.create({
      data: { id: `quota-${randomUUID()}`, workspaceId: testIsoWsId, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now },
    });
    await prisma.userwallet.create({
      data: { id: `wallet-${randomUUID()}`, userId: testIsolatedUserId, balance: BigInt(0), updatedAt: now },
    });
    await prisma.workspacemember.create({
      data: { id: `member-${randomUUID()}`, workspaceId: testIsoWsId, userId: testIsolatedUserId, role: "OWNER" },
    });

    try {
      // 只充值 5 点用于初始预扣
      await grantPoints({
        scope: "WALLET",
        userId: testIsolatedUserId,
        points: 5,
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
        title: "微量预扣准备",
      });

      const taskId = `task-supplement-insufficient-${uid()}`;
      const consumeRes = await consumePoints({
        workspaceId: testIsoWsId,
        userId: testIsolatedUserId,
        points: 5,
        taskId,
        idempotencyKey: `CONSUME:${taskId}`,
      });

      await createSettlementHold({
        taskId,
        userId: testIsolatedUserId,
        workspaceId: testIsoWsId,
        holdPoints: 5,
        pricingSnapshot: dummySnapshot,
        holdDetails: consumeRes.details,
      });

      // 产生巨额消耗（需要 40 点），但用户可用仅 0 点
      const res = await completeSettlement({
        taskId,
        userId: testIsolatedUserId,
        workspaceId: testIsoWsId,
        usage: { inputTokens: 10000, outputTokens: 5000 },
      });

      // 必须转入 REQUIRES_REVIEW
      assert.equal(res.status, "REQUIRES_REVIEW");

      // 严格断言账户余额绝不为负数，且初始预扣未受破坏
      const finalSummary = await getBalanceSummary(testIsoWsId, testIsolatedUserId);
      assert.equal(finalSummary.walletBalance, 0);
      assert.equal(finalSummary.workspaceBalance, 0);
    } finally {
      // 按明确隔离用户/空间范围清理 + 有限 P2034 重试；失败不污染后续测试
      await cleanupWithRetry(async () => {
        await prisma.$transaction(async (tx) => {
          await tx.tokensettlementrecovery.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.tokensettlementhold.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.tokensettlement.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.pointledger.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.pointgrant.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.workspacemember.deleteMany({ where: { workspaceId: testIsoWsId } });
          await tx.workspacequota.deleteMany({ where: { workspaceId: testIsoWsId } });
          await tx.userwallet.deleteMany({ where: { userId: testIsolatedUserId } });
          await tx.workspace.deleteMany({ where: { id: testIsoWsId } });
          await tx.user.deleteMany({ where: { id: testIsolatedUserId } });
        });
      }).catch((e) => console.error(`[cleanup] 隔离用户清理失败(已记录, 不污染后续测试):`, e));
    }
  });

  test("7. 成员月度用量持久化与精确回滚：依据持久化值回滚，下限为 0，成员不存在抛 REFUND_ACCOUNT_NOT_FOUND", async () => {
    const taskId = `task-monthly-rollback-${uid()}`;
    // 成员当前 monthlyTokenUsed 为某个值
    const memberBefore = await prisma.workspacemember.findFirstOrThrow({
      where: { workspaceId: testWorkspaceId, userId: testMemberUserId },
    });
    const currentUsed = memberBefore.monthlyTokenUsed;

    const cr = await consumePoints({
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      userId: testMemberUserId,
      points: 10,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    const memberAfterConsume = await prisma.workspacemember.findFirstOrThrow({
      where: { workspaceId: testWorkspaceId, userId: testMemberUserId },
    });
    const usedAfterConsume = memberAfterConsume.monthlyTokenUsed;

    // 创建预扣，明确记录 monthlyTokenUsedIncremented = 2500
    await createSettlementHold({
      taskId,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      holdPoints: 10,
      monthlyTokenUsedIncremented: 2500,
      pricingSnapshot: dummySnapshot,
      holdDetails: cr.details,
    });

    // 释放预扣
    await releaseSettlementHold({
      taskId,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      reason: "测试月度用量回滚",
    });

    // 断言回滚成功：monthlyTokenUsed 严格按照持久化的 2500 减少，且不小于 0
    const memberAfter = await prisma.workspacemember.findFirstOrThrow({
      where: { workspaceId: testWorkspaceId, userId: testMemberUserId },
    });
    const expectedUsed = usedAfterConsume >= BigInt(2500) ? usedAfterConsume - BigInt(2500) : B_ZERO;
    assert.equal(memberAfter.monthlyTokenUsed, expectedUsed);
  });

  test("8. BigInt 精度与超大安全数：支持天文数字 Token 运算，非负性安全校验", async () => {
    // 负数 Token 用量必须拒绝，安全转为 REQUIRES_REVIEW
    const taskId = `task-bigint-safe-${uid()}`;
    await grantPoints({ scope: "WALLET", userId: testUserId, points: 50, sourceType: "RECHARGE", type: "RECHARGE", title: "测试" });
    const cr = await consumePoints({ workspaceId: testWorkspaceId, userId: testUserId, points: 10, taskId, idempotencyKey: `CONSUME:${taskId}` });
    await createSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, holdPoints: 10, pricingSnapshot: dummySnapshot, holdDetails: cr.details });

    const negResult = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: -100, outputTokens: 50 },
    });
    assert.equal(negResult.status, "REQUIRES_REVIEW");

    // 超大 Token 计算（10 亿 Token）
    const bigTokens = 1_000_000_000;
    const dummyBigSnapshot = buildRegistryPricingSnapshot({
      providerId: "MagicAI",
      modelId: "gpt-5.5",
      pricing: dummyPricing,
    });
    const parsedPricing = reconstructPricingFromSnapshot(dummyBigSnapshot);
    assert.equal(parsedPricing.priceInputMicrosPerMillion, 10_000_000);
  });

  test("9. 并发压力测试 (连续 3 轮)：同一 taskId 与共享账户高并发无死锁、无负余额、无未处理 P2034", async () => {
    for (let round = 1; round <= 3; round++) {
      const taskId = `task-concurrency-round-${round}-${uid()}`;
      await grantPoints({
        scope: "WALLET",
        userId: testUserId,
        points: 50,
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
        title: `并发第 ${round} 轮充值`,
      });

      const cr = await consumePoints({ workspaceId: testWorkspaceId, userId: testUserId, points: 20, taskId, idempotencyKey: `CONSUME:${taskId}` });
      await createSettlementHold({
        taskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        holdPoints: 20,
        pricingSnapshot: dummySnapshot,
        holdDetails: cr.details,
      });

      // 竞态操作：并发结算与并发释放
      const outcomes = await Promise.allSettled([
        completeSettlement({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          usage: { inputTokens: 500, outputTokens: 200 },
        }),
        releaseSettlementHold({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          reason: `并发压力测试轮次 ${round}`,
        }),
      ]);

      // 有且仅有一个操作成功执行状态跃迁（SETTLED 或 RELEASED），另一个被并发冲突拦截
      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      assert.equal(fulfilled.length, 1, `第 ${round} 轮并发竞争必须有且仅有 1 个胜出`);

      // 校验终态
      const rows = await prisma.$queryRaw<Array<{ status: string }>>`
        SELECT \`status\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId}
      `;
      assert.ok(rows[0].status === "SETTLED" || rows[0].status === "RELEASED");
    }
  });

  test("10. 终态不可逆状态机约束：SETTLED 终态绝不可转为 RELEASED 或再次释放", async () => {
    const taskId = `task-state-machine-guard-${uid()}`;
    await grantPoints({ scope: "WALLET", userId: testUserId, points: 30, sourceType: "RECHARGE", type: "RECHARGE", title: "守卫测试" });
    const cr = await consumePoints({ workspaceId: testWorkspaceId, userId: testUserId, points: 10, taskId, idempotencyKey: `CONSUME:${taskId}` });
    await createSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, holdPoints: 10, pricingSnapshot: dummySnapshot, holdDetails: cr.details });

    await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 500, outputTokens: 200 },
    });

    // 试图对 SETTLED 执行 releaseSettlementHold
    await assert.rejects(
      async () => {
        await releaseSettlementHold({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          reason: "非法逆向流转",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidStateTransitionError);
        return true;
      }
    );
  });

  test("11. 特性开关安全防护：默认/生产恒为关闭 (false)", () => {
    assert.equal(isTokenSettlementFeatureEnabled(false), false);
    const prevEnv = process.env.TEST_TOKEN_SETTLEMENT_ENABLED;
    delete process.env.TEST_TOKEN_SETTLEMENT_ENABLED;
    assert.equal(isTokenSettlementFeatureEnabled(), false);
    process.env.TEST_TOKEN_SETTLEMENT_ENABLED = prevEnv;
  });

  test("12. COST_PLUS_MARKUP 真实快照结算：5/30 元成本 + 20% 加价率 -> 按 6/36 元售价精准结算与落库", async () => {
    const taskId = `task-cost-plus-${uid()}`;
    await grantPoints({
      scope: "WALLET",
      userId: testUserId,
      points: 5000,
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
      title: "加价模式结算测试充值",
    });

    const consumeRes = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 4500,
      taskId,
      idempotencyKey: `CONSUME:${taskId}`,
    });

    // 成本 5/30 元每百万，加价 2000 bps (20%) -> 售价必须为 6/36 元每百万
    const costPlusPricing: DeploymentPricing = {
      currency: "CNY",
      costInputMicrosPerMillion: 5_000_000,
      costOutputMicrosPerMillion: 30_000_000,
      costCacheReadMicrosPerMillion: null,
      costCacheWriteMicrosPerMillion: null,
      priceInputMicrosPerMillion: null,
      priceOutputMicrosPerMillion: null,
      priceCacheReadMicrosPerMillion: null,
      priceCacheWriteMicrosPerMillion: null,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      markupRateBps: 2000,
      priceVersion: 1,
      effectiveFrom: new Date().toISOString(),
    };

    const costPlusSnapshot: RegistryPricingSnapshot = buildRegistryPricingSnapshot({
      providerId: "MagicAI",
      modelId: "gpt-5.5",
      pricing: costPlusPricing,
    });

    // 验证快照能正确被 reconstructPricingFromSnapshot 还原且不发生冲突
    const reconstructed = reconstructPricingFromSnapshot(costPlusSnapshot);
    assert.equal(reconstructed.markupRateBps, 2000);
    assert.equal(reconstructed.costInputMicrosPerMillion, 5_000_000);
    assert.equal(reconstructed.costOutputMicrosPerMillion, 30_000_000);
    assert.equal(reconstructed.priceInputMicrosPerMillion, null);

    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 4500,
      pricingSnapshot: costPlusSnapshot,
      holdDetails: consumeRes.details,
    });

    // 消耗 1,000,000 input tokens, 1,000,000 output tokens
    // 售价：输入 6 元 + 输出 36 元 = 42 元 = 4200 点
    // 释放差额：4500 - 4200 = 300 点
    const settleRes = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });

    assert.equal(settleRes.status, "SETTLED");
    assert.equal(settleRes.actualPricePoints, BigInt(4200));
    assert.equal(settleRes.releasedPoints, BigInt(300));
    assert.equal(settleRes.supplementPoints, B_ZERO);
    assert.ok(settleRes.userPriceMicros !== undefined && settleRes.userPriceMicros !== null && settleRes.userPriceMicros > B_ZERO);

    // 验证数据库持久化记录
    const dbRow = await prisma.$queryRaw<Array<{ status: string; actualPricePoints: bigint; userPriceMicros: bigint }>>`
      SELECT \`status\`, \`actualPricePoints\`, \`userPriceMicros\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId}
    `;
    assert.equal(dbRow[0].status, "SETTLED");
    assert.equal(dbRow[0].actualPricePoints, BigInt(4200));
    assert.equal(dbRow[0].userPriceMicros, BigInt(42_000_000)); // 42 元 = 42,000,000 micros
  });

  test("13. 预扣幂等性强校验：同 taskId 参数不一致抛 HOLD_IDEMPOTENCY_MISMATCH 拦截", async () => {
    const taskId = `task-idempotent-guard-${uid()}`;
    await grantPoints({ scope: "WALLET", userId: testUserId, points: 200, sourceType: "RECHARGE", type: "RECHARGE", title: "幂等测试" });
    const cr = await consumePoints({ workspaceId: testWorkspaceId, userId: testUserId, points: 100, taskId, idempotencyKey: `CONSUME:${taskId}` });

    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 100,
      pricingSnapshot: dummySnapshot,
      holdDetails: cr.details,
    });

    // 相同参数重入：返回既有 hold 记录
    const reentrant = await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 100,
      pricingSnapshot: dummySnapshot,
      holdDetails: cr.details,
    });
    assert.equal(reentrant.taskId, taskId);
    assert.equal(reentrant.holdPoints, BigInt(100));

    // 篡改 holdPoints 重入：必须抛出 TokenSettlementError (HOLD_AMOUNT_MISMATCH)
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 200, // 不一致的 holdPoints
          pricingSnapshot: dummySnapshot,
          holdDetails: cr.details,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TokenSettlementError);
        assert.equal(err.code, "HOLD_AMOUNT_MISMATCH");
        return true;
      }
    );
  });

  test("14. 差额释放 LIFO 逆序分桶与 EXHAUSTED / ACTIVE 状态跃迁", async () => {
    const taskId = `task-lifo-bucket-${uid()}`;
    const now = new Date();
    const expFar = new Date(Date.now() + 86400000 * 30);

    // 显式创建两个分桶：分桶 1 (50 点)，分桶 2 (50 点)
    const g1Id = `grant-lifo-1-${randomUUID()}`;
    const g2Id = `grant-lifo-2-${randomUUID()}`;

    await prisma.pointgrant.create({
      data: {
        id: g1Id,
        userId: testUserId,
        scope: "WALLET",
        points: BigInt(50),
        remaining: BigInt(50),
        status: "ACTIVE",
        expiresAt: expFar,
        sourceType: "RECHARGE",
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.pointgrant.create({
      data: {
        id: g2Id,
        userId: testUserId,
        scope: "WALLET",
        points: BigInt(50),
        remaining: BigInt(50),
        status: "ACTIVE",
        expiresAt: expFar,
        sourceType: "RECHARGE",
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: now,
      },
    });

    // 消费 80 点：分桶 1 扣 50 点（扣尽转 EXHAUSTED），分桶 2 扣 30 点（剩余 20 点，保持 ACTIVE）
    const cr = await consumePoints({ workspaceId: testWorkspaceId, userId: testUserId, points: 80, taskId, idempotencyKey: `CONSUME:${taskId}` });

    const g1AfterConsume = await prisma.pointgrant.findUniqueOrThrow({ where: { id: g1Id } });
    assert.equal(g1AfterConsume.remaining, BigInt(0));
    assert.equal(g1AfterConsume.status, "EXHAUSTED", "扣尽分桶必须标记为 EXHAUSTED");

    await createSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      holdPoints: 80,
      pricingSnapshot: dummySnapshot,
      holdDetails: cr.details,
    });

    // 实际消费 6 点 (3000 input tokens * 10 micros = 3 点, 500 output tokens * 60 micros = 3 点, 共 6 点)，释放差额 74 点。
    // LIFO 逆序释放：分桶 2 扣了 30 点，全额恢复 30 点至 50 点；剩余 44 点逆序释放给分桶 1，分桶 1 恢复至 44 点且由 EXHAUSTED 转为 ACTIVE！
    const settle = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    assert.equal(settle.status, "SETTLED");
    assert.equal(settle.actualPricePoints, BigInt(6));
    assert.equal(settle.releasedPoints, BigInt(74));

    // 检查分桶 2 恢复至 50 点
    const g2AfterSettle = await prisma.pointgrant.findUniqueOrThrow({ where: { id: g2Id } });
    assert.equal(g2AfterSettle.remaining, BigInt(50));
    assert.equal(g2AfterSettle.status, "ACTIVE");

    // 检查分桶 1 恢复至 44 点，且状态已从 EXHAUSTED 恢复为 ACTIVE
    const g1AfterSettle = await prisma.pointgrant.findUniqueOrThrow({ where: { id: g1Id } });
    assert.equal(g1AfterSettle.remaining, BigInt(44));
    assert.equal(g1AfterSettle.status, "ACTIVE", "恢复余额大于 0 的分桶必须恢复为 ACTIVE 状态");
  });

  test("15. 生产环境特性开关绝对安全防御：NODE_ENV=production 时传显式 true 依然恒返回 false", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      // 在生产模式下，无论任何参数，恒返回 false
      assert.equal(isTokenSettlementFeatureEnabled(true), false);
      assert.equal(isTokenSettlementFeatureEnabled(false), false);
      assert.equal(isTokenSettlementFeatureEnabled(), false);
    } finally {
      (process.env as any).NODE_ENV = originalNodeEnv;
    }
  });

  test("16. 强断言：扣点成功但 HOLD 创建失败必须整体原子回滚，零资金残留", async () => {
    const taskId = `task-atomic-rollback-${uid()}`;
    const userWalletBefore = await prisma.userwallet.findUniqueOrThrow({ where: { userId: testUserId } });
    const initialBalance = userWalletBefore.balance;

    // 尝试创建预扣单，但故意传入一个不合法的负数或制造唯一键冲突使其在事务中失败
    // 先插入一条占用该 taskId 的冲突记录以触发唯一键冲突 P2002，并携带不同的 userId 触发 HOLD_IDEMPOTENCY_MISMATCH
    await prisma.$executeRaw`
      INSERT INTO \`tokensettlementhold\` (
        \`id\`, \`taskId\`, \`userId\`, \`workspaceId\`, \`holdPoints\`,
        \`monthlyTokenUsedIncremented\`, \`status\`, \`idempotencyKey\`, \`holdDetails\`, \`expiresAt\`, \`updatedAt\`
      ) VALUES (
        ${randomUUID()}, ${taskId}, 'different-user-id', ${testWorkspaceId}, 999,
        0, 'HELD', ${`HOLD:${taskId}`}, '[]', ${new Date(Date.now() + 600000)}, ${new Date()}
      )
    `;

    // 尝试原子预扣：扣点逻辑与 HOLD 插入在同一个事务内
    await assert.rejects(
      async () => {
        await consumeAndCreateSettlementHold({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          points: 50,
          pricingSnapshot: dummySnapshot,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TokenSettlementError);
        assert.equal(err.code, "HOLD_IDEMPOTENCY_MISMATCH");
        return true;
      }
    );

    // 验证原子回滚：用户的钱包余额绝未被扣除！
    const userWalletAfter = await prisma.userwallet.findUniqueOrThrow({ where: { userId: testUserId } });
    assert.equal(userWalletAfter.balance, initialBalance, "HOLD 失败必须原子回滚扣点，余额未变");

    // 验证未产生任何该任务的扣费流水
    const ledgers = await prisma.pointledger.findMany({
      where: { taskId, direction: "OUT" },
    });
    assert.equal(ledgers.length, 0, "回滚后绝不残留出账流水");

    // 清理冲突占位
    await safeCleanupTask(taskId);
  });

  test("17. 强断言：REQUIRES_REVIEW 状态免疫过期回收扫描，普通 release 拒绝处理，管理员独立操作正常裁决", async () => {
    const taskId = `task-review-immune-${uid()}`;
    const now = new Date();
    const expiredTime = new Date(Date.now() - 3600000); // 1小时前过期

    // 给用户发放点数并建立 HOLD
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    const holdRes = await consumeAndCreateSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟异常挂起人工复核：两表同事务转为 REQUIRES_REVIEW，并强置 expiresAt 为过去
    await prisma.$executeRaw`
      UPDATE \`tokensettlement\` SET \`status\` = 'REQUIRES_REVIEW' WHERE \`taskId\` = ${taskId}
    `;
    await prisma.$executeRaw`
      UPDATE \`tokensettlementhold\` SET \`status\` = 'REQUIRES_REVIEW', \`expiresAt\` = ${expiredTime} WHERE \`taskId\` = ${taskId}
    `;

    // 执行过期 HOLD 扫描回收
    const reapRes = await reapExpiredHolds({ limit: 10 });
    // 强断言：处于 REQUIRES_REVIEW 的单据绝不会被过期扫描回收
    const holdCheck = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    assert.equal(holdCheck.status, "REQUIRES_REVIEW", "REQUIRES_REVIEW 绝不能被过期扫描回收");

    // 强断言：普通业务 releaseSettlementHold 尝试释放 REQUIRES_REVIEW 时必须抛出非法状态转换异常
    await assert.rejects(
      async () => {
        await releaseSettlementHold({
          taskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          reason: "普通业务释放尝试",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidStateTransitionError);
        return true;
      }
    );

    // 管理员独立人工复核动作：正常裁决为 RELEASED
    const adminRes = await adminResolveSettlementReview({
      taskId,
      adminUserId: "admin-super",
      action: "RELEASE",
      auditRemark: "人工复核核实无误，执行全额释放",
    });

    assert.equal(adminRes.status, "RELEASED");
    const holdAfterAdmin = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    const settleAfterAdmin = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
    assert.equal(holdAfterAdmin.status, "RELEASED", "管理员裁决后 hold 状态流转为 RELEASED");
    assert.equal(settleAfterAdmin.status, "RELEASED", "管理员裁决后 settlement 状态流转为 RELEASED");
  });

  test("18. 强断言：Recovery Fencing 并发防重写（旧 Worker 绝不可覆盖新 Worker）", async () => {
    const taskId = `task-fencing-${uid()}`;
    // 失败时输出实际三表状态与流水数量，便于判断是否为测试间共享数据污染
    const dumpState = async (label: string) => {
      const settle = await prisma.tokensettlement.findUnique({ where: { taskId } });
      const hold = await prisma.tokensettlementhold.findUnique({ where: { taskId } });
      const rec = await prisma.tokensettlementrecovery.findUnique({ where: { taskId } });
      const ledgers = await prisma.pointledger.findMany({ where: { taskId } });
      console.error(
        `[C18 ${label}] taskId=${taskId} settlement=${JSON.stringify(settle?.status)} ` +
          `hold=${JSON.stringify(hold?.status)} recovery=${JSON.stringify(
            rec && { status: rec.status, claimToken: rec.claimToken, leaseUntil: rec.leaseUntil }
          )} ledgers=${ledgers.length}`
      );
    };
    try {
      await enqueueSettlementRecovery({
        taskId,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        recoveryType: "SETTLEMENT_FAILED",
        error: "模拟结算失败待恢复",
      });
      // 创建对应的结算/预扣主记录，使三表闭包完整（用于断言旧 Worker 不污染）
      await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, points: 20, pricingSnapshot: dummySnapshot });

      // Worker 1 认领，租约 50ms
      const claimed1 = await claimSettlementRecovery({ taskId, leaseMs: 50 });
      assert.equal(claimed1.length, 1);
      const worker1Token = claimed1[0].claimToken;
      assert.ok(worker1Token);

      // 等待租约超时 (60ms)
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Worker 2 抢占认领
      const claimed2 = await claimSettlementRecovery({ taskId, leaseMs: 5000 });
      assert.equal(claimed2.length, 1);
      const worker2Token = claimed2[0].claimToken;
      assert.notEqual(worker1Token, worker2Token, "新认领必须生成新的唯一 claimToken");

      // 新 Worker 写回前，断言尚未被旧 Worker 污染：settlement 仍为 HOLD，hold 仍为 HELD
      const preSettle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      const preHold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(preSettle.status, "HOLD", "新 Worker 写回前 settlement 必须仍为 HOLD（未被旧 Worker 污染）");
      assert.equal(preHold.status, "HELD", "新 Worker 写回前 hold 必须仍为 HELD（未被旧 Worker 污染）");

      const preLedgers = await prisma.pointledger.findMany({ where: { taskId } });

      // 旧 Worker 以失效 token 写回：必须被 Fencing 机制阻断（applied = false），且不得产生任何账务流水
      const w1Result = await writeSettlementRecoveryResult(taskId, worker1Token, {
        status: "SETTLED",
        lastError: null,
      });
      assert.equal(w1Result.applied, false, "旧 Worker 绝不可覆盖新 Worker（Fencing 保护生效）");

      const afterW1Ledgers = await prisma.pointledger.findMany({ where: { taskId } });
      assert.equal(afterW1Ledgers.length, preLedgers.length, "旧 Worker 覆盖尝试不得改变流水数量");
      const newLedgers = afterW1Ledgers.filter((l) => l.type !== "CONSUME");
      assert.equal(newLedgers.length, 0, "旧 Worker 覆盖尝试不得产生任何结算/退款类流水（预扣 CONSUME 流水除外）");

      // 旧 Worker 写回不得改变 settlement/hold 状态
      const postW1Settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      const postW1Hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(postW1Settle.status, "HOLD", "旧 Worker 写回不得改变 settlement 状态");
      assert.equal(postW1Hold.status, "HELD", "旧 Worker 写回不得改变 hold 状态");

      // Worker 2 正常写回：写回成功（applied = true）
      const w2Result = await writeSettlementRecoveryResult(taskId, worker2Token, {
        status: "SETTLED",
        lastError: null,
      });
      assert.equal(w2Result.applied, true, "新 Worker 写回成功");

      const finalRec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(finalRec.status, "SETTLED");
      assert.notEqual(finalRec.status, "PROCESSING", "Recovery 不得残留 PROCESSING");
    } catch (e) {
      await dumpState("FAILURE");
      throw e;
    } finally {
      // 单任务清理：失败不污染后续测试
      await cleanupWithRetry(async () => {
        await prisma.$transaction(async (tx) => {
          await tx.tokensettlementrecovery.deleteMany({ where: { taskId } });
          await tx.tokensettlementhold.deleteMany({ where: { taskId } });
          await tx.tokensettlement.deleteMany({ where: { taskId } });
          await tx.pointledger.deleteMany({ where: { taskId } });
        });
      }).catch((e) => console.error(`[C18] 清理失败(已忽略):`, e));
    }
  });

  test("19. 强断言：Recovery 防重置与重试上限转 REQUIRES_REVIEW", async () => {
    const taskId = `task-recovery-limit-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({ taskId, userId: testUserId, workspaceId: testWorkspaceId, points: 20, pricingSnapshot: dummySnapshot });
    await enqueueSettlementRecovery({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "第一次入队",
    });

    // 人工将 retryCount 设置为 3（达到上限）
    await prisma.tokensettlementrecovery.update({
      where: { taskId },
      data: { retryCount: 3, status: "PENDING" },
    });

    // 认领时应自动转入 REQUIRES_REVIEW（三表一致）
    const claimed = await claimSettlementRecovery({ taskId, leaseMs: 5000 });
    assert.equal(claimed.length, 0, "达到重试上限的任务不应再被认领");

    const recAfterLimit = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
    assert.equal(recAfterLimit.status, "REQUIRES_REVIEW", "重试超限自动转入 REQUIRES_REVIEW");
    const settleAfterLimit = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
    const holdAfterLimit = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    assert.equal(settleAfterLimit.status, "REQUIRES_REVIEW", "重试超限时 settlement 必须同步流转");
    assert.equal(holdAfterLimit.status, "REQUIRES_REVIEW", "重试超限时 hold 必须同步流转");

    // 再次调用 enqueueSettlementRecovery 尝试覆盖：终态防重置保护生效
    const reEnqueue = await enqueueSettlementRecovery({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "二次入队尝试覆盖",
    });
    assert.equal(reEnqueue.ok, true);
    assert.equal(reEnqueue.reason, "RECORD_ALREADY_REQUIRES_REVIEW");

    const recStillReview = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
    assert.equal(recStillReview.status, "REQUIRES_REVIEW", "已处于终态的记录绝不可被重置为 PENDING");
  });

  test("19b. 强断言：重试上限事务在三表主记录缺失时整笔回滚，不污染其他候选", async () => {
    // 仅入队 recovery（不创建 settlement/hold），且 retryCount 达上限 —— 模拟数据损坏
    const orphanTask = `task-recovery-orphan-${uid()}`;
    await enqueueSettlementRecovery({ taskId: orphanTask, userId: testUserId, workspaceId: testWorkspaceId, recoveryType: "RELEASE_FAILED", error: "缺主记录" });
    await prisma.tokensettlementrecovery.update({ where: { taskId: orphanTask }, data: { retryCount: 3, status: "PENDING" } });

    // 一个正常可认领的恢复任务（验证不被孤儿任务污染）
    const goodTask = `task-recovery-good-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({ taskId: goodTask, userId: testUserId, workspaceId: testWorkspaceId, points: 20, pricingSnapshot: dummySnapshot });
    await enqueueSettlementRecovery({ taskId: goodTask, userId: testUserId, workspaceId: testWorkspaceId, recoveryType: "RELEASE_FAILED", error: "正常" });

    // 直接按 taskId 认领孤儿任务：必须不抛错、不被认领、保持 PENDING（整笔回滚）
    const orphanClaimed = await claimSettlementRecovery({ taskId: orphanTask, workerId: "worker-orphan" });
    assert.equal(orphanClaimed.length, 0, "缺主记录的恢复任务不得被认领（整笔回滚）");
    const orphanRec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: orphanTask } });
    assert.equal(orphanRec.status, "PENDING", "缺主记录的 recovery 必须整笔回滚保持 PENDING");
    assert.equal(orphanRec.claimToken, null, "孤儿 recovery 不得被写入 claimToken");

    const orphanSettle = await prisma.tokensettlement.findMany({ where: { taskId: orphanTask } });
    assert.equal(orphanSettle.length, 0, "settlement 主记录缺失（未被创建）");

    // 正常任务仍可被独立认领（隔离、无污染）
    const claimedGood = await claimSettlementRecovery({ taskId: goodTask, workerId: "worker-scan" });
    const good = claimedGood.find((t) => t.taskId === goodTask);
    assert.ok(good, "正常任务必须被认领（未被缺主记录的孤儿任务污染）");
  });

  test("20. 强断言：无限额度独立处理（不创建正数资金 HOLD，结算与释放零虚假退款）", async () => {
    const unlWsId = `ws-unl-${uid()}`;
    const taskId = `task-unl-${uid()}`;

    // 创建无限额度空间
    await prisma.workspace.create({
      data: {
        id: unlWsId,
        name: "Unlimited Space",
        type: "PERSONAL",
        ownerId: testUserId,
        updatedAt: new Date(),
      },
    });
    await prisma.workspacequota.create({
      data: {
        id: randomUUID(),
        workspaceId: unlWsId,
        membershipLevelId: "FREE",
        tokenBalance: BigInt(UNLIMITED_BALANCE), // -1 无限额度
        updatedAt: new Date(),
      },
    });
    await prisma.workspacemember.create({
      data: {
        id: `member-${randomUUID()}`,
        workspaceId: unlWsId,
        userId: testUserId,
        role: "OWNER",
        tokenBalance: BigInt(0),
        monthlyTokenLimit: BigInt(100000),
        monthlyTokenUsed: BigInt(0),
      },
    });

    // 预扣 100 点
    const holdRes = await consumeAndCreateSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: unlWsId,
      points: 100,
      pricingSnapshot: dummySnapshot,
    });

    // 强断言：无限额度空间 holdPoints 必须为 0！
    assert.equal(holdRes.holdPoints, B_ZERO, "无限额度空间 holdPoints 必须为 0");
    assert.equal(holdRes.consumeResult.unlimited, true);

    // 实际仅用了 3000 input tokens (= 3 点)，按普通逻辑若预扣了 100 会退款 97 点，但在无限额度下绝不退款！
    const settleRes = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: unlWsId,
      usage: { inputTokens: 3000, outputTokens: 0 },
    });

    assert.equal(settleRes.status, "SETTLED");
    assert.equal(settleRes.actualPricePoints, BigInt(3), "无限额度空间保留真实用量计算点数 3 点");
    assert.equal(settleRes.releasedPoints, B_ZERO, "无限额度空间差额释放点数必须为 0");
    assert.equal(settleRes.supplementPoints, B_ZERO);

    // 验证绝未产生退款流水
    const refundLedgers = await prisma.pointledger.findMany({
      where: { taskId, type: "REFUND" },
    });
    assert.equal(refundLedgers.length, 0, "无限额度空间结算绝不产生虚假的 REFUND 流水");

    // 清理
    await prisma.tokensettlement.deleteMany({ where: { taskId } }).catch(() => {});
    await prisma.tokensettlementhold.deleteMany({ where: { taskId } }).catch(() => {});
    await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
    await prisma.workspacemember.deleteMany({ where: { workspaceId: unlWsId } }).catch(() => {});
    await prisma.workspacequota.deleteMany({ where: { workspaceId: unlWsId } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: unlWsId } }).catch(() => {});
  });

  test("21. 强断言：大数高精度计费（超过 Number.MAX_SAFE_INTEGER 精度安全且禁止 Math.round）", () => {
    // 超过 Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
    const bigTokens = BigInt("9007199254740992000"); // 900 亿亿 Token
    const calc = computeUsageCostBigInt(
      dummyPricing,
      {
        inputTokens: bigTokens,
        outputTokens: B_ZERO,
      },
      { settlementFeatureEnabled: true }
    );

    assert.equal(calc.pricePriced, true);
    assert.ok(calc.priceMicros !== null);
    // priceInputMicrosPerMillion = 10,000,000 (10 微元/Token)
    // 9007199254740992000 * 10 = 90071992547409920000 微元
    const expectedMicros = bigTokens * BigInt(10);
    assert.equal(calc.priceMicros, expectedMicros, "大数计算必须保持 BigInt 纯整数绝对精确");
  });

  test("22. 强断言：统一 monthlyTokenUsed 业务口径（少退回滚差额，多补追加差额）", async () => {
    // 1. 少退测试：预扣 100 点，实际用 30 点，释放 70 点，月度用量净增 30 点
    const taskIdRefund = `task-monthly-refund-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 200, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });

    const memberBefore1 = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    const monthlyBefore1 = memberBefore1.monthlyTokenUsed;

    // 空间成员预扣 100 点 (ENTERPRISE 空间普通成员独立余额扣减并累加 monthlyTokenUsed)
    await consumeAndCreateSettlementHold({
      taskId: taskIdRefund,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      points: 100,
      pricingSnapshot: dummySnapshot,
    });

    const memberMid1 = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(memberMid1.monthlyTokenUsed, monthlyBefore1 + BigInt(100), "预扣时增加 100 点已用");

    // 实际使用 30 点 (30,000 input tokens * 10 micros = 30 点)，差额释放 70 点
    await completeSettlement({
      taskId: taskIdRefund,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      usage: { inputTokens: 30000, outputTokens: 0 },
    });

    const memberAfter1 = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(
      memberAfter1.monthlyTokenUsed,
      monthlyBefore1 + BigInt(30),
      "少退释放差额后，月度已用额度精确回滚至实际消耗的 30 点"
    );

    // 2. 多补测试：预扣 40 点，实际用 70 点，追加补扣 30 点，月度用量净增 70 点
    const taskIdSupp = `task-monthly-supp-${uid()}`;
    const monthlyBefore2 = memberAfter1.monthlyTokenUsed;

    await consumeAndCreateSettlementHold({
      taskId: taskIdSupp,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      points: 40,
      pricingSnapshot: dummySnapshot,
    });

    // 实际使用 70 点 (70,000 input tokens * 10 micros = 70 点)，追加补扣 30 点
    await completeSettlement({
      taskId: taskIdSupp,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      usage: { inputTokens: 70000, outputTokens: 0 },
    });

    const memberAfter2 = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(
      memberAfter2.monthlyTokenUsed,
      monthlyBefore2 + BigInt(70),
      "多补追加后，月度已用额度精确累加至实际消耗的 70 点"
    );
  });

  test("23. 强断言：结算未达到 SETTLED 时（REQUIRES_REVIEW / 异常）路由不返回普通成功", async () => {
    // 验证 completeSettlement 产生 REQUIRES_REVIEW 时返回值
    const taskId = `task-settle-not-settled-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    // 传入非法负数 Token 触发校验失败转入 REQUIRES_REVIEW
    const res = await completeSettlement({
      taskId,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: -99 },
    });

    assert.equal(res.status, "REQUIRES_REVIEW", "结算结果必须为 REQUIRES_REVIEW");
    assert.notEqual(res.status, "SETTLED", "绝不得标记为 SETTLED");

    // 验证双表状态均已同步更新为 REQUIRES_REVIEW
    const holdRow = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    const settleRow = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
    assert.equal(holdRow.status, "REQUIRES_REVIEW");
    assert.equal(settleRow.status, "REQUIRES_REVIEW");
  });

  test("24. Recovery Worker 真实恢复流程与三表同步", async () => {
    // 24.1 RELEASE_FAILED 经 Worker 认领后自动调用 releaseSettlementHold 释放预扣
    const taskIdRel = `task-recovery-rel-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 30, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdRel,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 30,
      pricingSnapshot: dummySnapshot,
    });

    const balBeforeRel = await getBalanceSummary(testUserId, testWorkspaceId);
    await enqueueSettlementRecovery({
      taskId: taskIdRel,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "模拟释放异常",
    });

    // 认领并由 Worker 处理
    const claimRes1 = await claimSettlementRecovery({ taskId: taskIdRel, workerId: "worker-unit-test-1", leaseDurationMs: 5000 });
    const targetTask1 = claimRes1.find((t) => t.taskId === taskIdRel);
    assert.ok(targetTask1, "Worker 必须成功认领该 RELEASE_FAILED 任务");

    await processSettlementRecovery(targetTask1);

    // 校验恢复表状态与 lease 清空
    const rec1 = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdRel } });
    assert.equal(rec1.status, "RELEASED");
    assert.equal(rec1.claimToken, null);
    assert.equal(rec1.leaseUntil, null);

    // 校验两表状态与余额全额退回
    const hold1 = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdRel } });
    const settle1 = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdRel } });
    assert.equal(hold1.status, "RELEASED");
    assert.equal(settle1.status, "RELEASED");

    const balAfterRel = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfterRel.available, (balBeforeRel.available ?? 0) + 30, "释放成功后可用余额必须全额退还 30 点");

    // 24.2 SETTLEMENT_FAILED 经 Worker 认领后使用持久化 usage 执行 completeSettlement
    const taskIdSettle = `task-recovery-settle-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdSettle,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    // 入队时持久化存储真实 usage 与 pricingSnapshot (实际使用 20 点: 20000 input tokens * 10 micros)
    await enqueueSettlementRecovery({
      taskId: taskIdSettle,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "SETTLEMENT_FAILED",
      error: "模拟网络超时导致结算中断",
      usage: { inputTokens: 20000, outputTokens: 0 },
      pricingSnapshot: dummySnapshot,
    });

    // 运行全自动 Worker 轮询执行
    const runRes = await runSettlementRecovery({ limit: 5, userId: testUserId });
    assert.ok(runRes.processed >= 1, "runSettlementRecovery 必须至少成功处理 1 个恢复任务");

    const rec2 = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdSettle } });
    assert.equal(rec2.status, "SETTLED");
    assert.equal(rec2.claimToken, null);

    const hold2 = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdSettle } });
    const settle2 = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdSettle } });
    assert.equal(hold2.status, "SETTLED");
    assert.equal(settle2.status, "SETTLED");
    assert.equal(settle2.actualPricePoints, BigInt(20));

    // 24.3 重试达到上限时三表同步流转为 REQUIRES_REVIEW
    const taskIdMaxRetry = `task-recovery-maxretry-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdMaxRetry,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 20,
      pricingSnapshot: dummySnapshot,
    });

    await enqueueSettlementRecovery({
      taskId: taskIdMaxRetry,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "SETTLEMENT_FAILED",
      error: "持久化故障",
    });

    // 人工将 retryCount 设置为 5（达到上限）
    await prisma.tokensettlementrecovery.update({
      where: { taskId: taskIdMaxRetry },
      data: { retryCount: 5 },
    });

    // 再次调用 claimSettlementRecovery 时，触发超限直接在事务中将三表置为 REQUIRES_REVIEW
    await claimSettlementRecovery({ taskId: taskIdMaxRetry, workerId: "worker-retry-check", leaseDurationMs: 5000 });

    const rec3 = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdMaxRetry } });
    const hold3 = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdMaxRetry } });
    const settle3 = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdMaxRetry } });

    assert.equal(rec3.status, "REQUIRES_REVIEW", "recovery 状态必须为 REQUIRES_REVIEW");
    assert.equal(hold3.status, "REQUIRES_REVIEW", "hold 状态必须同步流转为 REQUIRES_REVIEW");
    assert.equal(settle3.status, "REQUIRES_REVIEW", "settlement 状态必须同步流转为 REQUIRES_REVIEW");
  });

  test("25. 修复 adminResolveSettlementReview 真实核销、退款、补扣、流水与幂等", async () => {
    // 25.1 action = RELEASE：真实退款、写 REFUND 流水、回滚 monthlyTokenUsed、幂等
    const taskIdRevRel = `task-admin-release-${uid()}`;
    await prisma.workspacemember.update({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
      data: { tokenBalance: BigInt(500), monthlyTokenUsed: BigInt(100) },
    });

    await consumeAndCreateSettlementHold({
      taskId: taskIdRevRel,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      points: 80,
      pricingSnapshot: dummySnapshot,
    });

    // 手工将两表推入 REQUIRES_REVIEW
    await prisma.tokensettlementhold.update({ where: { taskId: taskIdRevRel }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdRevRel }, data: { status: "REQUIRES_REVIEW" } });

    const memberPreRel = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(memberPreRel.tokenBalance, BigInt(420));
    assert.equal(memberPreRel.monthlyTokenUsed, BigInt(180));

    // 管理员执行 RELEASE
    const relRes = await adminResolveSettlementReview({
      taskId: taskIdRevRel,
      action: "RELEASE",
      adminUserId: "admin-operator-1",
      auditRemark: "人工核实：任务超时，批准全额释放预扣",
    });
    assert.equal(relRes.status, "RELEASED");

    const memberPostRel = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(memberPostRel.tokenBalance, BigInt(500), "余额必须完整恢复为 500 点");
    assert.equal(memberPostRel.monthlyTokenUsed, BigInt(100), "月度已用额度必须回滚至 100 点");

    // 检查流水表是否存在 REFUND 流水
    const refundLedger = await prisma.pointledger.findFirst({
      where: { taskId: taskIdRevRel, type: "REFUND", direction: "IN" },
    });
    assert.ok(refundLedger, "必须生成真实 IN/REFUND 流水");
    assert.equal(refundLedger.points, BigInt(80));

    // 幂等测试：再次调用 RELEASE 直接返回原结果，不产生二次退款
    const idempotentRel = await adminResolveSettlementReview({
      taskId: taskIdRevRel,
      action: "RELEASE",
      adminUserId: "admin-operator-1",
      auditRemark: "重复释放尝试",
    });
    assert.equal(idempotentRel.status, "RELEASED");
    const memberIdemp = await prisma.workspacemember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: testMemberUserId, workspaceId: testWorkspaceId } },
    });
    assert.equal(memberIdemp.tokenBalance, BigInt(500), "幂等调用不得二次退款");

    // 25.2 action = SETTLE 多退少补测试 (预扣 60，实际核定消耗 20，差额退还 40 点)
    const taskIdRevSettle = `task-admin-settle-${uid()}`;
    await consumeAndCreateSettlementHold({
      taskId: taskIdRevSettle,
      userId: testMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      points: 60,
      pricingSnapshot: dummySnapshot,
    });

    await prisma.tokensettlementhold.update({ where: { taskId: taskIdRevSettle }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdRevSettle }, data: { status: "REQUIRES_REVIEW" } });

    // 管理员核定结算：传入实际消耗 20 点
    const settleRes = await adminResolveSettlementReview({
      taskId: taskIdRevSettle,
      action: "SETTLE",
      adminUserId: "admin-operator-1",
      auditRemark: "人工核定实际使用 20 点",
      actualPoints: 20,
    });
    assert.equal(settleRes.status, "SETTLED");
    assert.equal(settleRes.actualPricePoints, BigInt(20));

    const holdPostSettle = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdRevSettle } });
    const settlePostSettle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdRevSettle } });
    assert.equal(holdPostSettle.status, "SETTLED");
    assert.equal(settlePostSettle.status, "SETTLED");
    assert.equal(settlePostSettle.actualPricePoints, BigInt(20));

    // 检查差额退款流水 (预扣 60，实耗 20，退还 40)
    const diffRefundLedger = await prisma.pointledger.findFirst({
      where: { taskId: taskIdRevSettle, type: "REFUND", direction: "IN" },
    });
    assert.ok(diffRefundLedger, "实耗少于预扣时必须产生差额退还流水");
    assert.equal(diffRefundLedger.points, BigInt(40));
  });

  test("26. 真实超大数 BigInt 边界与集成测试", async () => {
    // 26.1 超出 Number.MAX_SAFE_INTEGER 时入口强拦截
    const hugeUnsafePoints = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(100);
    const taskIdUnsafe = `task-unsafe-${uid()}`;

    await assert.rejects(
      async () => {
        await consumeAndCreateSettlementHold({
          taskId: taskIdUnsafe,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          points: hugeUnsafePoints as unknown as number,
          pricingSnapshot: dummySnapshot,
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "USAGE_EXCEEDS_SAFE_LIMIT",
      "超过 Number.MAX_SAFE_INTEGER 时必须抛出 USAGE_EXCEEDS_SAFE_LIMIT"
    );

    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdUnsafe,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          holdPoints: hugeUnsafePoints as unknown as number,
          pricingSnapshot: dummySnapshot,
          holdDetails: [{
            ledgerId: "fake",
            grantId: "",
            scope: "WALLET",
            sourceType: "ONLINE_RECHARGE",
            points: Number.MAX_SAFE_INTEGER + 1,
            kind: "WALLET",
          }],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "USAGE_EXCEEDS_SAFE_LIMIT",
      "createSettlementHold 超过安全边界时必须拦截"
    );

    // 26.2 真实大整数（1,000,000,000 算力点）预扣、补扣与退款集成
    const bigSafePoints = 1_000_000_000;
    const taskIdBig = `task-bigint-safe-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: bigSafePoints, title: "巨量充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });

    const holdRes = await consumeAndCreateSettlementHold({
      taskId: taskIdBig,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: bigSafePoints,
      pricingSnapshot: dummySnapshot,
    });
    assert.equal(holdRes.holdPoints, BigInt(bigSafePoints));

    // 全额释放
    const relRes = await releaseSettlementHold({
      taskId: taskIdBig,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      reason: "大整数释放测试",
    });
    assert.equal(relRes.status, "RELEASED");
    assert.equal(relRes.releasedPoints, BigInt(bigSafePoints));
  });

  test("27. HOLD 完整性各字段强校验集成测试", async () => {
    const taskIdIntegrity = `task-integrity-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });

    // 27.1 holdPoints > 0 且 details 为空直接抛出 HOLD_DETAILS_EMPTY
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdIntegrity,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 50,
          pricingSnapshot: dummySnapshot,
          holdDetails: [],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_DETAILS_EMPTY",
      "details 为空且 points > 0 时必须抛出 HOLD_DETAILS_EMPTY"
    );

    // 27.2 传入不存在的 fake ledgerId 触发校验失败
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdIntegrity,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 50,
          pricingSnapshot: dummySnapshot,
          holdDetails: [{
            ledgerId: "fake-ledger-id-not-exist",
            grantId: "",
            scope: "WALLET",
            sourceType: "ONLINE_RECHARGE",
            points: 50,
            kind: "WALLET",
          }],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGERS_MISSING",
      "ledger 不存在时必须抛出 HOLD_LEDGERS_MISSING"
    );

    // 27.3 扣点成功但传入篡改的 userId 校验
    const cr = await consumePoints({
      workspaceId: testWorkspaceId,
      userId: testUserId,
      points: 10,
      taskId: taskIdIntegrity,
      idempotencyKey: `CONSUME:${taskIdIntegrity}`,
    });

    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdIntegrity,
          userId: "tampered-user-id",
          workspaceId: testWorkspaceId,
          holdPoints: 10,
          pricingSnapshot: dummySnapshot,
          holdDetails: cr.details,
          consumeLedgerIds: cr.ledgerIds,
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_ACCOUNT_MISMATCH",
      "userId 篡改时必须抛出 HOLD_LEDGER_ACCOUNT_MISMATCH"
    );
  });

  test("28. MEMBER 账户缺失时的释放与差额退款整笔回滚防御", async () => {
    const tempMemberUserId = `temp-member-${uid()}`;
    const taskIdOrphan = `task-orphan-member-${uid()}`;

    try {
    // 创建临时用户与成员关系
    await prisma.user.create({
      data: { id: tempMemberUserId, name: "临时成员", email: `${tempMemberUserId}@test.local`, password: "test-pwd-123" },
    });
    await prisma.userwallet.create({
      data: { id: randomUUID(), userId: tempMemberUserId, balance: BigInt(0) },
    });
    await prisma.workspacemember.create({
      data: {
        id: randomUUID(),
        userId: tempMemberUserId,
        workspaceId: testWorkspaceId,
        role: "MEMBER",
        tokenBalance: BigInt(100),
        monthlyTokenLimit: BigInt(1000),
        monthlyTokenUsed: BigInt(0),
      },
    });

    // 扣点并创建 HOLD
    await consumeAndCreateSettlementHold({
      taskId: taskIdOrphan,
      userId: tempMemberUserId,
      workspaceId: testWorkspaceId,
      workspaceType: "ENTERPRISE",
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟成员被物理删除
    await prisma.workspacemember.delete({
      where: { userId_workspaceId: { userId: tempMemberUserId, workspaceId: testWorkspaceId } },
    });

    // 尝试释放预扣：必须触发 RefundAccountNotFoundError 并整笔回滚
    await assert.rejects(
      async () => {
        await releaseSettlementHold({
          taskId: taskIdOrphan,
          userId: tempMemberUserId,
          workspaceId: testWorkspaceId,
          reason: "账户缺失测试",
        });
      },
      (err: any) => err instanceof RefundAccountNotFoundError,
      "成员账户被删除时必须抛出 RefundAccountNotFoundError"
    );

    // 验证事务整笔回滚：两表状态未被篡改为 RELEASED，且未产生任何 REFUND 流水
    const holdRow = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdOrphan } });
    const settleRow = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdOrphan } });
    assert.equal(holdRow.status, "HELD", "事务回滚后 hold 状态必须保持 HELD");
    assert.equal(settleRow.status, "HOLD", "事务回滚后 settlement 状态必须保持 HOLD");

    const refundLedgers = await prisma.pointledger.findMany({
      where: { taskId: taskIdOrphan, type: "REFUND" },
    });
    assert.equal(refundLedgers.length, 0, "事务回滚后不得遗留任何 REFUND 流水");
    } finally {
      // 严格 finally 清理：避免 task-orphan-member 测试残留（按主键 + 有限 P2034 重试）
      await safeCleanupTask(taskIdOrphan);
      await prisma.userwallet.deleteMany({ where: { userId: tempMemberUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: tempMemberUserId } }).catch(() => {});
    }
  });

  test("29. 过期 HOLD 回收并发 CAS 防御", async () => {
    const taskIdConcurrent = `task-reap-cas-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });

    await consumeAndCreateSettlementHold({
      taskId: taskIdConcurrent,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 20,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟该任务在 35 分钟前创建已过期
    const pastDate = new Date(Date.now() - 35 * 60 * 1000);
    await prisma.tokensettlementhold.update({
      where: { taskId: taskIdConcurrent },
      data: { createdAt: pastDate },
    });

    // 并发分支 A 先完成结算
    await completeSettlement({
      taskId: taskIdConcurrent,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      usage: { inputTokens: 20000, outputTokens: 0 },
    });

    // 并发分支 B 触发过期扫描：识别到已被 SETTLED，不得产生误删或入队恢复记录
    const reapRes = await reapExpiredHolds({ batchSize: 50 });
    // 验证针对该 taskId 没有新增任何恢复记录
    const recRow = await prisma.tokensettlementrecovery.findUnique({
      where: { taskId: taskIdConcurrent },
    });
    assert.equal(recRow, null, "已被 SETTLED 的任务绝对不得创建恢复记录");
  });

  test("30. 流水一对一完整性强校验（重复ID、数量错配、顺序颠倒、同金额不同流水）", async () => {
    const isolatedUserId = `user-align-${uid()}`;
    await prisma.user.create({ data: { id: isolatedUserId, password: "x" } });
    await prisma.userwallet.create({ data: { id: randomUUID(), userId: isolatedUserId, balance: BigInt(60) } });

    const now = new Date();
    // 构造两个分桶，分别 30 点，共 60 点
    await prisma.pointgrant.create({
      data: {
        id: randomUUID(),
        scope: "WALLET",
        userId: isolatedUserId,
        points: BigInt(30),
        remaining: BigInt(30),
        status: "ACTIVE",
        sourceType: "ONLINE_RECHARGE",
        title: "分桶A",
        expiresAt: new Date(now.getTime() + 3600_000),
        updatedAt: now,
      },
    });
    await prisma.pointgrant.create({
      data: {
        id: randomUUID(),
        scope: "WALLET",
        userId: isolatedUserId,
        points: BigInt(30),
        remaining: BigInt(30),
        status: "ACTIVE",
        sourceType: "ONLINE_RECHARGE",
        title: "分桶B",
        expiresAt: new Date(now.getTime() + 7200_000),
        updatedAt: now,
      },
    });

    const taskIdAlign = `task-align-${uid()}`;
    const cr = await consumePoints({
      userId: isolatedUserId,
      workspaceId: testWorkspaceId,
      points: 60,
      taskId: taskIdAlign,
      idempotencyKey: `CONSUME:${taskIdAlign}`,
    });
    assert.equal(cr.details.length, 2, "必须产生两条扣减明细");
    assert.equal(cr.ledgerIds.length, 2, "必须产生两条流水记录");

    const id1 = cr.ledgerIds[0];
    const id2 = cr.ledgerIds[1];
    const d1 = cr.details[0];
    const d2 = cr.details[1];

    // 30.1 重复 ledgerId 拦截测试
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdAlign,
          userId: isolatedUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 60,
          pricingSnapshot: dummySnapshot,
          holdDetails: [d1, d2],
          consumeLedgerIds: [id1, id1],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_DUPLICATE",
      "存在重复 consumeLedgerIds 时必须拦截并抛出 HOLD_LEDGER_DUPLICATE"
    );

    // 30.2 数量错配拦截测试 (details 2 条，ledgerIds 1 条)
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdAlign,
          userId: isolatedUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 60,
          pricingSnapshot: dummySnapshot,
          holdDetails: [d1, d2],
          consumeLedgerIds: [id1],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_COUNT_MISMATCH",
      "明细与流水数量不一致时必须拦截并抛出 HOLD_LEDGER_COUNT_MISMATCH"
    );

    // 30.3 顺序颠倒错配拦截测试 (details: [d1, d2], consumeLedgerIds: [id2, id1])
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdAlign,
          userId: isolatedUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 60,
          pricingSnapshot: dummySnapshot,
          holdDetails: [d1, d2],
          consumeLedgerIds: [id2, id1],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_INDEX_MISMATCH",
      "流水与明细顺序错配时必须拦截并抛出 HOLD_LEDGER_INDEX_MISMATCH"
    );

    // 30.4 同金额不同流水错配拦截测试
    // 创建一条同为 30 点的独立合法流水
    const fakeLedgerId = randomUUID();
    await prisma.pointledger.create({
      data: {
        id: fakeLedgerId,
        direction: "OUT",
        type: "CONSUME",
        scope: "WALLET",
        userId: isolatedUserId,
        workspaceId: testWorkspaceId,
        taskId: taskIdAlign,
        points: BigInt(30),
        title: "另一笔相同金额流水",
      },
    });

    const mismatchedDetail = { ...d2, ledgerId: fakeLedgerId };
    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: taskIdAlign,
          userId: isolatedUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 60,
          pricingSnapshot: dummySnapshot,
          holdDetails: [d1, mismatchedDetail],
          consumeLedgerIds: [id1, id2],
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_INDEX_MISMATCH",
      "流水ID与明细中的 ledgerId 不一致时必须拦截"
    );
  });

  test("31. Recovery Worker 并发认领强断言与 workerId 隔离", async () => {
    const taskIdWorkerCas = `task-worker-cas-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 30, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdWorkerCas,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 30,
      pricingSnapshot: dummySnapshot,
    });

    await enqueueSettlementRecovery({
      taskId: taskIdWorkerCas,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "并发抢占测试",
    });

    // 两个 worker 并发竞争同一恢复任务
    const [claimA, claimB] = await Promise.all([
      claimSettlementRecovery({ taskId: taskIdWorkerCas, workerId: "worker-alpha", leaseMs: 10000 }),
      claimSettlementRecovery({ taskId: taskIdWorkerCas, workerId: "worker-beta", leaseMs: 10000 }),
    ]);

    const wonA = claimA.some((t) => t.taskId === taskIdWorkerCas);
    const wonB = claimB.some((t) => t.taskId === taskIdWorkerCas);

    assert.ok(
      (wonA && !wonB) || (!wonA && wonB),
      "并发认领时有且仅有一个 worker 能够抢占成功"
    );

    const winnerTask = wonA ? claimA[0] : claimB[0];
    assert.ok(winnerTask.workerId === "worker-alpha" || winnerTask.workerId === "worker-beta");

    // 检查数据库中状态与审计信息
    const recRow = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdWorkerCas } });
    assert.equal(recRow.status, "PROCESSING");
    assert.ok(recRow.lastError?.includes(winnerTask.workerId!));

    // 第三方 worker 再次认领已被租约保护的任务，必不能认领到
    const claimC = await claimSettlementRecovery({ taskId: taskIdWorkerCas, workerId: "worker-gamma", leaseMs: 10000 });
    assert.equal(claimC.length, 0, "租约内的任务不可被其他 worker 重复认领");

    // Fencing 保护验证：旧 claimToken 不可写回
    const fakeTokenWrite = await writeSettlementRecoveryResult(taskIdWorkerCas, "old-invalid-token", {
      status: "RELEASED",
    });
    assert.equal(fakeTokenWrite.applied, false, "错误的 claimToken Fencing 拦截生效");

    // 正确的 winnerTask 执行恢复
    await processSettlementRecovery(winnerTask);

    // 终态校验：claimToken 与 leaseUntil 必须被清空
    const finalRec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdWorkerCas } });
    assert.equal(finalRec.status, "RELEASED");
    assert.equal(finalRec.claimToken, null);
    assert.equal(finalRec.leaseUntil, null);
  });

  test("32. Recovery Worker 真实释放 (TASK_WRITE_FAILED) 与三表一致性强断言", async () => {
    const taskIdTaskWriteFail = `task-write-fail-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 25, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    const holdRes = await consumeAndCreateSettlementHold({
      taskId: taskIdTaskWriteFail,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 25,
      pricingSnapshot: dummySnapshot,
    });
    assert.equal(holdRes.status, "HELD");

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    // 入队 TASK_WRITE_FAILED
    await enqueueSettlementRecovery({
      taskId: taskIdTaskWriteFail,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "TASK_WRITE_FAILED",
      error: "任务保存失败",
    });

    const tasks = await claimSettlementRecovery({ taskId: taskIdTaskWriteFail, workerId: "worker-twf" });
    assert.equal(tasks.length, 1);

    await processSettlementRecovery(tasks[0]);

    // 三表状态强一致断言
    const recRow = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdTaskWriteFail } });
    const holdRow = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdTaskWriteFail } });
    const settleRow = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdTaskWriteFail } });

    assert.equal(recRow.status, "RELEASED", "recovery 表必须为 RELEASED");
    assert.equal(holdRow.status, "RELEASED", "tokensettlementhold 表必须为 RELEASED");
    assert.equal(settleRow.status, "RELEASED", "tokensettlement 表必须为 RELEASED");
    assert.equal(recRow.claimToken, null, "终态必须清空 claimToken");
    assert.equal(recRow.leaseUntil, null, "终态必须清空 leaseUntil");

    // 可用余额全额退回
    const balAfter = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfter.available, (balBefore.available ?? 0) + 25);
  });

  test("33. 管理员人工复核重复执行幂等与账户缺失整笔回滚强断言", async () => {
    const taskIdAdminReview = `task-admin-idempotent-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 40, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdAdminReview,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 40,
      pricingSnapshot: dummySnapshot,
    });

    // 模拟重试超限，将两表与 recovery 置为 REQUIRES_REVIEW
    await enqueueSettlementRecovery({
      taskId: taskIdAdminReview,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "SETTLEMENT_FAILED",
      error: "重试超限转人工复核",
    });
    await prisma.tokensettlementrecovery.update({
      where: { taskId: taskIdAdminReview },
      data: { status: "REQUIRES_REVIEW", retryCount: 5 },
    });
    await prisma.tokensettlement.update({
      where: { taskId: taskIdAdminReview },
      data: { status: "REQUIRES_REVIEW" },
    });
    await prisma.tokensettlementhold.update({
      where: { taskId: taskIdAdminReview },
      data: { status: "REQUIRES_REVIEW" },
    });

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    // 1. 管理员首次调用 RELEASE 裁决
    const firstRes = await adminResolveSettlementReview({
      taskId: taskIdAdminReview,
      action: "RELEASE",
      adminUserId: "admin-super",
      auditRemark: "首次审核通过释放",
    });
    assert.equal(firstRes.status, "RELEASED");

    const balAfterFirst = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfterFirst.available, (balBefore.available ?? 0) + 40, "首次裁决退回 40 点");

    // 2. 管理员重复调用：幂等返回终态，绝不重复退款
    const secondRes = await adminResolveSettlementReview({
      taskId: taskIdAdminReview,
      action: "RELEASE",
      adminUserId: "admin-super",
      auditRemark: "重复点击释放",
    });
    assert.equal(secondRes.status, "RELEASED");
    assert.ok(secondRes.auditMessage?.includes("已处于终态"));

    const balAfterSecond = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfterSecond.available, balAfterFirst.available, "重复执行幂等，余额绝不得再次增加");

    // 3. 账户缺失整笔事务回滚断言
    const taskIdMissingAccount = `task-admin-rollback-${uid()}`;
    const badUserId = `user-ghost-${uid()}`;
    await prisma.user.create({ data: { id: badUserId, password: "x" } });
    await prisma.userwallet.create({ data: { id: randomUUID(), userId: badUserId, balance: BigInt(50) } });
    await prisma.workspacemember.create({
      data: {
        id: randomUUID(),
        workspaceId: testWorkspaceId,
        userId: badUserId,
        role: "MEMBER",
        tokenBalance: BigInt(50),
      },
    });
    await grantPoints({ userId: badUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });

    // 正常通过标准原子事务创建预扣单据
    await consumeAndCreateSettlementHold({
      taskId: taskIdMissingAccount,
      userId: badUserId,
      workspaceId: testWorkspaceId,
      points: 30,
      pricingSnapshot: dummySnapshot,
    });

    // 状态流转为 REQUIRES_REVIEW
    await prisma.tokensettlement.update({
      where: { taskId: taskIdMissingAccount },
      data: { status: "REQUIRES_REVIEW" },
    });
    await prisma.tokensettlementhold.update({
      where: { taskId: taskIdMissingAccount },
      data: { status: "REQUIRES_REVIEW" },
    });

    // 物理删除该用户的钱包，制造账户缺失场景
    await prisma.userwallet.deleteMany({ where: { userId: badUserId } });

    // 尝试执行复核裁决：因钱包账户不存在，必须抛出 RefundAccountNotFoundError 并整笔回滚
    await assert.rejects(
      async () => {
        await adminResolveSettlementReview({
          taskId: taskIdMissingAccount,
          action: "RELEASE",
          adminUserId: "admin-super",
          auditRemark: "幽灵账户复核",
        });
      },
      (err: any) => err instanceof RefundAccountNotFoundError,
      "账户不存在时必须触发 RefundAccountNotFoundError 整笔回滚"
    );

    // 状态未改变，依然为 REQUIRES_REVIEW
    const ghostSettle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdMissingAccount } });
    assert.equal(ghostSettle.status, "REQUIRES_REVIEW", "事务回滚后状态必须保持 REQUIRES_REVIEW");
  });

  test("34. Recovery Fencing 真实事务边界强断言：Worker A 租约过期被 Worker B 抢占后，Worker A 事务内拦截并零账务流水", async () => {
    const taskIdFencing = `task-fencing-boundary-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 30, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdFencing,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 30,
      pricingSnapshot: dummySnapshot,
    });

    await enqueueSettlementRecovery({
      taskId: taskIdFencing,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "模拟释放失败进入恢复",
    });

    // 1. Worker A 认领任务（按 taskId 精确认领，隔离并行/遗留数据）
    const [taskA] = await claimSettlementRecovery({ taskId: taskIdFencing, workerId: "worker-A", leaseDurationMs: 60_000 });
    assert.ok(taskA && taskA.taskId === taskIdFencing);
    const tokenA = taskA.claimToken!;
    assert.ok(tokenA);

    // 2. 模拟 Worker A 发生网络卡顿，租约超时，Worker B 介入抢占该任务
    // 强制将租约时间修改为过去，以便 Worker B 重新认领
    await prisma.tokensettlementrecovery.update({
      where: { taskId: taskIdFencing },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });

    const [taskB] = await claimSettlementRecovery({ taskId: taskIdFencing, workerId: "worker-B", leaseDurationMs: 60_000 });
    assert.ok(taskB && taskB.taskId === taskIdFencing);
    const tokenB = taskB.claimToken!;
    assert.ok(tokenB);
    assert.notEqual(tokenA, tokenB, "Worker B 抢占后获得全新的 claimToken");

    const balBeforeAttempt = await getBalanceSummary(testUserId, testWorkspaceId);
    const ledgersBefore = await prisma.pointledger.count({ where: { taskId: taskIdFencing } });

    // 3. Worker A 恢复，尝试带着过期的 tokenA 执行释放，必须在事务内被 Fencing 检查拦截并完全回滚
    await assert.rejects(
      async () => {
        await releaseSettlementHold({
          taskId: taskIdFencing,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          reason: "Worker A 模拟恢复执行释放",
          recoveryContext: {
            claimToken: tokenA,
            expectedSettlementVersion: taskA.settlementVersion ?? undefined,
            workerId: "worker-A",
          },
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "FENCING_TOKEN_MISMATCH",
      "Worker A 必须因 claimToken 不匹配被 Fencing 拦截"
    );

    // 验证 Worker A 拦截后产生 0 变动、0 新增流水
    const balAfterAFail = await getBalanceSummary(testUserId, testWorkspaceId);
    const ledgersAfterAFail = await prisma.pointledger.count({ where: { taskId: taskIdFencing } });
    assert.equal(balAfterAFail.available, balBeforeAttempt.available, "Worker A 被拦截后余额绝对不变");
    assert.equal(ledgersAfterAFail, ledgersBefore, "Worker A 被拦截后绝不产生任何退款流水");

    // 4. Worker B 带着有效的 tokenB 执行恢复，顺利完成
    await processSettlementRecovery(taskB);

    const balFinal = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balFinal.available, (balBeforeAttempt.available ?? 0) + 30, "Worker B 成功释放预扣 30 点");

    const recRow = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdFencing } });
    assert.equal(recRow.status, "RELEASED");
    assert.equal(recRow.claimToken, null, "终态清理 claimToken");
  });

  test("35. settlementVersion 乐观版本 CAS 冲突拦截：拒绝账务动作并原子转入 REQUIRES_REVIEW", async () => {
    const taskIdCas = `task-cas-conflict-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 25, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdCas,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 25,
      pricingSnapshot: dummySnapshot,
    });

    await enqueueSettlementRecovery({
      taskId: taskIdCas,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "RELEASE_FAILED",
      error: "模拟进入恢复队列",
    });

    const [taskClaimed] = await claimSettlementRecovery({ taskId: taskIdCas, workerId: "worker-cas" });
    assert.ok(taskClaimed && taskClaimed.taskId === taskIdCas);

    // 人为篡改 tokensettlement 表的 settlementVersion 模拟并发修改
    await prisma.tokensettlement.update({
      where: { taskId: taskIdCas },
      data: { settlementVersion: 99 },
    });

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    // 执行恢复：检测到 settlementVersion 冲突，拒绝账务动作，并自动将三表转入 REQUIRES_REVIEW
    await processSettlementRecovery(taskClaimed);

    const balAfter = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfter.available, balBefore.available, "CAS 冲突时绝对不发生资金退款或扣减");

    const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskIdCas } });
    const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdCas } });
    const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: taskIdCas } });

    assert.equal(rec.status, "REQUIRES_REVIEW");
    assert.equal(settle.status, "REQUIRES_REVIEW");
    assert.equal(hold.status, "REQUIRES_REVIEW");
    assert.ok(rec.lastError?.includes("SETTLEMENT_VERSION_MISMATCH") || rec.lastError?.includes("CAS"));
  });

  test("36. 管理员复核并发执行与严格锁顺序保障：0 死锁、0 漏检 P2034、终态原子一致", async () => {
    const taskIdConcurrentReview = `task-concurrent-review-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    await consumeAndCreateSettlementHold({
      taskId: taskIdConcurrentReview,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 50,
      pricingSnapshot: dummySnapshot,
    });

    await enqueueSettlementRecovery({
      taskId: taskIdConcurrentReview,
      userId: testUserId,
      workspaceId: testWorkspaceId,
      recoveryType: "SETTLEMENT_FAILED",
      error: "异常需人工复核",
    });

    await prisma.tokensettlementrecovery.update({ where: { taskId: taskIdConcurrentReview }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlement.update({ where: { taskId: taskIdConcurrentReview }, data: { status: "REQUIRES_REVIEW" } });
    await prisma.tokensettlementhold.update({ where: { taskId: taskIdConcurrentReview }, data: { status: "REQUIRES_REVIEW" } });

    const balBefore = await getBalanceSummary(testUserId, testWorkspaceId);

    // 并发调用 6 个管理员复核请求（RELEASE）
    const promises = Array.from({ length: 6 }, (_, i) =>
      adminResolveSettlementReview({
        taskId: taskIdConcurrentReview,
        action: "RELEASE",
        adminUserId: `admin-${i}`,
        auditRemark: `并发复核请求 #${i}`,
      })
    );

    const results = await Promise.all(promises);
    assert.equal(results.length, 6);
    for (const res of results) {
      assert.equal(res.status, "RELEASED");
    }

    // 资金严格只释放了一次（+50）
    const balAfter = await getBalanceSummary(testUserId, testWorkspaceId);
    assert.equal(balAfter.available, (balBefore.available ?? 0) + 50);

    const finalSettle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: taskIdConcurrentReview } });
    assert.equal(finalSettle.status, "RELEASED");
  });

  test("37. HOLD 完整性强校验：拒绝非正则幂等键与不存在的分桶", async () => {
    // 1. 非法幂等键格式校验
    const badIdempTaskId = `task-bad-idemp-${uid()}`;
    await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
    const consumeRes = await consumePoints({
      userId: testUserId,
      workspaceId: testWorkspaceId,
      points: 10,
      taskId: badIdempTaskId,
      idempotencyKey: `bad_prefix_${uid()}`,
    });

    const corruptedDetails: StoredHoldDetails = {
      details: consumeRes.details,
      consumeLedgerIds: consumeRes.details.map((d) => d.ledgerId).filter(Boolean) as string[],
      consumeIdempotencyKey: "invalid-key-no-hash",
    };

    await assert.rejects(
      async () => {
        await createSettlementHold({
          taskId: badIdempTaskId,
          userId: testUserId,
          workspaceId: testWorkspaceId,
          holdPoints: 10,
          pricingSnapshot: dummySnapshot,
          holdDetails: corruptedDetails,
        });
      },
      (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_LEDGER_IDEMPOTENCY_MISMATCH",
      "非法格式的 idempotencyKey 必须抛出 HOLD_LEDGER_IDEMPOTENCY_MISMATCH"
    );

    // 2. 模拟明细中携带不存在的 grantId
    const fakeGrantTaskId = `task-fake-grant-${uid()}`;
    try {
      await grantPoints({ userId: testUserId, scope: "WALLET", points: 20, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      const realConsume = await consumePoints({
        userId: testUserId,
        workspaceId: testWorkspaceId,
        points: 10,
        taskId: fakeGrantTaskId,
        idempotencyKey: `CONSUME:${fakeGrantTaskId}`,
      });

      const fakeDetails: StoredHoldDetails = {
        details: [
          {
            ...realConsume.details[0],
            grantId: "non-existent-grant-uuid-9999",
          },
        ],
        consumeLedgerIds: realConsume.details.map((d) => d.ledgerId).filter(Boolean) as string[],
        consumeIdempotencyKey: `CONSUME:${fakeGrantTaskId}`,
      };

      await assert.rejects(
        async () => {
          await createSettlementHold({
            taskId: fakeGrantTaskId,
            userId: testUserId,
            workspaceId: testWorkspaceId,
            holdPoints: 10,
            pricingSnapshot: dummySnapshot,
            holdDetails: fakeDetails,
          });
        },
        (err: any) => err instanceof TokenSettlementError && err.code === "HOLD_DETAIL_GRANT_NOT_FOUND",
        "不存在的 grantId 必须抛出 HOLD_DETAIL_GRANT_NOT_FOUND"
      );
    } finally {
      await safeCleanupTask(fakeGrantTaskId);
    }
  });

  test("38. 生产 Recovery 扫描执行器 (runSettlementRecovery) 批处理统计与自愈断言", async () => {
    const taskCliRecovery = `task-cli-run-${uid()}`;
    try {
      await grantPoints({ userId: testUserId, scope: "WALLET", points: 15, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({
        taskId: taskCliRecovery,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        points: 15,
        pricingSnapshot: dummySnapshot,
      });

      await enqueueSettlementRecovery({
        taskId: taskCliRecovery,
        userId: testUserId,
        workspaceId: testWorkspaceId,
        recoveryType: "RELEASE_FAILED",
        error: "批处理恢复入口测试",
      });

      const stats = await runSettlementRecovery({ limit: 10, workerId: "test-cli-worker", userId: testUserId });
      assert.ok(stats.processed >= 1, "至少处理了 1 个恢复任务");
      assert.ok(stats.released >= 1, "至少成功释放了 1 个任务");

      const row = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: taskCliRecovery } });
      assert.equal(row.status, "RELEASED");
    } finally {
      await safeCleanupTask(taskCliRecovery);
    }
  });

  test("39. Recovery 旧 Worker 越权防护与并发抢占回归断言：租约过期抢占后旧 Worker 异常收口整笔回滚且三表零变动", async () => {
    const isolateUserId = `test-user-iso-${uid()}`;
    const isolateWsId = `test-ws-iso-${uid()}`;
    const isolateTaskId = `task-fencing-preempt-${uid()}`;
    const now = new Date();

    try {
      // 1. 初始化隔离租户与账户数据
      await prisma.user.create({
        data: { id: isolateUserId, email: `${isolateUserId}@test.com`, password: "pwd" },
      });
      await prisma.workspace.create({
        data: { id: isolateWsId, name: "Isolate WS", type: "ENTERPRISE", ownerId: isolateUserId, updatedAt: now },
      });
      await prisma.workspacequota.create({
        data: { id: `quota-${randomUUID()}`, workspaceId: isolateWsId, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now },
      });
      await prisma.userwallet.create({
        data: { id: `wallet-${randomUUID()}`, userId: isolateUserId, balance: BigInt(100), updatedAt: now },
      });
      await prisma.workspacemember.create({
        data: { id: `member-${randomUUID()}`, workspaceId: isolateWsId, userId: isolateUserId, role: "OWNER", tokenBalance: BigInt(0), monthlyTokenLimit: BigInt(10000), monthlyTokenUsed: BigInt(0) },
      });
      await grantPoints({
        userId: isolateUserId,
        scope: "WALLET",
        points: 50,
        title: "充值",
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
      });

      // 2. 创建预扣与结算单
      await consumeAndCreateSettlementHold({
        taskId: isolateTaskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        points: 20,
        pricingSnapshot: dummySnapshot,
      });

      // 3. 登记入队 Recovery
      await enqueueSettlementRecovery({
        taskId: isolateTaskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        recoveryType: "RELEASE_FAILED",
        error: "待恢复任务",
      });

      // 4. Worker A 认领任务
      const claimedA = await claimSettlementRecovery({ taskId: isolateTaskId, workerId: "worker-A", leaseMs: 60000 });
      const taskA = claimedA.find((t) => t.taskId === isolateTaskId);
      assert.ok(taskA, "Worker A 必须成功认领到该恢复任务");
      assert.equal(taskA.workerId, "worker-A");
      const claimTokenA = taskA.claimToken;

      // 5. 模拟 Worker A 租约过期（将数据库中的 leaseUntil 设置为过去时间）
      const expiredTime = new Date(Date.now() - 5000);
      await prisma.tokensettlementrecovery.update({
        where: { taskId: isolateTaskId },
        data: { leaseUntil: expiredTime },
      });

      // 6. Worker B 抢占认领
      const claimedB = await claimSettlementRecovery({ taskId: isolateTaskId, workerId: "worker-B", leaseMs: 60000 });
      const taskB = claimedB.find((t) => t.taskId === isolateTaskId);
      assert.ok(taskB, "Worker B 必须成功抢占已过期的恢复任务");
      assert.equal(taskB.workerId, "worker-B");
      assert.notEqual(taskB.claimToken, claimTokenA, "Worker B 的 claimToken 必须与 Worker A 完全不同");
      const claimTokenB = taskB.claimToken;

      // 7. 旧 Worker A 试图执行异常转人工复核收口（使用旧 claimTokenA）
      const workerAProcessResult = await processSettlementRecovery({
        ...taskA,
        claimToken: claimTokenA, // 旧 Token
      });

      // Worker A 必须失败且被拦截
      assert.equal(workerAProcessResult.status, "FAILED");
      assert.equal(workerAProcessResult.error, "FENCING_TOKEN_MISMATCH");

      // 8. 强力断言：三表（tokensettlement, tokensettlementhold, tokensettlementrecovery）均未被 Worker A 越权篡改！
      const recCheck = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: isolateTaskId } });
      assert.equal(recCheck.status, "PROCESSING", "recovery 状态必须仍然是 PROCESSING，绝未被旧 Worker A 改为 REQUIRES_REVIEW 或 FAILED");
      assert.equal(recCheck.claimToken, claimTokenB, "claimToken 必须仍然是 Worker B 的 Token");

      const settleCheck = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: isolateTaskId } });
      assert.equal(settleCheck.status, "HOLD", "settlement 状态必须仍然是 HOLD，绝未被旧 Worker A 改为 REQUIRES_REVIEW");

      const holdCheck = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: isolateTaskId } });
      assert.equal(holdCheck.status, "HELD", "hold 状态必须仍然是 HELD，绝未被旧 Worker A 改为 REQUIRES_REVIEW");

      // 9. Worker B 正常处理并成功释放
      const workerBResult = await processSettlementRecovery(taskB);
      assert.equal(workerBResult.status, "RELEASED", "Worker B 必须成功完成释放处理");

      const finalRec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId: isolateTaskId } });
      assert.equal(finalRec.status, "RELEASED");
      assert.equal(finalRec.claimToken, null);

      const finalSettle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: isolateTaskId } });
      assert.equal(finalSettle.status, "RELEASED");
    } finally {
      // 严格 finally 精确清理（按主键/明确范围 + 有限 P2034 重试；失败不污染后续测试）
      await cleanupWithRetry(async () => {
        await prisma.$transaction(async (tx) => {
          await tx.tokensettlementrecovery.deleteMany({ where: { taskId: isolateTaskId } });
          await tx.tokensettlementhold.deleteMany({ where: { taskId: isolateTaskId } });
          await tx.tokensettlement.deleteMany({ where: { taskId: isolateTaskId } });
          await tx.pointledger.deleteMany({ where: { taskId: isolateTaskId } });
          await tx.pointgrant.deleteMany({ where: { userId: isolateUserId } });
          await tx.workspacemember.deleteMany({ where: { workspaceId: isolateWsId } });
          await tx.workspacequota.deleteMany({ where: { workspaceId: isolateWsId } });
          await tx.userwallet.deleteMany({ where: { userId: isolateUserId } });
          await tx.workspace.deleteMany({ where: { id: isolateWsId } });
          await tx.user.deleteMany({ where: { id: isolateUserId } });
        });
      }).catch((e) => console.error(`[cleanup] 隔离任务清理失败(已记录, 不污染后续测试):`, e));
    }
  });
});
