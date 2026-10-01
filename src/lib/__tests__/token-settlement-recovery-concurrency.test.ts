import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  consumeAndCreateSettlementHold,
  enqueueSettlementRecovery,
  claimSettlementRecovery,
  processSettlementRecovery,
  completeSettlement,
  releaseSettlementHold,
  SETTLEMENT_RECOVERY_MAX_RETRY,
} from "@/lib/token-settlement-service";
import { grantPoints, getBalanceSummary } from "@/lib/credit-service";
import {
  type DeploymentPricing,
  buildRegistryPricingSnapshot,
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

describe("Recovery Fencing 并发抢占与异常分支强断言 (Phase 2A 收口)", () => {
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

  const uid = () => Date.now() + "-" + randomUUID().slice(0, 8);
  const isolateUserId = `test-conc-user-${uid()}`;
  const isolateWsId = `test-conc-ws-${uid()}`;

  before(async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: isolateUserId, email: `${isolateUserId}@test.com`, password: "pwd" },
    });
    await prisma.workspace.create({
      data: { id: isolateWsId, name: "Conc WS", type: "ENTERPRISE", ownerId: isolateUserId, updatedAt: now },
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
  });

  after(async () => {
    // 清理隔离用户/空间数据（明确测试用户/空间范围，事务 + 有限 P2034 重试，绝不按 task- 前缀盲删）
    await cleanupWithRetry(async () => {
      await prisma.$transaction(async (tx) => {
        await tx.tokensettlementrecovery.deleteMany({ where: { userId: isolateUserId } });
        await tx.tokensettlementhold.deleteMany({ where: { userId: isolateUserId } });
        await tx.tokensettlement.deleteMany({ where: { userId: isolateUserId } });
        await tx.pointledger.deleteMany({ where: { userId: isolateUserId } });
        await tx.pointgrant.deleteMany({ where: { userId: isolateUserId } });
        await tx.workspacemember.deleteMany({ where: { workspaceId: isolateWsId } });
        await tx.workspacequota.deleteMany({ where: { workspaceId: isolateWsId } });
        await tx.userwallet.deleteMany({ where: { userId: isolateUserId } });
        await tx.workspace.deleteMany({ where: { id: isolateWsId } });
        await tx.user.deleteMany({ where: { id: isolateUserId } });
      });
    });
  });

  // ---- 并发测试辅助：显式 barrier / 抢占模拟 ----
  const dummyUsage = { inputTokens: 1000, outputTokens: 500 };

  async function preemptRecovery(taskId: string, newToken: string, leaseMs = 60000): Promise<void> {
    await prisma.tokensettlementrecovery.update({
      where: { taskId },
      data: {
        status: "PROCESSING",
        claimToken: newToken,
        leaseUntil: new Date(Date.now() + leaseMs),
        retryCount: { increment: 1 },
      },
    });
  }

  async function setupAndClaim(
    prefix: string,
    recoveryType: "SETTLEMENT_FAILED" | "RELEASE_FAILED" | "EXPIRED_HOLD_REAP" | "TASK_WRITE_FAILED",
    opts: { pricing?: any; points?: number; grantPoints?: number; usage?: any } = {}
  ): Promise<{ taskId: string; claimToken: string; expectedSettlementVersion: number }> {
    const taskId = `${prefix}-${uid()}-${randomUUID().slice(0, 6)}`;
    await grantPoints({
      userId: isolateUserId,
      scope: "WALLET",
      points: opts.grantPoints ?? 50,
      title: "充值",
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
    });
    await consumeAndCreateSettlementHold({
      taskId,
      userId: isolateUserId,
      workspaceId: isolateWsId,
      points: opts.points ?? 20,
      pricingSnapshot: opts.pricing ?? dummySnapshot,
    });
    await enqueueSettlementRecovery({
      taskId,
      userId: isolateUserId,
      workspaceId: isolateWsId,
      recoveryType,
      error: "待恢复任务",
      usage: opts.usage,
      pricingSnapshot: opts.pricing ?? dummySnapshot,
    });
    const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
    const t = claimed.find((x) => x.taskId === taskId);
    if (!t) throw new Error(`未能认领 ${taskId}`);
    const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
    return { taskId, claimToken: t.claimToken, expectedSettlementVersion: rec.settlementVersion ?? 0 };
  }

  async function cleanupTask(taskId: string): Promise<void> {
    // 清理事务：按主键删除（外键序）+ 有限 P2034 重试；
    // 失败仅记录，绝不污染后续测试（业务错误仍会打印出来，不静默吞掉）。
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
      console.error(`[cleanupTask] 清理失败(已记录, 不污染后续测试) taskId=${taskId}:`, e);
    }
  }

  test("C1. 重试超限分支：仅转 REQUIRES_REVIEW，绝不产生任何真实账务副作用", async () => {
    const taskId = `task-conc-retry-${uid()}`;
    try {
      await grantPoints({
        userId: isolateUserId,
        scope: "WALLET",
        points: 50,
        title: "充值",
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
      });
      await consumeAndCreateSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        points: 20,
        pricingSnapshot: dummySnapshot,
      });
      await enqueueSettlementRecovery({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        recoveryType: "RELEASE_FAILED",
        error: "待恢复任务",
      });

      // 直接把重试计数顶到上限，模拟已多次失败
      await prisma.tokensettlementrecovery.update({
        where: { taskId },
        data: { retryCount: SETTLEMENT_RECOVERY_MAX_RETRY, status: "PENDING" },
      });

      const balBefore = await getBalanceSummary(isolateUserId, isolateWsId);

      // 认领：达到上限自动转 REQUIRES_REVIEW
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const hit = claimed.find((t) => t.taskId === taskId);
      assert.equal(hit, undefined, "重试超限任务绝不得被认领执行");

      const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(rec.status, "REQUIRES_REVIEW", "重试超限必须流转为 REQUIRES_REVIEW");
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "REQUIRES_REVIEW");
      assert.equal(hold.status, "REQUIRES_REVIEW");

      // 强断言：三表状态翻转之外，不得有任何真实退款账务流水（预扣时产生的 CONSUME 流水不计）
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0, "重试超限分支不得写入任何退款账务流水");

      const balAfter = await getBalanceSummary(isolateUserId, isolateWsId);
      assert.equal(balAfter?.available ?? balBefore?.available, balBefore?.available, "重试超限分支不得改变账户余额");
    } finally {
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementrecovery\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementhold\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlement\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.pointledger.deleteMany({ where: { taskId } });
    }
  });

  test("C2. 旧 Worker 租约过期被抢占后，旧 Worker 进入版本/租约冲突分支，三表零变动", async () => {
    const taskId = `task-conc-preempt-${uid()}`;
    try {
      await grantPoints({
        userId: isolateUserId,
        scope: "WALLET",
        points: 50,
        title: "充值",
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
      });
      await consumeAndCreateSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        points: 20,
        pricingSnapshot: dummySnapshot,
      });
      await enqueueSettlementRecovery({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        recoveryType: "RELEASE_FAILED",
        error: "待恢复任务",
      });

      // Worker A 认领
      const claimedA = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const taskA = claimedA.find((t) => t.taskId === taskId);
      assert.ok(taskA, "Worker A 必须认领成功");
      const claimTokenA = taskA!.claimToken;

      // 模拟 A 租约过期
      await prisma.tokensettlementrecovery.update({
        where: { taskId },
        data: { leaseUntil: new Date(Date.now() - 5000) },
      });

      // Worker B 抢占
      const claimedB = await claimSettlementRecovery({ taskId, workerId: "worker-B" });
      const taskB = claimedB.find((t) => t.taskId === taskId);
      assert.ok(taskB, "Worker B 必须抢占成功");
      assert.notEqual(taskB!.claimToken, claimTokenA);

      // 旧 Worker A 使用已失效的 claimToken 进入处理：必须被 Fencing 拦截，三表零变动
      const staleResult = await processSettlementRecovery({ ...taskA!, claimToken: claimTokenA });
      assert.equal(staleResult.status, "FAILED");
      assert.equal(staleResult.error, "FENCING_TOKEN_MISMATCH");

      const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(rec.status, "PROCESSING", "recovery 仍由 Worker B 持有");
      assert.equal(rec.claimToken, taskB!.claimToken);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "HOLD", "settlement 绝未被旧 Worker A 篡改为 REQUIRES_REVIEW");
      assert.equal(hold.status, "HELD", "hold 绝未被旧 Worker A 篡改为 REQUIRES_REVIEW");
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0, "旧 Worker A 不得产生任何退款流水");

      // Worker B 最终只完成一次真实释放
      const bResult = await processSettlementRecovery(taskB!);
      assert.equal(bResult.status, "RELEASED");
      const finalRec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(finalRec.status, "RELEASED");
      assert.equal(finalRec.claimToken, null);
    } finally {
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementrecovery\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementhold\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlement\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.pointledger.deleteMany({ where: { taskId } });
    }
  });

  test("C3. 普通释放路径不计 recoveryContext 时直接释放，不依赖 claimToken", async () => {
    const taskId = `task-conc-plain-${uid()}`;
    try {
      await grantPoints({
        userId: isolateUserId,
        scope: "WALLET",
        points: 50,
        title: "充值",
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
      });
      await consumeAndCreateSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        points: 20,
        pricingSnapshot: dummySnapshot,
      });
      const res = await releaseSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        reason: "普通释放路径",
      });
      assert.equal(res.status, "RELEASED");
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "RELEASED");
    } finally {
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementrecovery\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlementhold\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`tokensettlement\` WHERE \`taskId\` = '${taskId}'`);
      await prisma.pointledger.deleteMany({ where: { taskId } });
    }
  });

  test("C4. 重试上限竞态：A 扫描到重试上限，B 抢占(有效租约)，A 再执行，三表零变化", async () => {
    const taskId = `task-conc-retryrace-${uid()}`;
    try {
      await grantPoints({
        userId: isolateUserId,
        scope: "WALLET",
        points: 50,
        title: "充值",
        sourceType: "ONLINE_RECHARGE",
        type: "RECHARGE",
      });
      await consumeAndCreateSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        points: 20,
        pricingSnapshot: dummySnapshot,
      });
      await enqueueSettlementRecovery({ taskId, userId: isolateUserId, workspaceId: isolateWsId, recoveryType: "RELEASE_FAILED", error: "待恢复" });

      // 将重试计数顶到上限，模拟“A 扫描到重试上限”
      await prisma.tokensettlementrecovery.update({
        where: { taskId },
        data: { retryCount: SETTLEMENT_RECOVERY_MAX_RETRY, status: "PENDING" },
      });

      // 显式 barrier：B 抢占（有效租约），模拟 A 扫描之后、执行之前的并发抢占
      const tokenB = `TOKEN-B-VALID-${randomUUID().slice(0, 6)}`;
      await preemptRecovery(taskId, tokenB, 60000); // 有效租约 => 非候选

      // A 执行（复用 claimSettlementRecovery 的重试上限分支）
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const hit = claimed.find((t) => t.taskId === taskId);
      assert.equal(hit, undefined, "被抢占任务不得被 A 认领/改写");

      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "PROCESSING", "Recovery 仍由 B 持有");
      assert.equal(recovery.claimToken, tokenB, "三表零变化：Recovery 仍指向 B");
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "HOLD", "settlement 未被 A 改写");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "HELD", "hold 未被 A 改写");
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0, "无退款流水");
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C5. completeSettlement(recoveryContext) 已 SETTLED（有效 token）：Recovery 收口为 SETTLED，不残留 PROCESSING", async () => {
    const taskId = `task-conc-alreadysettled-${uid()}`;
    try {
      await grantPoints({ userId: isolateUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: isolateUserId, workspaceId: isolateWsId, points: 20, pricingSnapshot: dummySnapshot });
      await completeSettlement({ taskId, userId: isolateUserId, workspaceId: isolateWsId, usage: dummyUsage, pricingSnapshot: dummySnapshot });
      await enqueueSettlementRecovery({ taskId, userId: isolateUserId, workspaceId: isolateWsId, recoveryType: "SETTLEMENT_FAILED", error: "待恢复", usage: dummyUsage, pricingSnapshot: dummySnapshot });
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const t = claimed.find((x) => x.taskId === taskId);
      const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: dummyUsage,
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken: t!.claimToken, expectedSettlementVersion: rec.settlementVersion ?? 0 },
      });
      assert.equal(res.status, "SETTLED");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "SETTLED");
      assert.notEqual(recovery.status, "PROCESSING");
      assert.equal(recovery.claimToken, null);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C6. completeSettlement(recoveryContext) 已 RELEASED（有效 token）：Recovery 收口为 RELEASED", async () => {
    const taskId = `task-conc-alreadyreleased-${uid()}`;
    try {
      await grantPoints({ userId: isolateUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: isolateUserId, workspaceId: isolateWsId, points: 20, pricingSnapshot: dummySnapshot });
      await releaseSettlementHold({ taskId, userId: isolateUserId, workspaceId: isolateWsId, reason: "预释放" });
      await enqueueSettlementRecovery({ taskId, userId: isolateUserId, workspaceId: isolateWsId, recoveryType: "SETTLEMENT_FAILED", error: "待恢复", usage: dummyUsage, pricingSnapshot: dummySnapshot });
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const t = claimed.find((x) => x.taskId === taskId);
      const rec = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: dummyUsage,
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken: t!.claimToken, expectedSettlementVersion: rec.settlementVersion ?? 0 },
      });
      assert.equal(res.status, "RELEASED");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "RELEASED");
      assert.equal(recovery.claimToken, null);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C7. completeSettlement(recoveryContext) 非法用量 -> INVALID_USAGE_TOKENS：三表一致 REQUIRES_REVIEW，Recovery 不残留 PROCESSING", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-invalidusage", "SETTLEMENT_FAILED");
    try {
      // 覆盖 recovery.usage 为非法（负数），模拟真实 recoveryContext 取用持久化 usage
      await prisma.tokensettlementrecovery.update({
        where: { taskId },
        data: { usage: { inputTokens: -5, outputTokens: 10 } as any },
      });
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: { inputTokens: -5, outputTokens: 10 },
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken, expectedSettlementVersion },
      });
      assert.equal(res.status, "REQUIRES_REVIEW");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "REQUIRES_REVIEW");
      assert.equal(recovery.claimToken, null);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "REQUIRES_REVIEW");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "REQUIRES_REVIEW");
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C8. completeSettlement(recoveryContext) pricingSnapshot 缺失 -> PRICING_SNAPSHOT_MISSING：三表一致 REQUIRES_REVIEW", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-nosnap", "SETTLEMENT_FAILED");
    try {
      await prisma.tokensettlement.update({ where: { taskId }, data: { pricingSnapshot: Prisma.JsonNull } });
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: dummyUsage,
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken, expectedSettlementVersion },
      });
      assert.equal(res.status, "REQUIRES_REVIEW");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "REQUIRES_REVIEW");
      assert.equal(recovery.claimToken, null);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "REQUIRES_REVIEW");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "REQUIRES_REVIEW");
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C9. completeSettlement(recoveryContext) 价格未配置 -> PRICE_NOT_CONFIGURED：三表一致 REQUIRES_REVIEW", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-noprice", "SETTLEMENT_FAILED");
    try {
      await prisma.tokensettlement.update({
        where: { taskId },
        data: { pricingSnapshot: { providerId: "MagicAI", modelId: "gpt-5.5", priceStatus: "NOT_CONFIGURED" } as any },
      });
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: dummyUsage,
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken, expectedSettlementVersion },
      });
      assert.equal(res.status, "REQUIRES_REVIEW");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "REQUIRES_REVIEW");
      assert.equal(recovery.claimToken, null);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "REQUIRES_REVIEW");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "REQUIRES_REVIEW");
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C10. completeSettlement(recoveryContext) stale token：FENCING 回滚，三表零变化，Recovery 仍由 B 持有", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-stale", "SETTLEMENT_FAILED");
    try {
      const tokenB = `TOKEN-B-PREY-${randomUUID().slice(0, 6)}`;
      await preemptRecovery(taskId, tokenB, 60000); // 有效租约抢占
      await assert.rejects(
        completeSettlement({
          taskId,
          userId: isolateUserId,
          workspaceId: isolateWsId,
          usage: dummyUsage,
          pricingSnapshot: dummySnapshot,
          recoveryContext: { claimToken, expectedSettlementVersion },
        }),
        (e: any) => e?.code === "FENCING_TOKEN_MISMATCH"
      );
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "PROCESSING", "Recovery 仍由 B 持有，未残留 PROCESSING 也未被 A 改写");
      assert.equal(recovery.claimToken, tokenB);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "HOLD", "settlement 零变化");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "HELD", "hold 零变化");
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C11. releaseSettlementHold(recoveryContext) 正常释放（有效 token）：Recovery 收口为 RELEASED", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-rel", "RELEASE_FAILED");
    try {
      const res = await releaseSettlementHold({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        reason: "恢复释放",
        recoveryContext: { claimToken, expectedSettlementVersion },
      });
      assert.equal(res.status, "RELEASED");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "RELEASED");
      assert.equal(recovery.claimToken, null);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C12. releaseSettlementHold(recoveryContext) stale token：FENCING 回滚，三表零变化", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-relstale", "RELEASE_FAILED");
    try {
      const tokenB = `TOKEN-B-PREY-${randomUUID().slice(0, 6)}`;
      await preemptRecovery(taskId, tokenB, 60000);
      await assert.rejects(
        releaseSettlementHold({
          taskId,
          userId: isolateUserId,
          workspaceId: isolateWsId,
          reason: "恢复释放",
          recoveryContext: { claimToken, expectedSettlementVersion },
        }),
        (e: any) => e?.code === "FENCING_TOKEN_MISMATCH"
      );
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "PROCESSING", "Recovery 仍由 B 持有");
      assert.equal(recovery.claimToken, tokenB);
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "HOLD", "settlement 零变化");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "HELD", "hold 零变化");
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C13. completeSettlement(recoveryContext) 正常结算（有效 token）：Recovery 收口为 SETTLED", async () => {
    const { taskId, claimToken, expectedSettlementVersion } = await setupAndClaim("task-conc-settle", "SETTLEMENT_FAILED", { usage: dummyUsage });
    try {
      const res = await completeSettlement({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        usage: dummyUsage,
        pricingSnapshot: dummySnapshot,
        recoveryContext: { claimToken, expectedSettlementVersion },
      });
      assert.equal(res.status, "SETTLED");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "SETTLED");
      assert.equal(recovery.claimToken, null);
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C14. 未知 recoveryType（有效 claimToken）：三表一致转 REQUIRES_REVIEW，Recovery 清除 claimToken/leaseUntil", async () => {
    const taskId = `task-conc-unknown-${uid()}`;
    try {
      await grantPoints({ userId: isolateUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: isolateUserId, workspaceId: isolateWsId, points: 20, pricingSnapshot: dummySnapshot });
      // 直接插入未知 recoveryType（绕过 enqueue 联合类型校验，模拟历史/异常数据）
      await prisma.tokensettlementrecovery.create({
        data: {
          id: randomUUID(),
          taskId,
          userId: isolateUserId,
          workspaceId: isolateWsId,
          status: "PENDING",
          recoveryType: "UNKNOWN_RECOVERY_TYPE_X",
          retryCount: 0,
          lastError: "未知类型",
          usage: Prisma.JsonNull,
          pricingSnapshot: Prisma.JsonNull,
          settlementVersion: null,
        },
      });
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const t = claimed.find((x) => x.taskId === taskId);
      assert.ok(t, "应成功认领未知类型恢复任务");
      const res = await processSettlementRecovery({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        claimToken: t!.claimToken,
        recoveryType: "UNKNOWN_RECOVERY_TYPE_X",
      } as any);
      assert.equal(res.status, "REQUIRES_REVIEW");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "REQUIRES_REVIEW", "Recovery 必须一致转 REQUIRES_REVIEW");
      assert.equal(recovery.claimToken, null, "Recovery 必须清除 claimToken");
      assert.equal(recovery.leaseUntil, null, "Recovery 必须清除 leaseUntil");
      assert.notEqual(recovery.status, "PROCESSING", "Recovery 不得残留 PROCESSING");
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "REQUIRES_REVIEW", "settlement 三表一致转 REQUIRES_REVIEW");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "REQUIRES_REVIEW", "hold 三表一致转 REQUIRES_REVIEW");
    } finally {
      await cleanupTask(taskId);
    }
  });

  test("C15. 未知 recoveryType（stale claimToken）：三表零变化，Recovery 仍由新 Worker 持有", async () => {
    const taskId = `task-conc-unknown-stale-${uid()}`;
    try {
      await grantPoints({ userId: isolateUserId, scope: "WALLET", points: 50, title: "充值", sourceType: "ONLINE_RECHARGE", type: "RECHARGE" });
      await consumeAndCreateSettlementHold({ taskId, userId: isolateUserId, workspaceId: isolateWsId, points: 20, pricingSnapshot: dummySnapshot });
      await prisma.tokensettlementrecovery.create({
        data: {
          id: randomUUID(),
          taskId,
          userId: isolateUserId,
          workspaceId: isolateWsId,
          status: "PENDING",
          recoveryType: "UNKNOWN_RECOVERY_TYPE_X",
          retryCount: 0,
          lastError: "未知类型",
          usage: Prisma.JsonNull,
          pricingSnapshot: Prisma.JsonNull,
          settlementVersion: null,
        },
      });
      const claimed = await claimSettlementRecovery({ taskId, workerId: "worker-A" });
      const t = claimed.find((x) => x.taskId === taskId);
      const oldToken = t!.claimToken;
      // 抢占：新 Worker B 持有效租约
      const tokenB = `TOKEN-B-PREY-${randomUUID().slice(0, 6)}`;
      await preemptRecovery(taskId, tokenB, 60000);
      const res = await processSettlementRecovery({
        taskId,
        userId: isolateUserId,
        workspaceId: isolateWsId,
        claimToken: oldToken, // stale token
        recoveryType: "UNKNOWN_RECOVERY_TYPE_X",
      } as any);
      assert.equal(res.status, "FAILED", "stale token 应返回 FAILED");
      assert.equal(res.error, "FENCING_TOKEN_MISMATCH", "应触发 FENCING_TOKEN_MISMATCH");
      const recovery = await prisma.tokensettlementrecovery.findUniqueOrThrow({ where: { taskId } });
      assert.equal(recovery.status, "PROCESSING", "Recovery 仍由新 Worker B 持有");
      assert.equal(recovery.claimToken, tokenB, "Recovery 仍持有 B 的 token");
      const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
      assert.equal(settle.status, "HOLD", "settlement 零变化");
      const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
      assert.equal(hold.status, "HELD", "hold 零变化");
      const ledgers = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" } });
      assert.equal(ledgers.length, 0, "无退款流水");
    } finally {
      await cleanupTask(taskId);
    }
  });
});
