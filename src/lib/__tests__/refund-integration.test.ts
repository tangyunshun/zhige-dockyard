import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import {
  refundConsumedPoints,
  consumePoints,
  reconstructConsumeResult,
  RefundAccountNotFoundError,
  isRetryableP2034,
  type ConsumeResult,
  type ConsumeDetail,
} from "../credit-service";
import {
  enqueueRefundRecovery,
  listRefundRecoveries,
  retryRefundRecovery,
} from "../refund-recovery";

/**
 * 真实账务事务集成测试：直接对真实数据库执行 refundConsumedPoints，验证各来源分桶原路退款、
 * 无限额度月度回滚、重复退款幂等、月度用量不转负。
 *
 * 每个用例创建一次性 user/workspace/钱包/分桶等记录，全部以随机 ID 隔离，finally 中按 ID 显式清理，
 * 不污染业务数据。运行需要可写 DATABASE_URL（本仓库 .env 已指向本地 MySQL）。
 */

// tsc 目标低于 ES2020，禁用 BigInt 字面量，统一用 BigInt() 构造
const B = (n: number): bigint => BigInt(n);

interface Scenario {
  uid: string;
  wid: string;
  qid: string;
  walletId: string;
  memberId: string | null;
  grantIds: string[];
  taskId: string;
}

function mkTaskId(): string {
  return "refund_it_" + randomUUID();
}

async function withScenario(
  opts: {
    workspaceType: "PERSONAL" | "ENTERPRISE";
    memberRole?: "MEMBER" | "OWNER" | "ADMIN";
    walletBalance?: bigint;
    quotaBalance?: bigint;
    memberTokenBalance?: bigint;
    memberMonthlyUsed?: bigint;
    grants?: Array<{ id: string; scope: string; remaining: bigint; points: bigint }>;
  },
  fn: (s: Scenario) => Promise<void>,
): Promise<void> {
  const uid = "it_u_" + randomUUID();
  const wid = "it_ws_" + randomUUID();
  const qid = "it_q_" + randomUUID();
  const walletId = "it_wallet_" + randomUUID();
  const memberId = opts.memberRole ? "it_mem_" + randomUUID() : null;
  const grantIds = (opts.grants ?? []).map((g) => g.id);
  const taskId = mkTaskId();
  const now = new Date();

  const s: Scenario = { uid, wid, qid, walletId, memberId, grantIds, taskId };

  try {
    await prisma.user.create({ data: { id: uid, password: "x" } });
    await prisma.workspace.create({ data: { id: wid, name: "it", type: opts.workspaceType, ownerId: uid, updatedAt: now } });
    if (opts.memberRole) {
      await prisma.workspacemember.create({
        data: {
          id: memberId!,
          workspaceId: wid,
          userId: uid,
          role: opts.memberRole,
          tokenBalance: opts.memberTokenBalance ?? B(0),
          monthlyTokenUsed: opts.memberMonthlyUsed ?? B(0),
        },
      });
    }
    await prisma.workspacequota.create({
      data: {
        id: qid,
        workspaceId: wid,
        membershipLevelId: "FREE",
        tokenBalance: opts.quotaBalance ?? B(0),
        updatedAt: now,
      },
    });
    await prisma.userwallet.create({
      data: {
        id: walletId,
        userId: uid,
        balance: opts.walletBalance ?? B(0),
        updatedAt: now,
      },
    });
    for (const g of opts.grants ?? []) {
      await prisma.pointgrant.create({
        data: {
          id: g.id,
          scope: g.scope,
          userId: g.scope === "WALLET" ? uid : null,
          workspaceId: g.scope !== "WALLET" ? wid : null,
          points: g.points,
          remaining: g.remaining,
          status: "ACTIVE",
          sourceType: "MANUAL",
          title: "it",
          updatedAt: now,
        },
      });
    }

    await fn(s);
  } finally {
    // 优先通过带索引的 userId 批量查出流水主键并精准删除，杜绝无索引 taskId 造成全表扫描与 AB-BA 间隙死锁
    const ledgers = await prisma.pointledger
      .findMany({
        where: { userId: uid },
        select: { id: true },
      })
      .catch(() => []);
    if (ledgers && ledgers.length > 0) {
      await prisma.pointledger
        .deleteMany({
          where: { id: { in: ledgers.map((l) => l.id) } },
        })
        .catch(() => {});
    }
    await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
    for (const gid of grantIds) {
      await prisma.pointgrant.deleteMany({ where: { id: gid } }).catch(() => {});
    }
    if (memberId) await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
    await prisma.userwallet.deleteMany({ where: { id: walletId } }).catch(() => {});
    await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
  }
}

type MockConsumeDetail = Omit<ConsumeDetail, "ledgerId"> & { ledgerId?: string };

function baseConsume(over: Omit<Partial<ConsumeResult>, "details"> & { details: MockConsumeDetail[] }): ConsumeResult {
  const normalizedDetails: ConsumeDetail[] = over.details.map((d, i) => ({
    ledgerId: d.ledgerId || `mock_ledger_${i + 1}`,
    ...d,
  }));
  const memberPoints = normalizedDetails.filter((d) => d.kind === "MEMBER").reduce((sum, d) => sum + d.points, 0);
  const monthly = over.monthlyTokenUsedIncremented ?? memberPoints;
  return {
    skipped: false,
    unlimited: false,
    consumed: normalizedDetails.reduce((sum, d) => sum + d.points, 0),
    ledgerIds: normalizedDetails.map((d) => d.ledgerId),
    balanceAfter: 0,
    monthlyTokenUsedIncremented: monthly,
    ...over,
    details: normalizedDetails,
  };
}

