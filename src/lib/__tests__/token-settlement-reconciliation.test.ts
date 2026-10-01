import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { type ConsumeDetail } from "@/lib/credit-service";
import { TokenSettlementError } from "@/lib/token-settlement-service";
import {
  scanSettlementReconciliation,
  evaluateTripleConsistency,
  requiredAccountsFromDetails,
  hasValidRecoveryLease,
  repairHoldStatusWithSnapshot,
  getSettlementOperationalStats,
  adminSettlementAction,
  listReconciliationRecords,
} from "@/lib/token-settlement-ops";

const NOW = new Date();
const uid = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

function detail(kind: ConsumeDetail["kind"], points = 10, grantId = "", scope?: string): ConsumeDetail {
  return {
    ledgerId: `l-${randomUUID()}`,
    grantId,
    scope: scope ?? (kind === "MEMBER" ? "WORKSPACE" : kind),
    sourceType: kind === "MEMBER" ? "MEMBER" : "RECHARGE",
    points,
    kind,
  };
}

describe("Phase 2B 收口：结算对账真实性（分桶账户/退补逐条语义/兜底 grant/能力边界）", () => {
  const createdUserIds: string[] = [];
  const createdWsIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdGrantIds: string[] = [];

  async function mkUser(id: string) {
    createdUserIds.push(id);
    await prisma.user.create({ data: { id, email: `${id}@zhige.test`, name: id, role: "USER", status: "active", password: "x" } });
  }
  async function mkWs(id: string, owner: string) {
    createdWsIds.push(id);
    await prisma.workspace.create({ data: { id, name: id, type: "PERSONAL", ownerId: owner, updatedAt: NOW } });
  }
  async function addWallet(u: string) {
    await prisma.userwallet.create({ data: { id: randomUUID(), userId: u, balance: BigInt(0) } });
  }
  async function addQuota(w: string) {
    await prisma.workspacequota.create({ data: { id: `q-${randomUUID()}`, workspaceId: w, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: NOW } });
  }
  async function addMember(u: string, w: string) {
    await prisma.workspacemember.create({ data: { id: randomUUID(), userId: u, workspaceId: w, role: "OWNER", tokenBalance: BigInt(0), monthlyTokenUsed: BigInt(0) } });
  }
  async function addGrant(o: {
    scope: string;
    sourceType: string;
    userId?: string | null;
    workspaceId?: string | null;
    status?: string;
    sourceId?: string | null;
    expiresAt?: Date | null;
  }): Promise<string> {
    const id = randomUUID();
    createdGrantIds.push(id);
    await prisma.pointgrant.create({
      data: {
        id,
        scope: o.scope,
        userId: o.userId ?? null,
        workspaceId: o.workspaceId ?? null,
        points: BigInt(100),
        remaining: BigInt(100),
        sourceType: o.sourceType,
        sourceId: o.sourceId ?? null,
        status: o.status ?? "ACTIVE",
        expiresAt: o.expiresAt ?? null,
        updatedAt: NOW,
      },
    });
    return id;
  }
  async function addLedger(o: {
    taskId: string;
    userId: string;
    workspaceId: string;
    direction: string;
    type: string;
    scope: string;
    points: bigint;
    grantId?: string | null;
    idempotencyKey?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await prisma.pointledger.create({
      data: {
        id,
        taskId: o.taskId,
        userId: o.userId,
        workspaceId: o.workspaceId,
        direction: o.direction,
        type: o.type,
        scope: o.scope,
        points: o.points,
        grantId: o.grantId ?? null,
        idempotencyKey: o.idempotencyKey ?? null,
        title: "recon-test",
        balanceAfter: BigInt(0),
      },
    });
    return id;
  }

  interface TripleOpts {
    taskId: string;
    userId: string;
    workspaceId: string;
    settlementStatus?: string;
    holdStatus?: string;
    settlementVersion?: number;
    holdPoints?: bigint;
    releasedPoints?: bigint;
    supplementPoints?: bigint;
    actualPricePoints?: bigint;
    monthly?: bigint;
    details?: ConsumeDetail[];
    detailsExtra?: Record<string, unknown>;
    recoveryStatus?: string;
    recoveryLeaseUntil?: Date | null;
  }
  async function insertTriple(o: TripleOpts) {
    createdTaskIds.push(o.taskId);
    await prisma.tokensettlementhold.create({
      data: {
        id: randomUUID(),
        taskId: o.taskId,
        userId: o.userId,
        workspaceId: o.workspaceId,
        holdPoints: o.holdPoints ?? BigInt(0),
        monthlyTokenUsedIncremented: o.monthly ?? BigInt(0),
        status: o.holdStatus ?? "HELD",
        idempotencyKey: `HOLD:${o.taskId}`,
        holdDetails: { details: o.details ?? [], consumeLedgerIds: [], consumeIdempotencyKey: "", isUnlimited: false, ...(o.detailsExtra ?? {}) } as object,
        expiresAt: new Date(NOW.getTime() + 600000),
        updatedAt: NOW,
      },
    });
    await prisma.tokensettlement.create({
      data: {
        id: randomUUID(),
        taskId: o.taskId,
        userId: o.userId,
        workspaceId: o.workspaceId,
        status: o.settlementStatus ?? "HOLD",
        holdPoints: o.holdPoints ?? BigInt(0),
        releasedPoints: o.releasedPoints ?? BigInt(0),
        supplementPoints: o.supplementPoints ?? BigInt(0),
        actualPricePoints: o.actualPricePoints ?? BigInt(0),
        settlementVersion: o.settlementVersion ?? 1,
        pricingSnapshot: {} as object,
        updatedAt: NOW,
      },
    });
    if (o.recoveryStatus) {
      await prisma.tokensettlementrecovery.create({
        data: {
          id: randomUUID(),
          taskId: o.taskId,
          userId: o.userId,
          workspaceId: o.workspaceId,
          status: o.recoveryStatus,
          recoveryType: "SETTLEMENT_FAILED",
          leaseUntil: o.recoveryLeaseUntil ?? null,
          updatedAt: NOW,
        },
      });
    }
  }

  async function findings(taskId: string) {
    return (await scanSettlementReconciliation({ taskId, autoFix: false })).findings;
  }
  const codes = (fs: Awaited<ReturnType<typeof findings>>) => fs.map((f) => f.code).filter(Boolean);

  /**
   * 构造一个「结构自洽」的终态结算（WALLET 单分桶）：
   * 消费流水 20 + 退款流水（可定制）+ 可选补扣流水 + holdDetails 一致。
   */
  async function setupSettled(o: {
    taskId: string;
    user: string;
    ws: string;
    grant: string;
    holdPoints?: bigint;
    releasedPoints?: bigint;
    supplementPoints?: bigint;
    actualPricePoints?: bigint;
    settlementStatus?: "SETTLED" | "RELEASED";
    refund?: { points: bigint; grantId: string | null; scope?: string; direction?: string; userId?: string; workspaceId?: string; idempotencyKey: string };
    supplement?: { points: bigint; grantId: string | null; idempotencyKey: string; direction?: string };
  }) {
    const holdPoints = o.holdPoints ?? BigInt(20);
    const consumeKey = `CONSUME:${o.taskId}#1`;
    const consumeId = await addLedger({ taskId: o.taskId, userId: o.user, workspaceId: o.ws, direction: "OUT", type: "CONSUME", scope: "WALLET", points: holdPoints, grantId: o.grant, idempotencyKey: consumeKey });
    if (o.refund) {
      await addLedger({
        taskId: o.taskId,
        userId: o.refund.userId ?? o.user,
        workspaceId: o.refund.workspaceId ?? o.ws,
        direction: o.refund.direction ?? "IN",
        type: "REFUND",
        scope: o.refund.scope ?? "WALLET",
        points: o.refund.points,
        grantId: o.refund.grantId,
        idempotencyKey: o.refund.idempotencyKey,
      });
    }
    if (o.supplement) {
      await addLedger({
        taskId: o.taskId,
        userId: o.user,
        workspaceId: o.ws,
        direction: o.supplement.direction ?? "OUT",
        type: "CONSUME",
        scope: "WALLET",
        points: o.supplement.points,
        grantId: o.supplement.grantId,
        idempotencyKey: o.supplement.idempotencyKey,
      });
    }
    await insertTriple({
      taskId: o.taskId,
      userId: o.user,
      workspaceId: o.ws,
      settlementStatus: o.settlementStatus ?? "SETTLED",
      holdStatus: o.settlementStatus ?? "SETTLED",
      holdPoints,
      releasedPoints: o.releasedPoints ?? BigInt(0),
      supplementPoints: o.supplementPoints ?? BigInt(0),
      actualPricePoints: o.actualPricePoints ?? holdPoints,
      details: [{ ledgerId: consumeId, grantId: o.grant, scope: "WALLET", sourceType: "RECHARGE", points: Number(holdPoints), kind: "WALLET" }],
      detailsExtra: { consumeLedgerIds: [consumeId], consumeIdempotencyKey: consumeKey },
    });
    return { consumeId };
  }

  after(async () => {
    if (createdTaskIds.length) {
      await prisma.pointledger.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.tokensettlementrecovery.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.tokensettlementhold.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.tokensettlement.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    }
    if (createdUserIds.length) {
      await prisma.pointledger.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userwallet.deleteMany({ where: { userId: { in: createdUserIds } } });
    }
    if (createdGrantIds.length) await prisma.pointgrant.deleteMany({ where: { id: { in: createdGrantIds } } });
    if (createdWsIds.length) {
      await prisma.workspacemember.deleteMany({ where: { workspaceId: { in: createdWsIds } } });
      await prisma.workspacequota.deleteMany({ where: { workspaceId: { in: createdWsIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWsIds } } });
    }
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    // 断言本轮精确 ID 零残留（清理失败不得吞掉；绝不删除历史残留数据）
    const residue = {
      settlementByTask: createdTaskIds.length ? await prisma.tokensettlement.count({ where: { taskId: { in: createdTaskIds } } }) : 0,
      holdByTask: createdTaskIds.length ? await prisma.tokensettlementhold.count({ where: { taskId: { in: createdTaskIds } } }) : 0,
      recoveryByTask: createdTaskIds.length ? await prisma.tokensettlementrecovery.count({ where: { taskId: { in: createdTaskIds } } }) : 0,
      ledgerByTask: createdTaskIds.length ? await prisma.pointledger.count({ where: { taskId: { in: createdTaskIds } } }) : 0,
      ledgerByUser: createdUserIds.length ? await prisma.pointledger.count({ where: { userId: { in: createdUserIds } } }) : 0,
      grants: createdGrantIds.length ? await prisma.pointgrant.count({ where: { id: { in: createdGrantIds } } }) : 0,
      members: createdWsIds.length ? await prisma.workspacemember.count({ where: { workspaceId: { in: createdWsIds } } }) : 0,
      quotas: createdWsIds.length ? await prisma.workspacequota.count({ where: { workspaceId: { in: createdWsIds } } }) : 0,
      workspaces: createdWsIds.length ? await prisma.workspace.count({ where: { id: { in: createdWsIds } } }) : 0,
      users: createdUserIds.length ? await prisma.user.count({ where: { id: { in: createdUserIds } } }) : 0,
    };
    for (const [k, v] of Object.entries(residue)) {
      if (v !== 0) throw new Error(`[recon-test] 本轮精确 ID 未清理干净: ${k}=${v}`);
    }
  });

  test("1. 分桶账户需求判定", () => {
    assert.deepEqual(requiredAccountsFromDetails([detail("WALLET")], BigInt(0)), { wallet: true, quota: false, member: false, buckets: ["WALLET"] });
    assert.deepEqual(requiredAccountsFromDetails([detail("WORKSPACE")], BigInt(0)), { wallet: false, quota: true, member: false, buckets: ["WORKSPACE"] });
    assert.deepEqual(requiredAccountsFromDetails([detail("PERSONAL_GIFT")], BigInt(0)), { wallet: false, quota: true, member: false, buckets: ["PERSONAL_GIFT"] });
    assert.deepEqual(requiredAccountsFromDetails([detail("MEMBER")], BigInt(0)), { wallet: false, quota: false, member: true, buckets: ["MEMBER"] });
    assert.equal(requiredAccountsFromDetails([detail("WALLET")], BigInt(5)).member, true);
  });

  test("2. 租约与恢复语义：null / 非法日期 / 过期 均视为无有效租约", () => {
    assert.equal(hasValidRecoveryLease(null, NOW), false);
    assert.equal(hasValidRecoveryLease("not-a-date", NOW), false);
    assert.equal(hasValidRecoveryLease(new Date(Date.now() - 1000), NOW), false);
    assert.equal(hasValidRecoveryLease(new Date(Date.now() + 60000), NOW), true);

    // 终态错配
    assert.ok(
      evaluateTripleConsistency({ taskId: "t", userId: "u", workspaceId: "w", settlementStatus: "SETTLED", holdStatus: "SETTLED", recoveryStatus: "PENDING" }).some((f) => f.kind === "RECOVERY_TERMINAL_MISMATCH")
    );
    // PROCESSING + null 租约 => stale
    assert.ok(
      evaluateTripleConsistency({ taskId: "t", userId: "u", workspaceId: "w", settlementStatus: "HOLD", holdStatus: "HELD", recoveryStatus: "PROCESSING", recoveryLeaseUntil: null }).some((f) => f.kind === "RECOVERY_STALE_PROCESSING")
    );
    // PROCESSING + 非法日期 => stale
    assert.ok(
      evaluateTripleConsistency({ taskId: "t", userId: "u", workspaceId: "w", settlementStatus: "HOLD", holdStatus: "HELD", recoveryStatus: "PROCESSING", recoveryLeaseUntil: "bad" }).some((f) => f.kind === "RECOVERY_STALE_PROCESSING")
    );
    // PROCESSING + 有效租约 => 无 stale
    assert.ok(
      !evaluateTripleConsistency({ taskId: "t", userId: "u", workspaceId: "w", settlementStatus: "HOLD", holdStatus: "HELD", recoveryStatus: "PROCESSING", recoveryLeaseUntil: new Date(Date.now() + 60000) }).some((f) => f.kind === "RECOVERY_STALE_PROCESSING")
    );
  });

  test("3. PROCESSING + leaseUntil=null 的数据库集成（RECOVERY_STALE_PROCESSING）", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const tid = `task-recon-null-lease-${uid()}`;
    await insertTriple({ taskId: tid, userId: u, workspaceId: w, recoveryStatus: "PROCESSING", recoveryLeaseUntil: null });
    const f = await findings(tid);
    assert.ok(f.some((x) => x.kind === "RECOVERY_STALE_PROCESSING"), "PROCESSING 无租约必须报告 stale");
  });

  test("4. 账户完整性：分桶精确、不要求无关账户", async () => {
    const u1 = `test-user-${uid()}`, w1 = `test-ws-${uid()}`;
    await mkUser(u1);
    await mkWs(w1, u1);
    await addWallet(u1);
    const t1 = `task-recon-acc-wallet-${uid()}`;
    await insertTriple({ taskId: t1, userId: u1, workspaceId: w1, details: [detail("WALLET")] });
    assert.equal((await findings(t1)).filter((f) => f.kind === "ACCOUNT_MISSING").length, 0, "WALLET 不得要求 quota/member");

    const u2 = `test-user-${uid()}`, w2 = `test-ws-${uid()}`;
    await mkUser(u2);
    await mkWs(w2, u2);
    await addQuota(w2);
    const t2 = `task-recon-acc-ws-${uid()}`;
    await insertTriple({ taskId: t2, userId: u2, workspaceId: w2, details: [detail("WORKSPACE"), detail("PERSONAL_GIFT")] });
    assert.equal((await findings(t2)).filter((f) => f.kind === "ACCOUNT_MISSING").length, 0, "WORKSPACE/PERSONAL_GIFT 只要求 quota");

    const u3 = `test-user-${uid()}`, w3 = `test-ws-${uid()}`;
    await mkUser(u3);
    await mkWs(w3, u3);
    await addMember(u3, w3);
    const t3 = `task-recon-acc-member-${uid()}`;
    await insertTriple({ taskId: t3, userId: u3, workspaceId: w3, details: [detail("MEMBER")], monthly: BigInt(10) });
    assert.equal((await findings(t3)).filter((f) => f.kind === "ACCOUNT_MISSING").length, 0, "MEMBER 只要求 member");

    const t4 = `task-recon-acc-miss-${uid()}`;
    await insertTriple({ taskId: t4, userId: u3, workspaceId: w3, details: [detail("WALLET")] });
    const f4 = (await findings(t4)).filter((f) => f.kind === "ACCOUNT_MISSING");
    assert.equal(f4.length, 1);
    assert.match(f4[0].actual, /userwallet/);
  });

  test("5. 金额求和错配（消费/退款/补扣）", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const t1 = `task-recon-sum-consume-${uid()}`;
    await insertTriple({ taskId: t1, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "SETTLED", holdPoints: BigInt(20), releasedPoints: BigInt(20), actualPricePoints: BigInt(0) });
    assert.ok(codes(await findings(t1)).includes("CONSUME_SUM_MISMATCH"));

    const t2 = `task-recon-sum-refund-${uid()}`;
    await insertTriple({ taskId: t2, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "SETTLED", holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15) });
    assert.ok(codes(await findings(t2)).includes("REFUND_SUM_MISMATCH"));

    const t3 = `task-recon-sum-suppl-${uid()}`;
    await insertTriple({ taskId: t3, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "SETTLED", holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23) });
    assert.ok(codes(await findings(t3)).includes("SUPPLEMENT_SUM_MISMATCH"));
  });

  test("6. 金额方程错配", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const tid = `task-recon-eq-${uid()}`;
    await insertTriple({ taskId: tid, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "SETTLED", holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(999) });
    const f = (await findings(tid)).filter((x) => x.kind === "AMOUNT_EQUATION_MISMATCH");
    assert.equal(f.length, 1);
    assert.match(f[0].expected, /= 15/);
  });

  test("7. 合法：差额释放不误报", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-legal-diff-${uid()}`;
    await setupSettled({ taskId: tid, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, idempotencyKey: `SETTLEMENT_RELEASE:${tid}:0` } });
    assert.deepEqual(await findings(tid), [], "合法差额释放不得产生任何发现项");
  });

  test("8. 合法：失败释放（普通退款）不误报", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-legal-fail-${uid()}`;
    await setupSettled({ taskId: tid, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(20), actualPricePoints: BigInt(0), settlementStatus: "RELEASED", refund: { points: BigInt(20), grantId: g, idempotencyKey: `SETTLEMENT_FAIL_RELEASE:${tid}:0` } });
    assert.deepEqual(await findings(tid), [], "合法失败释放不得产生任何发现项");
  });

  test("9. 合法：管理员释放不误报", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-legal-admin-${uid()}`;
    await setupSettled({ taskId: tid, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(20), actualPricePoints: BigInt(0), settlementStatus: "RELEASED", refund: { points: BigInt(20), grantId: g, idempotencyKey: `ADMIN_REVIEW_RELEASE:${tid}:0` } });
    assert.deepEqual(await findings(tid), [], "合法管理员释放不得产生任何发现项");
  });

  test("10. 合法：补扣不误报", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const g2 = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-legal-suppl-${uid()}`;
    await setupSettled({
      taskId: tid,
      user: u,
      ws: w,
      grant: g,
      holdPoints: BigInt(20),
      supplementPoints: BigInt(3),
      actualPricePoints: BigInt(23),
      supplement: { points: BigInt(3), grantId: g2, idempotencyKey: `SETTLEMENT_SUPPLEMENT:${tid}#1` },
    });
    // 无退款即不创建退款流水；releasedPoints=0，合法补扣不得产生任何发现项
    assert.deepEqual(await findings(tid), [], "合法补扣不得产生任何发现项");
  });

  test("11. 合法：0 点月度回滚标记不计入 releasedPoints 且不误报", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-legal-marker-${uid()}`;
    await setupSettled({ taskId: tid, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, idempotencyKey: `SETTLEMENT_RELEASE:${tid}:0` } });
    // 追加 0 点月度回滚标记
    await addLedger({ taskId: tid, userId: u, workspaceId: w, direction: "IN", type: "REFUND", scope: "WORKSPACE", points: BigInt(0), grantId: null, idempotencyKey: `REFUND_MODEL_FAILURE:${tid}:MONTHLY` });
    const f = await findings(tid);
    assert.deepEqual(f, [], "0 点月度标记不得计入 releasedPoints 也不得误报");
  });

  test("12. 强断言：REFUND direction=OUT（金额相同）仍失败", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    const tid = `task-recon-neg-dir-${uid()}`;
    await setupSettled({ taskId: tid, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, direction: "OUT", idempotencyKey: `SETTLEMENT_RELEASE:${tid}:0` } });
    assert.ok(codes(await findings(tid)).includes("REFUND_DIRECTION_INVALID"));
  });

  test("13. 强断言：退款 user/workspace/scope/grant 错配", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });

    const tUser = `task-recon-neg-user-${uid()}`;
    await setupSettled({ taskId: tUser, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, userId: `other-${uid()}`, idempotencyKey: `SETTLEMENT_RELEASE:${tUser}:0` } });
    assert.ok(codes(await findings(tUser)).includes("REFUND_ACCOUNT_MISMATCH"));

    const tScope = `task-recon-neg-scope-${uid()}`;
    await setupSettled({ taskId: tScope, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, scope: "WORKSPACE", idempotencyKey: `SETTLEMENT_RELEASE:${tScope}:0` } });
    assert.ok(codes(await findings(tScope)).includes("REFUND_SCOPE_GRANT_MISMATCH"));

    // 原 grant 已过期且无兜底 => 既无有效原 grant 也无兜底 => REFUND_GRANT_MISSING
    const tGrant = `task-recon-neg-grant-${uid()}`;
    const gExp = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u, status: "EXPIRED" });
    await setupSettled({ taskId: tGrant, user: u, ws: w, grant: gExp, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: gExp, idempotencyKey: `SETTLEMENT_RELEASE:${tGrant}:0` } });
    assert.ok(codes(await findings(tGrant)).includes("REFUND_GRANT_MISSING"));
  });

  test("14. 强断言：退款伪造幂等前缀 / 序号重复", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });

    const tForge = `task-recon-neg-forge-${uid()}`;
    await setupSettled({ taskId: tForge, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: g, idempotencyKey: `FORGED:${tForge}:0` } });
    assert.ok(codes(await findings(tForge)).includes("REFUND_IDEMPOTENCY_INVALID"));

    const tDup = `task-recon-neg-dup-${uid()}`;
    await setupSettled({ taskId: tDup, user: u, ws: w, grant: g, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(2), grantId: g, idempotencyKey: `SETTLEMENT_RELEASE:${tDup}:1` } });
    await addLedger({ taskId: tDup, userId: u, workspaceId: w, direction: "IN", type: "REFUND", scope: "WALLET", points: BigInt(3), grantId: g, idempotencyKey: `SETTLEMENT_RELEASE:${tDup}:01` });
    assert.ok(codes(await findings(tDup)).includes("REFUND_IDEMPOTENCY_DUPLICATE"), "序号 1 与 01 视为重复");
  });

  test("15. 强断言：补扣（含管理员补扣）方向/前缀/grant/序号", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });

    // 合法管理员补扣：不得出现 CONSUME_SUM_MISMATCH / SUPPLEMENT_SUM_MISMATCH
    const tLegalAdmin = `task-recon-legal-admin-suppl-${uid()}`;
    const gA = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });
    await setupSettled({ taskId: tLegalAdmin, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23), supplement: { points: BigInt(3), grantId: gA, idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tLegalAdmin}#1` } });
    const legal = await findings(tLegalAdmin);
    assert.ok(!codes(legal).includes("CONSUME_SUM_MISMATCH") && !codes(legal).includes("SUPPLEMENT_SUM_MISMATCH"), "合法管理员补扣不得求和错配");
    assert.deepEqual(legal, [], "合法管理员补扣不得产生任何发现项");

    // 伪造管理员前缀（序号非数字）
    const tForge = `task-recon-neg-suppl-forge-${uid()}`;
    await setupSettled({ taskId: tForge, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23), supplement: { points: BigInt(3), grantId: g, idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tForge}#abc` } });
    assert.ok(codes(await findings(tForge)).includes("SUPPLEMENT_IDEMPOTENCY_INVALID"));

    // 伪造 taskId（基前缀合法但任务不符）
    const tWrongTask = `task-recon-neg-suppl-task-${uid()}`;
    await setupSettled({ taskId: tWrongTask, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23), supplement: { points: BigInt(3), grantId: g, idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:OTHER-TASK#1` } });
    assert.ok(codes(await findings(tWrongTask)).includes("SUPPLEMENT_IDEMPOTENCY_INVALID"));

    // 错误方向
    const tDir = `task-recon-neg-suppl-dir-${uid()}`;
    await setupSettled({ taskId: tDir, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23), supplement: { points: BigInt(3), grantId: g, direction: "IN", idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tDir}#1` } });
    assert.ok(codes(await findings(tDir)).includes("SUPPLEMENT_DIRECTION_INVALID"));

    // 错误 grant（缺失）
    const tGrant = `task-recon-neg-suppl-grant-${uid()}`;
    await setupSettled({ taskId: tGrant, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23), supplement: { points: BigInt(3), grantId: randomUUID(), idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tGrant}#1` } });
    assert.ok(codes(await findings(tGrant)).includes("SUPPLEMENT_GRANT_MISSING"));

    // 序号重复（#1 与 #01 规范化为同序号）
    const tDup = `task-recon-neg-suppl-dup-${uid()}`;
    await setupSettled({ taskId: tDup, user: u, ws: w, grant: g, holdPoints: BigInt(20), supplementPoints: BigInt(5), actualPricePoints: BigInt(25), supplement: { points: BigInt(2), grantId: g, idempotencyKey: `SETTLEMENT_SUPPLEMENT:${tDup}#1` } });
    await addLedger({ taskId: tDup, userId: u, workspaceId: w, direction: "OUT", type: "CONSUME", scope: "WALLET", points: BigInt(3), grantId: g, idempotencyKey: `SETTLEMENT_SUPPLEMENT:${tDup}#01` });
    assert.ok(codes(await findings(tDup)).includes("SUPPLEMENT_IDEMPOTENCY_DUPLICATE"));
  });

  test("16. 强断言：兜底退款 grant sourceId/scope 错配", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const gOrig = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u, status: "EXPIRED" });
    const tid = `task-recon-neg-fallback-${uid()}`;
    const key = `SETTLEMENT_RELEASE:${tid}:0`;
    // 兜底 grant：sourceId 匹配（= 幂等键），但 scope 错误
    await addGrant({ scope: "WORKSPACE", sourceType: "REFUND", userId: u, sourceId: key });
    await setupSettled({ taskId: tid, user: u, ws: w, grant: gOrig, holdPoints: BigInt(20), releasedPoints: BigInt(5), actualPricePoints: BigInt(15), refund: { points: BigInt(5), grantId: gOrig, idempotencyKey: key } });
    assert.ok(codes(await findings(tid)).includes("REFUND_FALLBACK_GRANT_MISMATCH"));
  });

  test("16b. 0 点退款：仅接受生产月度回滚标记，未知/方向/账户异常必须报告", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    await addWallet(u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });

    // 合法月度回滚标记
    const tOk = `task-recon-zero-ok-${uid()}`;
    await setupSettled({ taskId: tOk, user: u, ws: w, grant: g, holdPoints: BigInt(20), actualPricePoints: BigInt(20) });
    await addLedger({ taskId: tOk, userId: u, workspaceId: w, direction: "IN", type: "REFUND", scope: "WORKSPACE", points: BigInt(0), grantId: null, idempotencyKey: `REFUND_MODEL_FAILURE:${tOk}:MONTHLY` });
    assert.deepEqual(await findings(tOk), [], "合法月度回滚标记不得误报");

    // 未知零点退款
    const tUnknown = `task-recon-zero-unknown-${uid()}`;
    await setupSettled({ taskId: tUnknown, user: u, ws: w, grant: g, holdPoints: BigInt(20), actualPricePoints: BigInt(20) });
    await addLedger({ taskId: tUnknown, userId: u, workspaceId: w, direction: "IN", type: "REFUND", scope: "WALLET", points: BigInt(0), grantId: null, idempotencyKey: `SETTLEMENT_RELEASE:${tUnknown}:0` });
    assert.ok(codes(await findings(tUnknown)).includes("REFUND_ZERO_UNKNOWN"));

    // 月度标记方向错误
    const tDir = `task-recon-zero-dir-${uid()}`;
    await setupSettled({ taskId: tDir, user: u, ws: w, grant: g, holdPoints: BigInt(20), actualPricePoints: BigInt(20) });
    await addLedger({ taskId: tDir, userId: u, workspaceId: w, direction: "OUT", type: "REFUND", scope: "WORKSPACE", points: BigInt(0), grantId: null, idempotencyKey: `REFUND_MODEL_FAILURE:${tDir}:MONTHLY` });
    assert.ok(codes(await findings(tDir)).includes("MONTHLY_MARKER_DIRECTION_INVALID"));

    // 月度标记账户错误
    const tAcc = `task-recon-zero-acc-${uid()}`;
    await setupSettled({ taskId: tAcc, user: u, ws: w, grant: g, holdPoints: BigInt(20), actualPricePoints: BigInt(20) });
    await addLedger({ taskId: tAcc, userId: `other-${uid()}`, workspaceId: w, direction: "IN", type: "REFUND", scope: "WORKSPACE", points: BigInt(0), grantId: null, idempotencyKey: `REFUND_MODEL_FAILURE:${tAcc}:MONTHLY` });
    assert.ok(codes(await findings(tAcc)).includes("MONTHLY_MARKER_ACCOUNT_MISMATCH"));
  });

  test("17. autoFix 事务化 CAS + 审计；竞态不覆盖新状态", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const tFix = `task-recon-autofix-${uid()}`;
    await insertTriple({ taskId: tFix, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "HELD" });
    const res = await scanSettlementReconciliation({ taskId: tFix, autoFix: true, operator: "ops-test" });
    assert.equal(res.appliedFixes.length, 1);
    const hold = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: tFix } });
    assert.equal(hold.status, "SETTLED");
    const settle = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: tFix } });
    assert.ok(settle.auditMessage?.includes("REPAIR_HOLD_STATUS") && settle.auditMessage?.includes("ops-test"));

    const tRace = `task-recon-race-${uid()}`;
    await insertTriple({ taskId: tRace, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "HELD", settlementVersion: 1 });
    const stale = { taskId: tRace, settlementStatus: "SETTLED", settlementVersion: 1, holdStatus: "HELD", recoveryStatus: null as string | null };
    await prisma.tokensettlement.update({ where: { taskId: tRace }, data: { settlementVersion: 2 } });
    const r = await repairHoldStatusWithSnapshot(stale, { operator: "ops-test", reason: "陈旧快照" });
    assert.equal(r.applied, false);
    assert.equal(r.conflict, true);
    const hold2 = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: tRace } });
    assert.equal(hold2.status, "HELD");
    const settle2 = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId: tRace } });
    assert.ok(!(settle2.auditMessage ?? "").includes("REPAIR_HOLD_STATUS"), "并发冲突不得写审计（原子回滚）");
  });

  test("18. 统计与能力边界：retryErrorMarkerCount + verificationScope", async () => {
    const stats = await getSettlementOperationalStats({});
    assert.ok(typeof stats.anomalies.retryErrorMarkerCount === "number");
    assert.ok(stats.anomalies.retryErrorMarkerLabel.includes("非真实重试次数"));
    assert.ok(!("p2034RetryCount" in stats.anomalies));

    const scan = await scanSettlementReconciliation({ limit: 1 });
    assert.equal(scan.verificationScope.ledgerStructure, true);
    assert.equal(scan.verificationScope.amountEquation, true);
    assert.equal(scan.verificationScope.accountBalanceAggregate, false, "本轮不得宣称账户余额已完整核对");

    const dumped = JSON.stringify(stats).toLowerCase();
    for (const forbidden of ["apikey", "api_key", "jwt", "secret", "password", "authorization", "bearer", "@zhige.test"]) {
      assert.ok(!dumped.includes(forbidden), `统计不得包含敏感字段: ${forbidden}`);
    }
  });

  test("19. 管理员动作 fencing/version 校验与幂等", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const adminUserId = `admin-test-${uid()}`;

    const tRetry = `task-recon-retry-${uid()}`;
    await insertTriple({ taskId: tRetry, userId: u, workspaceId: w, recoveryStatus: "PROCESSING", recoveryLeaseUntil: new Date(Date.now() - 5000) });
    const first = await adminSettlementAction({ taskId: tRetry, action: "retry", adminUserId, reason: "过期重试" });
    assert.equal(first.applied, true);
    assert.equal((await adminSettlementAction({ taskId: tRetry, action: "retry", adminUserId, reason: "重复" })).idempotent, true);

    const tMark = `task-recon-mark-${uid()}`;
    await insertTriple({ taskId: tMark, userId: u, workspaceId: w, recoveryStatus: "PENDING" });
    assert.equal((await adminSettlementAction({ taskId: tMark, action: "mark-review", adminUserId, reason: "核查" })).status, "REQUIRES_REVIEW");
    assert.equal((await adminSettlementAction({ taskId: tMark, action: "mark-review", adminUserId, reason: "重复" })).idempotent, true);

    const tRel = `task-recon-rel-${uid()}`;
    await insertTriple({ taskId: tRel, userId: u, workspaceId: w, settlementStatus: "REQUIRES_REVIEW", holdStatus: "REQUIRES_REVIEW", recoveryStatus: "REQUIRES_REVIEW" });
    await assert.rejects(
      adminSettlementAction({ taskId: tRel, action: "release", adminUserId, reason: "版本冲突", expectedSettlementVersion: 999 }),
      (e: unknown) => e instanceof TokenSettlementError && e.code === "SETTLEMENT_VERSION_MISMATCH"
    );
  });

  test("20. listReconciliationRecords：分页与筛选", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const tid = `task-recon-list-${uid()}`;
    await insertTriple({ taskId: tid, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "SETTLED" });
    const res = await listReconciliationRecords({ filters: { userId: u }, page: 1, pageSize: 5, includeConsistent: true });
    assert.ok(res.records.some((r) => r.taskId === tid));
    assert.equal(res.pageSize, 5);
  });

  test("21. 两类补扣前缀保持回归：SETTLEMENT_SUPPLEMENT / ADMIN_REVIEW_SUPPLEMENT 均须合法", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const g = await addGrant({ scope: "WALLET", sourceType: "RECHARGE", userId: u });

    const tSys = `task-recon-prefix-sys-${uid()}`;
    await setupSettled({
      taskId: tSys, user: u, ws: w, grant: g,
      holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23),
      supplement: { points: BigInt(3), grantId: g, idempotencyKey: `SETTLEMENT_SUPPLEMENT:${tSys}#1` },
    });
    const sysCodes = codes(await findings(tSys));
    assert.ok(!sysCodes.includes("SUPPLEMENT_IDEMPOTENCY_INVALID"), "SETTLEMENT_SUPPLEMENT: 前缀必须保持合法（不得改名）");

    const tAdmin = `task-recon-prefix-admin-${uid()}`;
    await setupSettled({
      taskId: tAdmin, user: u, ws: w, grant: g,
      holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23),
      supplement: { points: BigInt(3), grantId: g, idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tAdmin}#1` },
    });
    const adminCodes = codes(await findings(tAdmin));
    assert.ok(!adminCodes.includes("SUPPLEMENT_IDEMPOTENCY_INVALID"), "ADMIN_REVIEW_SUPPLEMENT: 前缀必须保持合法（不得改名）");

    // 反向证明：前缀虽合法但序号非法时仍须判非法（说明上面两个正向断言来自前缀白名单，而非恒真）
    const tFake = `task-recon-prefix-fake-${uid()}`;
    await setupSettled({
      taskId: tFake, user: u, ws: w, grant: g,
      holdPoints: BigInt(20), supplementPoints: BigInt(3), actualPricePoints: BigInt(23),
      supplement: { points: BigInt(3), grantId: g, idempotencyKey: `ADMIN_REVIEW_SUPPLEMENT:${tFake}#abc` },
    });
    assert.ok(
      codes(await findings(tFake)).includes("SUPPLEMENT_IDEMPOTENCY_INVALID"),
      "补扣幂等键非法时必须判定 SUPPLEMENT_IDEMPOTENCY_INVALID",
    );
  });

  test("22. 只读对账运行：不 autoFix、零账务写入、输出 findings/统计，且重复执行结果一致", async () => {
    const u = `test-user-${uid()}`, w = `test-ws-${uid()}`;
    await mkUser(u);
    await mkWs(w, u);
    const t = `task-recon-readonly-${uid()}`;
    // 人为制造不一致：settlement=SETTLED 而 hold=HELD（autoFix=true 时会被修复）
    await insertTriple({ taskId: t, userId: u, workspaceId: w, settlementStatus: "SETTLED", holdStatus: "HELD" });

    const countLedger = () => prisma.pointledger.count({ where: { userId: u } });
    const countGrant = () => prisma.pointgrant.count({ where: { userId: u } });
    const countRecovery = () => prisma.tokensettlementrecovery.count({ where: { taskId: t } });

    const ledgerBefore = await countLedger();
    const grantBefore = await countGrant();
    const recoveryBefore = await countRecovery();

    const stats1 = await getSettlementOperationalStats({ userId: u });
    assert.equal(typeof stats1.anomalies.retryErrorMarkerCount, "number");

    const r1 = await scanSettlementReconciliation({ taskId: t, autoFix: false, operator: "readonly-test" });
    assert.equal(r1.autoFix, false, "只读运行必须声明 autoFix=false");
    assert.equal(r1.appliedFixes.length, 0, "只读运行不得执行任何自动修复");
    assert.ok(r1.scanned >= 1, "必须实际扫描到目标任务");
    assert.ok(r1.findingsCount >= 1, "不一致任务必须输出 findings");
    assert.ok(r1.findings.length >= 1);
    for (const f of r1.findings) {
      assert.equal(f.taskId, t, "finding 必须绑定被扫描的 taskId");
      assert.ok(f.kind, "finding 必须含 kind");
      assert.ok(f.severity, "finding 必须含 severity");
      assert.ok(typeof f.reason === "string" && f.reason.length > 0, "finding 必须含 reason");
      assert.equal(typeof f.expected, "string", "finding 必须含 expected");
      assert.equal(typeof f.actual, "string", "finding 必须含 actual");
      assert.equal(typeof f.fixable, "boolean", "finding 必须含 fixable");
    }
    // 能力边界必须如实声明
    assert.equal(r1.verificationScope.accountBalanceAggregate, false, "不得宣称已完整核对账户余额");

    const hold1 = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId: t } });
    assert.equal(hold1.status, "HELD", "只读运行不得改写 hold 状态");

    assert.equal(await countLedger(), ledgerBefore, "只读运行不得创建任何余额流水（退款/补扣/扣费均禁止）");
    assert.equal(await countGrant(), grantBefore, "只读运行不得创建任何 grant");
    assert.equal(await countRecovery(), recoveryBefore, "只读运行不得创建恢复任务");

    // 重复执行：结果必须完全一致
    const r2 = await scanSettlementReconciliation({ taskId: t, autoFix: false, operator: "readonly-test" });
    assert.equal(r2.scanned, r1.scanned);
    assert.equal(r2.findingsCount, r1.findingsCount);
    assert.equal(r2.inconsistentCount, r1.inconsistentCount);
    assert.equal(r2.conflicts, r1.conflicts);
    assert.deepEqual(r2.appliedFixes, r1.appliedFixes);
    assert.deepEqual(
      r2.findings.map((f) => `${f.kind}|${f.severity}|${f.expected}|${f.actual}`).sort(),
      r1.findings.map((f) => `${f.kind}|${f.severity}|${f.expected}|${f.actual}`).sort(),
      "重复执行的 findings 必须完全一致",
    );

    const stats2 = await getSettlementOperationalStats({ userId: u });
    assert.equal(stats2.anomalies.retryErrorMarkerCount, stats1.anomalies.retryErrorMarkerCount, "统计不得因只读对账而变化");

    assert.equal(await countLedger(), ledgerBefore);
    assert.equal(await countGrant(), grantBefore);
  });
});