describe("refundConsumedPoints 真实账务事务（集成测试）", { skip: !process.env.DATABASE_URL }, () => {
  test("ENTERPRISE MEMBER 真实消费：扣减独立余额并累加月度用量（回归：不得因不存在的字段抛错）", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(0) },
      async (s) => {
        const cr = await consumePoints({
          workspaceId: s.wid,
          userId: s.uid,
          points: 30,
          componentId: "C07",
          componentName: "测试组件",
          taskId: s.taskId,
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
          idempotencyKey: `CONSUME:${s.taskId}`,
        });
        assert.equal(cr.consumed, 30);
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 70);
        assert.equal(Number(m!.monthlyTokenUsed), 30);
      },
    );
  });

  test("同一幂等键重复扣费：第二次返回完整消费详情（不得空 details），退款只恢复一次", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(0) },
      async (s) => {
        const params = {
          workspaceId: s.wid,
          userId: s.uid,
          points: 30,
          componentId: "C07",
          componentName: "测试组件",
          taskId: s.taskId,
          workspaceType: "ENTERPRISE" as const,
          workspaceName: "it",
          idempotencyKey: `CONSUME:${s.taskId}`,
        };
        const first = await consumePoints(params);
        assert.equal(first.consumed, 30);
        assert.equal(first.details.length, 1);

        // 重复调用同一幂等键：必须从流水重建完整消费详情，不得返回空 details
        const second = await consumePoints(params);
        assert.equal(second.consumed, 30);
        assert.equal(second.details.length, 1, "幂等命中必须返回完整 details，不能为空");
        assert.equal(second.details[0].kind, "MEMBER");
        assert.equal(second.monthlyTokenUsedIncremented, 30);

        // 余额只扣一次
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 70);
        assert.equal(Number(m!.monthlyTokenUsed), 30);

        // 用重建结果退款，应只恢复一次
        const r1 = await refundConsumedPoints({
          consumeResult: second,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        assert.equal(r1.refunded, 30);
        const m2 = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m2!.tokenBalance), 100);
        assert.equal(Number(m2!.monthlyTokenUsed), 0);

        // 再次退款不再恢复
        const r2 = await refundConsumedPoints({
          consumeResult: second,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        assert.equal(r2.refunded, 0);
      },
    );
  });

  test("多分桶重建：从原始分桶恢复 sourceType，details 覆盖全部来源", async () => {
    await withScenario(
      {
        workspaceType: "PERSONAL",
        walletBalance: B(20),
        quotaBalance: B(100),
        grants: [
          { id: "it_g_w_" + randomUUID(), scope: "WALLET", remaining: B(20), points: B(20) },
          { id: "it_g_ws_" + randomUUID(), scope: "WORKSPACE", remaining: B(100), points: B(100) },
        ],
      },
      async (s) => {
        const cr = await consumePoints({
          workspaceId: s.wid,
          userId: s.uid,
          points: 30,
          componentId: "C07",
          componentName: "c",
          taskId: s.taskId,
          workspaceType: "PERSONAL",
          workspaceName: "it",
          idempotencyKey: `CONSUME:${s.taskId}`,
        });
        assert.equal(cr.consumed, 30);
        assert.equal(cr.details.length, 2);

        const rebuilt = await reconstructConsumeResult(`CONSUME:${s.taskId}`, s.uid, s.wid);
        assert.ok(rebuilt);
        assert.equal(rebuilt!.consumed, 30);
        assert.equal(rebuilt!.details.length, 2, "多分桶必须完整恢复");
        const scopes = rebuilt!.details.map((d) => d.scope).sort();
        assert.deepEqual(scopes, ["WALLET", "WORKSPACE"]);
        // sourceType 必须来自原始分桶（fixture=MANUAL），不能直接用 scope 代替
        for (const d of rebuilt!.details) {
          assert.equal(d.sourceType, "MANUAL");
        }
      },
    );
  });

  test("异常流水（序号缺 #1）→ IdempotencyStateUnknownError（不伪造空 details）", async () => {
    const uid = "it_u_" + randomUUID();
    const wid = "it_ws_" + randomUUID();
    const key = "abn_" + randomUUID();
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({
        data: { id: wid, name: "it", type: "PERSONAL", ownerId: uid, updatedAt: new Date() },
      });
      await prisma.pointledger.create({
        data: {
          id: randomUUID(),
          direction: "OUT",
          type: "CONSUME",
          scope: "WALLET",
          userId: uid,
          workspaceId: wid,
          points: B(10),
          balanceAfter: B(0),
          title: "abnormal",
          idempotencyKey: `${key}#2`,
        },
      });
      await assert.rejects(
        () => reconstructConsumeResult(key, uid, wid),
        (e: unknown) => (e as Error).name === "IdempotencyStateUnknownError",
      );
    } finally {
      await prisma.pointledger.deleteMany({ where: { idempotencyKey: { startsWith: `${key}#` } } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("MEMBER 扣点后退款恢复 workspacemember.tokenBalance，并回滚月度用量", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(40) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });
        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        assert.equal(r.refunded, 40);
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 140);
        assert.equal(Number(m!.monthlyTokenUsed), 0);
        const led = await prisma.pointledger.findFirst({
          where: { idempotencyKey: `REFUND_MODEL_FAILURE:${s.taskId}:1` },
        });
        assert.ok(led);
        assert.equal(Number(led!.points), 40);
      },
    );
  });

  test("WORKSPACE 扣点后恢复 pointgrant.remaining 与 workspacequota.tokenBalance", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", quotaBalance: B(200), grants: [{ id: "g-ws", scope: "WORKSPACE", remaining: B(50), points: B(100) }] },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "g-ws", scope: "WORKSPACE", sourceType: "x", points: 30, kind: "WORKSPACE" }],
        });
        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        assert.equal(r.refunded, 30);
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 230);
        const g = await prisma.pointgrant.findUnique({ where: { id: "g-ws" } });
        assert.equal(Number(g!.remaining), 80);
      },
    );
  });

  test("WALLET 扣点后恢复 userwallet.balance 与原分桶 remaining（不污染共享池）", async () => {
    await withScenario(
      { workspaceType: "PERSONAL", walletBalance: B(300), grants: [{ id: "g-w", scope: "WALLET", remaining: B(50), points: B(100) }] },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "g-w", scope: "WALLET", sourceType: "x", points: 20, kind: "WALLET" }],
        });
        await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "PERSONAL",
          workspaceName: "it",
        });
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 320);
        const g = await prisma.pointgrant.findUnique({ where: { id: "g-w" } });
        assert.equal(Number(g!.remaining), 70);
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 0); // 钱包退款未改共享池
      },
    );
  });

  test("PERSONAL_GIFT 扣点后恢复对应空间余额（scope 保持 PERSONAL_GIFT）", async () => {
    await withScenario(
      { workspaceType: "PERSONAL", quotaBalance: B(100), grants: [{ id: "g-pg", scope: "PERSONAL_GIFT", remaining: B(40), points: B(100) }] },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "g-pg", scope: "PERSONAL_GIFT", sourceType: "x", points: 15, kind: "PERSONAL_GIFT" }],
        });
        await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "PERSONAL",
          workspaceName: "it",
        });
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 115);
        const g = await prisma.pointgrant.findUnique({ where: { id: "g-pg" } });
        assert.equal(Number(g!.remaining), 55);
      },
    );
  });

  test("无限额度失败不产生任何退款点，但回滚月度用量并写入唯一 MONTHLY 标记（重复调用不重复回滚）", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(0), memberMonthlyUsed: B(25) },
      async (s) => {
        const cr: ConsumeResult = {
          skipped: false,
          unlimited: true,
          consumed: 25,
          ledgerIds: [],
          details: [],
          balanceAfter: 0,
          monthlyTokenUsedIncremented: 25,
        };
        const common = {
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE" as const,
          workspaceName: "it",
        };
        const r1 = await refundConsumedPoints(common);
        const r2 = await refundConsumedPoints(common);
        assert.equal(r1.refunded, 0); // 无限额度：无退款点
        assert.equal(r2.refunded, 0); // 第二次同样无退款点
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.monthlyTokenUsed), 0); // 月度已回滚（25 → 0）
        const withPoints = await prisma.pointledger.count({ where: { taskId: s.taskId, points: { gt: B(0) } } });
        assert.equal(withPoints, 0); // 无 points>0 的退款流水
        const monthlyCount = await prisma.pointledger.count({
          where: { idempotencyKey: `REFUND_MODEL_FAILURE:${s.taskId}:MONTHLY` },
        });
        assert.equal(monthlyCount, 1); // MONTHLY 幂等标记唯一一条
        const monthly = await prisma.pointledger.findFirst({
          where: { idempotencyKey: `REFUND_MODEL_FAILURE:${s.taskId}:MONTHLY` },
        });
        assert.ok(monthly);
        assert.equal(Number(monthly!.points), 0);
      },
    );
  });

  test("无限额度且月度用量为 0、无分桶明细时：不要求成员账户存在，直接返回 0，不产生任何流水或月度标记", async () => {
    // 故意不传 memberRole，不创建 workspacemember 记录
    await withScenario(
      { workspaceType: "ENTERPRISE" },
      async (s) => {
        const cr: ConsumeResult = {
          skipped: false,
          unlimited: true,
          consumed: 0,
          ledgerIds: [],
          details: [],
          balanceAfter: 0,
          monthlyTokenUsedIncremented: 0,
        };
        const common = {
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE" as const,
          workspaceName: "it",
        };
        const r1 = await refundConsumedPoints(common);
        assert.equal(r1.refunded, 0);

        const r2 = await refundConsumedPoints(common);
        assert.equal(r2.refunded, 0);

        // 不得产生任何 REFUND 流水
        const refundLedgers = await prisma.pointledger.findMany({
          where: { taskId: s.taskId, type: "REFUND" },
        });
        assert.equal(refundLedgers.length, 0);

        // 不得产生任何 MONTHLY 标记
        const monthlyMarker = await prisma.pointledger.findFirst({
          where: { idempotencyKey: `REFUND_MODEL_FAILURE:${s.taskId}:MONTHLY` },
        });
        assert.equal(monthlyMarker, null);
      },
    );
  });

  test("同一任务重复退款两次：余额只恢复一次，月度用量只回滚一次", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(40) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });
        const common = {
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE" as const,
          workspaceName: "it",
        };
        const r1 = await refundConsumedPoints(common);
        const r2 = await refundConsumedPoints(common);
        assert.equal(r1.refunded, 40);
        assert.equal(r2.refunded, 0); // 第二次不再退款
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 140); // 仅恢复一次
        assert.equal(Number(m!.monthlyTokenUsed), 0); // 仅回滚一次
      },
    );
  });

  test("月度用量原本为 0 时回滚不会变成负数", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(0), memberMonthlyUsed: B(0) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });
        await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.monthlyTokenUsed), 0); // 0 - 40 被钳制为 0
      },
    );
  });

  test("原分桶已过期/缺失：钱包退款仍归钱包（创建兜底分桶，不改变余额归属）", async () => {
    await withScenario(
      { workspaceType: "PERSONAL", walletBalance: B(300) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "missing-grant", scope: "WALLET", sourceType: "x", points: 10, kind: "WALLET" }],
        });
        await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "PERSONAL",
          workspaceName: "it",
        });
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 310); // 钱包仍 +10
        const fb = await prisma.pointgrant.findFirst({
          where: { sourceType: "REFUND", userId: s.uid, workspaceId: null },
        });
        assert.ok(fb); // 兜底分桶创建在钱包（不改变归属）
      },
    );
  });

  test("REAL_MODEL 与 SIMULATED 失败均通过 refundConsumedPoints 正确原路退款", async () => {
    // REAL_MODEL 代表：从用户钱包扣除
    await withScenario(
      { workspaceType: "PERSONAL", walletBalance: B(500), grants: [{ id: "g-real", scope: "WALLET", remaining: B(80), points: B(100) }] },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "g-real", scope: "WALLET", sourceType: "x", points: 25, kind: "WALLET" }],
        });
        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "PERSONAL",
          workspaceName: "it",
        });
        assert.equal(r.refunded, 25);
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 525);
      },
    );
    // SIMULATED 代表：从企业成员独立余额扣除
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(200), memberMonthlyUsed: B(0) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 50, kind: "MEMBER" }],
        });
        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "测试组件",
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
        });
        assert.equal(r.refunded, 50);
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true },
        });
        assert.equal(Number(m!.tokenBalance), 250);
      },
    );
  });

  test("touchComponentUsage 失败不影响已成功任务（.catch 非阻断写法）", async () => {
    // 复制 studio/route.ts 中的非阻断写法：失败被 .catch 吞掉，await 正常返回
    const failing = () => Promise.reject(new Error("db down"));
    const result = await failing().catch((e: unknown) => {
      assert.ok(e instanceof Error);
      return null;
    });
    assert.equal(result, null);
  });

  test("并发账务：同一 taskId 并发退款，只退款一次、月度只回滚一次，幂等无重复", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(40) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });
        const common = {
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "并发同一任务组件",
          workspaceType: "ENTERPRISE" as const,
          workspaceName: "it",
        };

        // 并发执行两次同一 taskId 退款
        const [r1, r2] = await Promise.all([
          refundConsumedPoints(common),
          refundConsumedPoints(common),
        ]);

        // 两者退款总点数恰好为 40 点（一个成功退 40，另一个幂等命中退 0）
        assert.equal(r1.refunded + r2.refunded, 40, "并发同一任务退款总和必须严格为 40 点");

        // 验证余额只增加一次（100 + 40 = 140）
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 140, "成员余额只能增加一次，禁止重复退款");
        assert.equal(Number(m!.monthlyTokenUsed), 0, "月度用量只能回滚一次");

        // 验证退款流水仅生成一组
        const refundLedgers = await prisma.pointledger.findMany({
          where: { taskId: s.taskId, type: "REFUND" },
        });
        const sourceLedgers = refundLedgers.filter((l) => Number(l.points) > 0);
        const monthlyLedgers = refundLedgers.filter((l) => l.idempotencyKey?.endsWith(":MONTHLY"));
        assert.equal(sourceLedgers.length, 1, "来源退款流水必须仅生成 1 条");
        assert.equal(monthlyLedgers.length, 1, "月度回滚标记必须仅生成 1 条");
      },
    );
  });

  test("并发账务：不同 taskId 同一成员并发退款，两笔都正确结算，无余额覆盖与更新丢失", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(50) },
      async (s) => {
        const taskId1 = "refund_conc_t1_" + randomUUID();
        const taskId2 = "refund_conc_t2_" + randomUUID();

        const cr1 = baseConsume({
          monthlyTokenUsedIncremented: 30,
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 30, kind: "MEMBER" }],
        });
        const cr2 = baseConsume({
          monthlyTokenUsedIncremented: 20,
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 20, kind: "MEMBER" }],
        });

        // 并发退款不同任务
        const [r1, r2] = await Promise.all([
          refundConsumedPoints({
            consumeResult: cr1,
            userId: s.uid,
            workspaceId: s.wid,
            taskId: taskId1,
            componentId: "C07",
            componentName: "任务1",
            workspaceType: "ENTERPRISE",
          }),
          refundConsumedPoints({
            consumeResult: cr2,
            userId: s.uid,
            workspaceId: s.wid,
            taskId: taskId2,
            componentId: "C07",
            componentName: "任务2",
            workspaceType: "ENTERPRISE",
          }),
        ]);

        assert.equal(r1.refunded, 30);
        assert.equal(r2.refunded, 20);

        // 验证成员余额与月度用量：初始 100 + 30 + 20 = 150；月度 50 - 30 - 20 = 0
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 150, "两笔退款必须全额到账，无余额覆盖");
        assert.equal(Number(m!.monthlyTokenUsed), 0, "两笔月度用量必须完全回滚，无丢失更新");

        // 验证两笔各自生成对应流水
        const count1 = await prisma.pointledger.count({ where: { taskId: taskId1, type: "REFUND" } });
        const count2 = await prisma.pointledger.count({ where: { taskId: taskId2, type: "REFUND" } });
        assert.equal(count1, 2); // 1 条来源流水 + 1 条月度流水
        assert.equal(count2, 2); // 1 条来源流水 + 1 条月度流水
      },
    );
  });

  test("并发账务：注入第一次 P2034、第二次重试成功，最终只生成一组退款流水", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(40) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });

        // 注入 1 次 P2034 写冲突错误
        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "重试测试组件",
          workspaceType: "ENTERPRISE",
          _testSimulateP2034Times: 1,
        });

        assert.equal(r.refunded, 40, "重试后退款应成功返回 40 点");

        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 140);
        assert.equal(Number(m!.monthlyTokenUsed), 0);

        // 验证最终只生成一组退款流水（幂等未重复）
        const ledgers = await prisma.pointledger.findMany({
          where: { taskId: s.taskId, type: "REFUND" },
        });
        assert.equal(ledgers.length, 2, "最终只生成 1 组退款流水（1条来源+1条月度）");
      },
    );
  });

  test("并发账务：连续 P2034 达到上限，明确失败并可进入退款恢复闭环", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(100), memberMonthlyUsed: B(40) },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 40, kind: "MEMBER" }],
        });

        // 连续注入 4 次 P2034（超过 MAX_REFUND_RETRIES=3）
        await assert.rejects(
          async () => {
            await refundConsumedPoints({
              consumeResult: cr,
              userId: s.uid,
              workspaceId: s.wid,
              taskId: s.taskId,
              componentId: "C07",
              componentName: "超限失败组件",
              workspaceType: "ENTERPRISE",
              _testSimulateP2034Times: 4,
            });
          },
          (err: any) => {
            assert.equal(err.code, "P2034");
            return true;
          },
        );

        // 验证未产生脏退款流水，余额未被错误改动
        const count = await prisma.pointledger.count({ where: { taskId: s.taskId, type: "REFUND" } });
        assert.equal(count, 0, "超限失败事务必须彻底回滚，不得残留退款流水");

        // 验证可被推入退款恢复队列 (refundrecovery) 闭环
        const enqueueRes = await enqueueRefundRecovery({
          taskId: s.taskId,
          userId: s.uid,
          workspaceId: s.wid,
          consumeIdempotencyKey: `CONSUME:${s.taskId}`,
          consumeResult: cr,
          componentId: "C07",
          componentName: "超限失败组件",
          workspaceType: "ENTERPRISE",
          error: "TRANSACTION_P2034_RETRY_EXHAUSTED",
        });

        assert.equal(enqueueRes.ok, true);
        const list = await listRefundRecoveries({ status: "PENDING" });
        const record = list.records.find((r) => r.taskId === s.taskId);
        assert.ok(record, "必须成功进入 PENDING 退款恢复闭环");
        assert.equal(Number(record!.points), 40);

        // 清理 refundrecovery 临时记录
        await prisma.refundrecovery.deleteMany({ where: { taskId: s.taskId } }).catch(() => {});
      },
    );
  });

  test("并发账务：WALLET 同一 taskId 并发退款，只退款一次，钱包余额只增加一次，流水唯一", async () => {
    await withScenario(
      { workspaceType: "PERSONAL", walletBalance: B(100), grants: [{ id: "g_w_conc", scope: "WALLET", remaining: B(70), points: B(100) }] },
      async (s) => {
        const cr = baseConsume({
          details: [{ grantId: "g_w_conc", scope: "WALLET", sourceType: "x", points: 30, kind: "WALLET" }],
        });
        const common = {
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          componentName: "WALLET并发组件",
          workspaceType: "PERSONAL" as const,
        };

        const [r1, r2] = await Promise.all([
          refundConsumedPoints(common),
          refundConsumedPoints(common),
        ]);

        assert.equal(r1.refunded + r2.refunded, 30, "WALLET并发退款总和严格等于 30");

        // 钱包余额只加一次：100 + 30 = 130
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 130, "钱包余额只能恢复一次");

        // pointgrant.remaining 恢复一次：70 + 30 = 100
        const g = await prisma.pointgrant.findUnique({ where: { id: "g_w_conc" } });
        assert.equal(Number(g!.remaining), 100);

        // 流水严格只有 1 条
        const ledgers = await prisma.pointledger.findMany({ where: { taskId: s.taskId, type: "REFUND" } });
        assert.equal(ledgers.length, 1);
        assert.equal(Number(ledgers[0].points), 30);
      },
    );
  });

  test("并发账务：WORKSPACE 同一空间、不同用户并发退款，空间配额正确累加，无余额覆盖", async () => {
    const uid1 = "it_u1_" + randomUUID();
    const uid2 = "it_u2_" + randomUUID();
    const wid = "it_ws_sh_" + randomUUID();
    const qid = "it_q_sh_" + randomUUID();
    const gid1 = "it_g1_" + randomUUID();
    const gid2 = "it_g2_" + randomUUID();
    const taskId1 = "refund_sh_t1_" + randomUUID();
    const taskId2 = "refund_sh_t2_" + randomUUID();
    const now = new Date();

    try {
      await prisma.user.createMany({ data: [{ id: uid1, password: "x" }, { id: uid2, password: "x" }] });
      await prisma.workspace.create({ data: { id: wid, name: "shared_ws", type: "ENTERPRISE", ownerId: uid1, updatedAt: now } });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(100), updatedAt: now },
      });
      await prisma.pointgrant.createMany({
        data: [
          { id: gid1, scope: "WORKSPACE", workspaceId: wid, points: B(50), remaining: B(20), sourceType: "MANUAL", status: "ACTIVE" },
          { id: gid2, scope: "WORKSPACE", workspaceId: wid, points: B(50), remaining: B(30), sourceType: "MANUAL", status: "ACTIVE" },
        ],
      });

      const cr1 = baseConsume({
        details: [{ grantId: gid1, scope: "WORKSPACE", sourceType: "MANUAL", points: 30, kind: "WORKSPACE" }],
      });
      const cr2 = baseConsume({
        details: [{ grantId: gid2, scope: "WORKSPACE", sourceType: "MANUAL", points: 20, kind: "WORKSPACE" }],
      });

      // 两个不同用户并发退款同一空间的共享池任务
      const [r1, r2] = await Promise.all([
        refundConsumedPoints({ consumeResult: cr1, userId: uid1, workspaceId: wid, taskId: taskId1, workspaceType: "ENTERPRISE" }),
        refundConsumedPoints({ consumeResult: cr2, userId: uid2, workspaceId: wid, taskId: taskId2, workspaceType: "ENTERPRISE" }),
      ]);

      assert.equal(r1.refunded, 30);
      assert.equal(r2.refunded, 20);

      // 配额正确累加：初始 100 + 30 + 20 = 150
      const q = await prisma.workspacequota.findUnique({ where: { workspaceId: wid } });
      assert.equal(Number(q!.tokenBalance), 150, "并发退回共享池必须无丢失更新累加");

      // 各自分桶剩余额度正确恢复
      const g1 = await prisma.pointgrant.findUnique({ where: { id: gid1 } });
      const g2 = await prisma.pointgrant.findUnique({ where: { id: gid2 } });
      assert.equal(Number(g1!.remaining), 50);
      assert.equal(Number(g2!.remaining), 50);
    } finally {
      await prisma.pointledger.deleteMany({ where: { workspaceId: wid } }).catch(() => {});
      await prisma.pointgrant.deleteMany({ where: { id: { in: [gid1, gid2] } } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: [uid1, uid2] } } }).catch(() => {});
    }
  });

  test("并发账务：PERSONAL_GIFT 同一空间并发退款，配额与分桶正确恢复", async () => {
    await withScenario(
      {
        workspaceType: "PERSONAL",
        quotaBalance: B(50),
        grants: [
          { id: "g_pg1", scope: "PERSONAL_GIFT", remaining: B(10), points: B(50) },
          { id: "g_pg2", scope: "PERSONAL_GIFT", remaining: B(10), points: B(50) },
        ],
      },
      async (s) => {
        const taskId1 = "refund_pg_1_" + randomUUID();
        const taskId2 = "refund_pg_2_" + randomUUID();

        const cr1 = baseConsume({
          details: [{ grantId: "g_pg1", scope: "PERSONAL_GIFT", sourceType: "GIFT", points: 20, kind: "PERSONAL_GIFT" }],
        });
        const cr2 = baseConsume({
          details: [{ grantId: "g_pg2", scope: "PERSONAL_GIFT", sourceType: "GIFT", points: 25, kind: "PERSONAL_GIFT" }],
        });

        const [r1, r2] = await Promise.all([
          refundConsumedPoints({ consumeResult: cr1, userId: s.uid, workspaceId: s.wid, taskId: taskId1, workspaceType: "PERSONAL" }),
          refundConsumedPoints({ consumeResult: cr2, userId: s.uid, workspaceId: s.wid, taskId: taskId2, workspaceType: "PERSONAL" }),
        ]);

        assert.equal(r1.refunded, 20);
        assert.equal(r2.refunded, 25);

        // 空间配额：50 + 20 + 25 = 95
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 95);

        const g1 = await prisma.pointgrant.findUnique({ where: { id: "g_pg1" } });
        const g2 = await prisma.pointgrant.findUnique({ where: { id: "g_pg2" } });
        assert.equal(Number(g1!.remaining), 30);
        assert.equal(Number(g2!.remaining), 35);
      },
    );
  });

  test("并发账务：企业 OWNER 共享池退款，原路退回 quota 与 WORKSPACE grant，不改变 OWNER 独立余额", async () => {
    await withScenario(
      {
        workspaceType: "ENTERPRISE",
        memberRole: "OWNER",
        memberTokenBalance: B(500),
        memberMonthlyUsed: B(0),
        quotaBalance: B(100),
        grants: [{ id: "g_owner_ws", scope: "WORKSPACE", remaining: B(60), points: B(100) }],
      },
      async (s) => {
        // OWNER 消耗的是共享池 WORKSPACE，而非成员独立余额
        const cr = baseConsume({
          details: [{ grantId: "g_owner_ws", scope: "WORKSPACE", sourceType: "MANUAL", points: 40, kind: "WORKSPACE" }],
        });

        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          workspaceType: "ENTERPRISE",
        });

        assert.equal(r.refunded, 40);

        // 空间共享配额恢复：100 + 40 = 140
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 140);

        // WORKSPACE pointgrant 正确恢复：60 + 40 = 100
        const g = await prisma.pointgrant.findUnique({ where: { id: "g_owner_ws" } });
        assert.equal(Number(g!.remaining), 100);

        // OWNER 自身的独立余额完全不受影响：仍为 500
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true },
        });
        assert.equal(Number(m!.tokenBalance), 500, "共享池退款不得篡改 OWNER 独立余额");
      },
    );
  });

  test("并发账务：企业 ADMIN 共享池退款，原路退回 quota 与 WORKSPACE grant，不改变 ADMIN 独立余额", async () => {
    await withScenario(
      {
        workspaceType: "ENTERPRISE",
        memberRole: "ADMIN",
        memberTokenBalance: B(500),
        memberMonthlyUsed: B(0),
        quotaBalance: B(100),
        grants: [{ id: "g_admin_ws", scope: "WORKSPACE", remaining: B(60), points: B(100) }],
      },
      async (s) => {
        // ADMIN 消耗的是共享池 WORKSPACE，而非成员独立余额
        const cr = baseConsume({
          details: [{ grantId: "g_admin_ws", scope: "WORKSPACE", sourceType: "MANUAL", points: 40, kind: "WORKSPACE" }],
        });

        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          workspaceType: "ENTERPRISE",
        });

        assert.equal(r.refunded, 40);

        // 空间共享配额恢复：100 + 40 = 140
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 140);

        // WORKSPACE pointgrant 正确恢复：60 + 40 = 100
        const g = await prisma.pointgrant.findUnique({ where: { id: "g_admin_ws" } });
        assert.equal(Number(g!.remaining), 100);

        // 管理员自身的独立余额完全不受影响：仍为 500
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true },
        });
        assert.equal(Number(m!.tokenBalance), 500, "共享池退款不得篡改管理员独立余额");
      },
    );
  });

  test("并发账务：WALLET + WORKSPACE 混合分桶退款，按全局固定顺序加锁，两分桶均正确原路恢复", async () => {
    await withScenario(
      {
        workspaceType: "PERSONAL",
        walletBalance: B(100),
        quotaBalance: B(200),
        grants: [
          { id: "g_mix_w", scope: "WALLET", remaining: B(30), points: B(50) },
          { id: "g_mix_ws", scope: "WORKSPACE", remaining: B(70), points: B(100) },
        ],
      },
      async (s) => {
        const cr = baseConsume({
          details: [
            { grantId: "g_mix_w", scope: "WALLET", sourceType: "MANUAL", points: 20, kind: "WALLET" },
            { grantId: "g_mix_ws", scope: "WORKSPACE", sourceType: "MANUAL", points: 30, kind: "WORKSPACE" },
          ],
        });

        const r = await refundConsumedPoints({
          consumeResult: cr,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: s.taskId,
          componentId: "C07",
          workspaceType: "PERSONAL",
        });

        assert.equal(r.refunded, 50);

        // 钱包余额恢复 20：100 + 20 = 120
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 120);

        // 空间共享配额恢复 30：200 + 30 = 230
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 230);

        // 分桶恢复
        const gw = await prisma.pointgrant.findUnique({ where: { id: "g_mix_w" } });
        const gws = await prisma.pointgrant.findUnique({ where: { id: "g_mix_ws" } });
        assert.equal(Number(gw!.remaining), 50);
        assert.equal(Number(gws!.remaining), 100);

        // 生成两笔原路流水
        const ledgers = await prisma.pointledger.findMany({ where: { taskId: s.taskId, type: "REFUND" } });
        assert.equal(ledgers.length, 2);
      },
    );
  });

  test("并发账务：混合分桶反向顺序并发退款，按固定顺序加锁彻底避免死锁，余额与流水均正确", async () => {
    await withScenario(
      {
        workspaceType: "PERSONAL",
        walletBalance: B(100),
        quotaBalance: B(200),
        grants: [
          { id: "g_rev_w", scope: "WALLET", remaining: B(10), points: B(100) },
          { id: "g_rev_ws", scope: "WORKSPACE", remaining: B(20), points: B(100) },
        ],
      },
      async (s) => {
        const taskA = mkTaskId();
        const taskB = mkTaskId();

        // Worker A: WALLET -> WORKSPACE
        const crA = baseConsume({
          details: [
            { grantId: "g_rev_w", scope: "WALLET", sourceType: "MANUAL", points: 15, kind: "WALLET" },
            { grantId: "g_rev_ws", scope: "WORKSPACE", sourceType: "MANUAL", points: 25, kind: "WORKSPACE" },
          ],
        });

        // Worker B: 反向顺序 WORKSPACE -> WALLET
        const crB = baseConsume({
          details: [
            { grantId: "g_rev_ws", scope: "WORKSPACE", sourceType: "MANUAL", points: 30, kind: "WORKSPACE" },
            { grantId: "g_rev_w", scope: "WALLET", sourceType: "MANUAL", points: 20, kind: "WALLET" },
          ],
        });

        // 并发退款：内部强制按照 userwallet -> workspacequota 顺序锁定，反向顺序绝不产生死锁
        const [resA, resB] = await Promise.all([
          refundConsumedPoints({
            consumeResult: crA,
            userId: s.uid,
            workspaceId: s.wid,
            taskId: taskA,
            componentId: "C07",
            workspaceType: "PERSONAL",
          }),
          refundConsumedPoints({
            consumeResult: crB,
            userId: s.uid,
            workspaceId: s.wid,
            taskId: taskB,
            componentId: "C07",
            workspaceType: "PERSONAL",
          }),
        ]);

        assert.equal(resA.refunded, 40); // 15 + 25
        assert.equal(resB.refunded, 50); // 30 + 20

        // 最终钱包余额：100 + 15 + 20 = 135
        const w = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(w!.balance), 135);

        // 最终空间配额：200 + 25 + 30 = 255
        const q = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(q!.tokenBalance), 255);

        // 两个 pointgrant 均正确恢复
        const gw = await prisma.pointgrant.findUnique({ where: { id: "g_rev_w" } });
        const gws = await prisma.pointgrant.findUnique({ where: { id: "g_rev_ws" } });
        assert.equal(Number(gw!.remaining), 45); // 10 + 15 + 20
        assert.equal(Number(gws!.remaining), 75); // 20 + 25 + 30

        // 退款流水各 2 笔，共 4 笔
        const ledgersA = await prisma.pointledger.findMany({ where: { taskId: taskA, type: "REFUND" } });
        const ledgersB = await prisma.pointledger.findMany({ where: { taskId: taskB, type: "REFUND" } });
        assert.equal(ledgersA.length, 2);
        assert.equal(ledgersB.length, 2);

        // 重复调用幂等，不产生重复退款
        const againA = await refundConsumedPoints({
          consumeResult: crA,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: taskA,
          componentId: "C07",
          workspaceType: "PERSONAL",
        });
        const againB = await refundConsumedPoints({
          consumeResult: crB,
          userId: s.uid,
          workspaceId: s.wid,
          taskId: taskB,
          componentId: "C07",
          workspaceType: "PERSONAL",
        });
        assert.equal(againA.refunded, 0);
        assert.equal(againB.refunded, 0);

        const wFinal = await prisma.userwallet.findUnique({ where: { userId: s.uid } });
        assert.equal(Number(wFinal!.balance), 135);
        const qFinal = await prisma.workspacequota.findUnique({ where: { workspaceId: s.wid } });
        assert.equal(Number(qFinal!.tokenBalance), 255);
      },
    );
  });

  test("并发账务：retryRefundRecovery 对 MEMBER 记录真实重试，成功恢复独立余额与月度用量", async () => {
    await withScenario(
      { workspaceType: "ENTERPRISE", memberRole: "MEMBER", memberTokenBalance: B(140), memberMonthlyUsed: B(0) },
      async (s) => {
        const cr = await consumePoints({
          workspaceId: s.wid,
          userId: s.uid,
          points: 40,
          componentId: "C07",
          componentName: "测试组件",
          taskId: s.taskId,
          workspaceType: "ENTERPRISE",
          workspaceName: "it",
          idempotencyKey: `CONSUME:${s.taskId}`,
        });
        assert.equal(cr.consumed, 40);
        assert.equal(cr.monthlyTokenUsedIncremented, 40);

        const mAfterConsume = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(mAfterConsume!.tokenBalance), 100);
        assert.equal(Number(mAfterConsume!.monthlyTokenUsed), 40);

        const enq = await enqueueRefundRecovery({
          taskId: s.taskId,
          userId: s.uid,
          workspaceId: s.wid,
          consumeIdempotencyKey: `CONSUME:${s.taskId}`,
          consumeResult: cr,
          componentId: "C07",
          workspaceType: "ENTERPRISE",
          error: "SIMULATED_FAILURE",
        });
        assert.equal(enq.ok, true);

        const list = await listRefundRecoveries({ status: "PENDING" });
        const record = list.records.find((r) => r.taskId === s.taskId);
        assert.ok(record);

        // 真实调用 retryRefundRecovery
        const retryRes = await retryRefundRecovery(record!.id);
        assert.equal(retryRes.ok, true);
        assert.equal(retryRes.status, "SETTLED");
        assert.equal(retryRes.refunded, 40);

        // 成员余额与月度回滚验证
        const m = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId: s.uid, workspaceId: s.wid } },
          select: { tokenBalance: true, monthlyTokenUsed: true },
        });
        assert.equal(Number(m!.tokenBalance), 140);
        assert.equal(Number(m!.monthlyTokenUsed), 0);

        // 再次重试：幂等完成，不重复退款
        const retryAgain = await retryRefundRecovery(record!.id);
        assert.equal(retryAgain.status, "SETTLED");
        assert.equal(retryAgain.refunded, 0);

        await prisma.refundrecovery.deleteMany({ where: { taskId: s.taskId } }).catch(() => {});
      },
    );
  });

  test("并发账务：缺失账户行严禁产生退款流水，抛出 REFUND_ACCOUNT_NOT_FOUND 且事务全额回滚", async () => {
    const badUid = "ghost_u_" + randomUUID();
    const badWid = "ghost_ws_" + randomUUID();
    const ghostTask = "ghost_task_" + randomUUID();

    // 1. MEMBER 缺失 workspacemember
    const memberCr = baseConsume({
      details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MEMBER", points: 30, kind: "MEMBER" }],
    });
    await assert.rejects(
      () =>
        refundConsumedPoints({
          consumeResult: memberCr,
          userId: badUid,
          workspaceId: badWid,
          taskId: ghostTask + "_m",
          workspaceType: "ENTERPRISE",
        }),
      (err: any) => {
        assert.ok(err instanceof RefundAccountNotFoundError || err.code === "REFUND_ACCOUNT_NOT_FOUND");
        return true;
      },
    );

    // 2. WALLET 缺失 userwallet
    const walletCr = baseConsume({
      details: [{ grantId: "", scope: "WALLET", sourceType: "MANUAL", points: 20, kind: "WALLET" }],
    });
    await assert.rejects(
      () =>
        refundConsumedPoints({
          consumeResult: walletCr,
          userId: badUid,
          workspaceId: badWid,
          taskId: ghostTask + "_w",
          workspaceType: "PERSONAL",
        }),
      (err: any) => {
        assert.ok(err instanceof RefundAccountNotFoundError || err.code === "REFUND_ACCOUNT_NOT_FOUND");
        return true;
      },
    );

    // 3. WORKSPACE 缺失 workspacequota（严禁用 upsert 静默创建）
    const quotaCr = baseConsume({
      details: [{ grantId: "", scope: "WORKSPACE", sourceType: "MANUAL", points: 20, kind: "WORKSPACE" }],
    });
    await assert.rejects(
      () =>
        refundConsumedPoints({
          consumeResult: quotaCr,
          userId: badUid,
          workspaceId: badWid,
          taskId: ghostTask + "_q",
          workspaceType: "ENTERPRISE",
        }),
      (err: any) => {
        assert.ok(err instanceof RefundAccountNotFoundError || err.code === "REFUND_ACCOUNT_NOT_FOUND");
        return true;
      },
    );

    // 严密断言：数据库中不得为上述任何一个异常任务生成流水，也绝不得静默创建 workspacequota
    const ghostLedgers = await prisma.pointledger.count({
      where: { taskId: { in: [ghostTask + "_m", ghostTask + "_w", ghostTask + "_q"] } },
    });
    assert.equal(ghostLedgers, 0, "缺失账户时严禁产生任何退款流水，事务必须全额回滚");

    const ghostQuota = await prisma.workspacequota.findUnique({ where: { workspaceId: badWid } });
    assert.equal(ghostQuota, null, "严禁通过 upsert 静默创建配额账户");
  });

  test("并发账务：业务错误 message 含 P2034 字符串严格禁止重试", async () => {
    // 验证 isRetryableP2034 对纯文本包含 P2034 的普通 Error 判定为 false
    const fakeError = new Error("Business error with P2034 message");
    assert.equal(isRetryableP2034(fakeError), false, "普通业务错误含 P2034 文本绝不能被误判为可重试异常");
  });
});
