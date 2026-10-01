import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { consumePoints } from "../credit-service";
import {
  enqueueRefundRecovery,
  retryRefundRecovery,
  listRefundRecoveries,
  REFUND_RECOVERY_MAX_RETRY,
  writeRefundRecoveryResult,
} from "../refund-recovery";

/**
 * 退款恢复（真实数据库）：退款失败必须落库为待处理记录；管理员重试幂等，两次重试只恢复一次。
 * 无 DATABASE_URL 时自动 skip。
 */
const B = (n: number): bigint => BigInt(n);

describe("退款恢复 refundrecovery（集成测试）", { skip: !process.env.DATABASE_URL }, () => {
  test("记录待退款并可幂等重试：两次重试只恢复一次余额", async () => {
    const uid = "rr_u_" + randomUUID();
    const wid = "rr_ws_" + randomUUID();
    const qid = "rr_q_" + randomUUID();
    const walletId = "rr_wallet_" + randomUUID();
    const memberId = "rr_mem_" + randomUUID();
    const taskId = "rr_task_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr", type: "ENTERPRISE", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(0), tokenBalance: B(100) },
      });
      await prisma.userwallet.create({ data: { id: walletId, userId: uid, balance: B(0) } });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 30,
        componentId: "C07",
        componentName: "测试组件",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "rr",
        idempotencyKey: `CONSUME:${taskId}`,
      });
      assert.equal(cr.consumed, 30);

      // 模拟退款失败：写入待退款恢复记录
      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        componentId: "C07",
        componentName: "测试组件",
        workspaceType: "ENTERPRISE",
        workspaceName: "rr",
        error: "SIMULATED_REFUND_FAILURE",
      });

      const list = await listRefundRecoveries({ status: "PENDING" });
      const rec = list.records.find((r) => r.taskId === taskId);
      assert.ok(rec, "数据库必须存在待退款记录");
      recoveryId = rec!.id;
      assert.equal(Number(rec!.points), 30);
      assert.equal(Number(rec!.monthlyUsedRollback), 30);
      assert.equal(rec!.status, "PENDING");

      // 第一次重试：恢复 30
      const r1 = await retryRefundRecovery(recoveryId);
      assert.equal(r1.ok, true);
      assert.equal(r1.status, "SETTLED");
      assert.equal(r1.refunded, 30);
      const m1 = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true, monthlyTokenUsed: true },
      });
      assert.equal(Number(m1!.tokenBalance), 100);
      assert.equal(Number(m1!.monthlyTokenUsed), 0);

      // 第二次重试：已 SETTLED，不再重复退款
      const r2 = await retryRefundRecovery(recoveryId);
      assert.equal(r2.ok, true);
      assert.equal(r2.refunded, 0);
      const m2 = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true, monthlyTokenUsed: true },
      });
      assert.equal(Number(m2!.tokenBalance), 100, "余额只恢复一次");
      assert.equal(Number(m2!.monthlyTokenUsed), 0);
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.userwallet.deleteMany({ where: { id: walletId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("GET 序列化安全：返回规范 DTO 且 BigInt 统一为字符串，JSON.stringify 不抛错", async () => {
    const uid = "rr_u_dto_" + randomUUID();
    const wid = "rr_ws_dto_" + randomUUID();
    const taskId = "rr_task_dto_" + randomUUID();
    let recoveryId = "";
    try {
      const enqueueRes = await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: {
          skipped: false,
          unlimited: false,
          consumed: 50,
          ledgerIds: ["mock_ledger_1"],
          details: [{ ledgerId: "mock_ledger_1", grantId: "mock_g1", kind: "WALLET", scope: "WALLET", sourceType: "ONLINE", points: 50 }],
          balanceAfter: 100,
          monthlyTokenUsedIncremented: 0,
        },
        error: null,
      });
      assert.equal(enqueueRes.ok, true, "enqueue 必须返回 ok: true");

      const list = await listRefundRecoveries({ status: "PENDING" });
      const item = list.records.find((r) => r.taskId === taskId);
      assert.ok(item, "应能查到待退款 DTO");
      recoveryId = item!.id;

      // 验证类型必须为 string，不能丢失精度
      assert.equal(typeof item!.points, "string");
      assert.equal(item!.points, "50");
      assert.equal(typeof item!.monthlyUsedRollback, "string");
      assert.equal(item!.monthlyUsedRollback, "0");

      // 验证 DTO 必备字段结构完整
      assert.ok(item!.id);
      assert.equal(item!.taskId, taskId);
      assert.equal(item!.workspaceId, wid);
      assert.equal(item!.status, "PENDING");
      assert.equal(typeof item!.retryCount, "number");
      assert.equal(typeof item!.createdAt, "string");
      assert.equal(typeof item!.updatedAt, "string");

      // 接口级 JSON 序列化无异常
      const jsonStr = JSON.stringify(list);
      assert.ok(jsonStr.length > 0);
      const parsed = JSON.parse(jsonStr);
      assert.ok(Array.isArray(parsed.records));
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
    }
  });

  test("并发重试互斥认领：两个并发重试请求只能有一个认领成功并恢复余额", async () => {
    const uid = "rr_u_conc_" + randomUUID();
    const wid = "rr_ws_conc_" + randomUUID();
    const qid = "rr_q_conc_" + randomUUID();
    const memberId = "rr_mem_conc_" + randomUUID();
    const taskId = "rr_task_conc_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr_conc", type: "ENTERPRISE", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(0), tokenBalance: B(100) },
      });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 40,
        componentId: "C07",
        componentName: "并发测试组件",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "rr_conc",
        idempotencyKey: `CONSUME:${taskId}`,
      });

      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        componentId: "C07",
        componentName: "并发测试组件",
        workspaceType: "ENTERPRISE",
        workspaceName: "rr_conc",
        error: "SIMULATED_FAILURE",
      });

      const list = await listRefundRecoveries({ status: "PENDING" });
      const rec = list.records.find((r) => r.taskId === taskId);
      assert.ok(rec);
      recoveryId = rec!.id;

      // 同时发起两个并发重试
      const [res1, res2] = await Promise.all([
        retryRefundRecovery(recoveryId),
        retryRefundRecovery(recoveryId),
      ]);

      // 验证其中一个成功执行退款 (ok=true 且 refunded=40)
      // 另一个因原子认领失败返回被占用或幂等完成
      const totalRefunded = res1.refunded + res2.refunded;
      assert.equal(totalRefunded, 40, "并发重试最终退款点数必须严格为 40，禁止重复加余额");

      // 检查成员最终余额：初始 100 - 消耗 40 + 退回 40 = 100
      const finalMem = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true },
      });
      assert.equal(Number(finalMem!.tokenBalance), 100);
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("PROCESSING 崩溃超时恢复：租约过期后下一次重试允许重新认领并恢复", async () => {
    const uid = "rr_u_crash_" + randomUUID();
    const wid = "rr_ws_crash_" + randomUUID();
    const qid = "rr_q_crash_" + randomUUID();
    const memberId = "rr_mem_crash_" + randomUUID();
    const taskId = "rr_task_crash_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr_crash", type: "ENTERPRISE", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(0), tokenBalance: B(100) },
      });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 20,
        componentId: "C07",
        componentName: "崩溃测试组件",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "rr_crash",
        idempotencyKey: `CONSUME:${taskId}`,
      });

      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        componentId: "C07",
        componentName: "崩溃测试组件",
        error: "SIMULATED_FAILURE",
      });

      const list = await listRefundRecoveries({ status: "PENDING" });
      const rec = list.records.find((r) => r.taskId === taskId);
      assert.ok(rec);
      recoveryId = rec!.id;

      // 模拟前一个 worker 崩溃：将状态更新为 PROCESSING，租约过期时间设为 10 分钟前
      const pastLease = new Date(Date.now() - 10 * 60 * 1000);
      await prisma.refundrecovery.update({
        where: { id: recoveryId },
        data: {
          status: "PROCESSING",
          processingStartedAt: pastLease,
          leaseUntil: pastLease,
        },
      });

      // 崩溃后重试：应检测到租约已过期，重新认领成功并执行退款
      const rCrash = await retryRefundRecovery(recoveryId);
      assert.equal(rCrash.ok, true);
      assert.equal(rCrash.status, "SETTLED");
      assert.equal(rCrash.refunded, 20);

      const mem = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true },
      });
      assert.equal(Number(mem!.tokenBalance), 100);
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("数据完整性校验：损坏记录、金额不一致、流水缺失均阻断并流转为 REQUIRES_REVIEW", async () => {
    const uid = "rr_u_bad_" + randomUUID();
    const wid = "rr_ws_bad_" + randomUUID();
    const now = new Date();
    const badIds: string[] = [];
    try {
      // 1. 金额不一致记录（points 50，但 details 内总和为 20）
      const id1 = randomUUID();
      badIds.push(id1);
      await prisma.refundrecovery.create({
        data: {
          id: id1,
          taskId: "task_bad_1_" + randomUUID(),
          userId: uid,
          workspaceId: wid,
          consumeIdempotencyKey: "CONSUME:bad_1",
          consumeLedgerIds: ["ledger_fake"],
          details: [{ grantId: "g1", kind: "WALLET", scope: "WALLET", sourceType: "ONLINE", points: 20 }],
          points: B(50), // 不等于 details 总和 20
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        },
      });
      const res1 = await retryRefundRecovery(id1);
      assert.equal(res1.ok, false);
      assert.equal(res1.status, "REQUIRES_REVIEW");
      assert.match(res1.error || "", /POINTS_MISMATCH/);

      // 2. 空损坏记录（points=0, details=[], monthlyUsedRollback=0），严禁标记 SETTLED
      const id2 = randomUUID();
      badIds.push(id2);
      await prisma.refundrecovery.create({
        data: {
          id: id2,
          taskId: "task_bad_2_" + randomUUID(),
          userId: uid,
          workspaceId: wid,
          consumeIdempotencyKey: "CONSUME:bad_2",
          consumeLedgerIds: [],
          details: [],
          points: B(0),
          monthlyUsedRollback: B(0),
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        },
      });
      const res2 = await retryRefundRecovery(id2);
      assert.equal(res2.ok, false);
      assert.equal(res2.status, "REQUIRES_REVIEW");
      assert.match(res2.error || "", /EMPTY_RECORD_POINTS_AND_DETAILS_ZERO/);

      // 3. 流水缺失记录（details 校验通过但关联的 pointledger 不存在）
      const id3 = randomUUID();
      badIds.push(id3);
      await prisma.refundrecovery.create({
        data: {
          id: id3,
          taskId: "task_bad_3_" + randomUUID(),
          userId: uid,
          workspaceId: wid,
          consumeIdempotencyKey: "CONSUME:bad_3",
          consumeLedgerIds: ["non_existent_ledger_id"],
          details: [{ grantId: "g1", kind: "WALLET", scope: "WALLET", sourceType: "ONLINE", points: 30 }],
          points: B(30),
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        },
      });
      const res3 = await retryRefundRecovery(id3);
      assert.equal(res3.ok, false);
      assert.equal(res3.status, "REQUIRES_REVIEW");
      assert.match(res3.error || "", /CONSUME_LEDGER_COUNT_MISMATCH/);
    } finally {
      if (badIds.length > 0) {
        await prisma.refundrecovery.deleteMany({ where: { id: { in: badIds } } }).catch(() => {});
      }
    }
  });

  test("企业 MEMBER 明细（grantId=\"\"）视为合法，退款可恢复", async () => {
    const uid = "rr_u_mem_" + randomUUID();
    const wid = "rr_ws_mem_" + randomUUID();
    const qid = "rr_q_mem_" + randomUUID();
    const memberId = "rr_mem_" + randomUUID();
    const taskId = "rr_task_mem_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr_mem", type: "ENTERPRISE", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(0), tokenBalance: B(100) },
      });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 30,
        componentId: "C07",
        componentName: "MEMBER 测试组件",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "rr_mem",
        idempotencyKey: `CONSUME:${taskId}`,
      });
      assert.equal(cr.consumed, 30);
      assert.equal(cr.details.length, 1);
      assert.equal(cr.details[0].kind, "MEMBER");
      assert.equal(cr.details[0].scope, "WORKSPACE");
      assert.equal(cr.details[0].grantId, "");

      const enq = await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        error: "SIMULATED_FAILURE",
      });
      assert.equal(enq.ok, true);
      const rec = await prisma.refundrecovery.findFirst({ where: { taskId } });
      recoveryId = rec!.id;

      const res = await retryRefundRecovery(recoveryId);
      assert.equal(res.ok, true, `企业 MEMBER 退款应成功，实际 error=${res.error}`);
      assert.equal(res.status, "SETTLED");
      assert.equal(res.refunded, 30);

      const mem = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true, monthlyTokenUsed: true },
      });
      assert.equal(Number(mem!.tokenBalance), 100);
      assert.equal(Number(mem!.monthlyTokenUsed), 0);
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("WALLET+WORKSPACE 多分桶（流水幂等键 #1/#2）退款成功", async () => {
    const uid = "rr_u_w_" + randomUUID();
    const wid = "rr_ws_w_" + randomUUID();
    const qid = "rr_q_w_" + randomUUID();
    const walletId = "rr_wallet_w_" + randomUUID();
    const gW = "rr_g_w_" + randomUUID();
    const gWs = "rr_g_ws_" + randomUUID();
    const taskId = "rr_task_w_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr_w", type: "PERSONAL", ownerId: uid, updatedAt: now } });
      await prisma.userwallet.create({ data: { id: walletId, userId: uid, balance: B(20) } });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(100), updatedAt: now },
      });
      await prisma.pointgrant.create({
        data: { id: gW, scope: "WALLET", userId: uid, workspaceId: null, points: B(20), remaining: B(20), sourceType: "MANUAL", status: "ACTIVE" },
      });
      await prisma.pointgrant.create({
        data: { id: gWs, scope: "WORKSPACE", userId: null, workspaceId: wid, points: B(100), remaining: B(100), sourceType: "MANUAL", status: "ACTIVE" },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 30,
        componentId: "C07",
        componentName: "多分桶测试组件",
        taskId,
        workspaceType: "PERSONAL",
        workspaceName: "rr_w",
        idempotencyKey: `CONSUME:${taskId}`,
      });
      assert.equal(cr.consumed, 30);
      assert.equal(cr.details.length, 2, "应产生两个分桶明细");

      // 真实消费流水幂等键为 CONSUME:{taskId}#1 / #2
      const ledgers = await prisma.pointledger.findMany({ where: { taskId }, select: { idempotencyKey: true } });
      const keys = ledgers.map((l) => l.idempotencyKey).sort();
      assert.deepEqual(keys, [`CONSUME:${taskId}#1`, `CONSUME:${taskId}#2`]);

      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        error: "SIMULATED_FAILURE",
      });
      const rec = await prisma.refundrecovery.findFirst({ where: { taskId } });
      recoveryId = rec!.id;

      const res = await retryRefundRecovery(recoveryId);
      assert.equal(res.ok, true, `多分桶退款应成功，实际 error=${res.error}`);
      assert.equal(res.status, "SETTLED");
      assert.equal(res.refunded, 30);

      const w = await prisma.userwallet.findUnique({ where: { id: walletId }, select: { balance: true } });
      const q2 = await prisma.workspacequota.findUnique({ where: { id: qid }, select: { tokenBalance: true } });
      assert.equal(Number(w!.balance), 20, "钱包分桶应原路恢复");
      assert.equal(Number(q2!.tokenBalance), 100, "空间分桶应原路恢复");
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointgrant.deleteMany({ where: { id: { in: [gW, gWs] } } }).catch(() => {});
      await prisma.userwallet.deleteMany({ where: { id: walletId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });

  test("达到最大重试次数后租约过期：不得再次认领，转 REQUIRES_REVIEW", async () => {
    const uid = "rr_u_max_" + randomUUID();
    const wid = "rr_ws_max_" + randomUUID();
    const taskId = "rr_task_max_" + randomUUID();
    const id = randomUUID();
    const now = new Date();
    try {
      await prisma.refundrecovery.create({
        data: {
          id,
          taskId,
          userId: uid,
          workspaceId: wid,
          consumeIdempotencyKey: `CONSUME:${taskId}`,
          consumeLedgerIds: [],
          details: [],
          points: B(0),
          monthlyUsedRollback: B(0),
          status: "PROCESSING",
          retryCount: REFUND_RECOVERY_MAX_RETRY,
          processingStartedAt: new Date(now.getTime() - 20 * 60 * 1000),
          // 租约已过期：旧实现会重新认领，绕过最大重试限制
          leaseUntil: new Date(now.getTime() - 10 * 60 * 1000),
          createdAt: now,
          updatedAt: now,
        },
      });

      const res = await retryRefundRecovery(id);
      assert.equal(res.ok, false);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.equal(res.error, "MAX_RETRIES_EXCEEDED");

      const after = await prisma.refundrecovery.findUnique({
        where: { id },
        select: { status: true, retryCount: true, leaseUntil: true },
      });
      assert.equal(after!.status, "REQUIRES_REVIEW");
      assert.equal(after!.retryCount, REFUND_RECOVERY_MAX_RETRY, "重试次数不得增加，禁止绕过上限");
      assert.equal(after!.leaseUntil, null, "不得再持有租约");
    } finally {
      await prisma.refundrecovery.deleteMany({ where: { id } }).catch(() => {});
    }
  });
});

/** WALLET 真实扣费场景：返回 1 条真实消费流水（grantId/scope=WALLET） */
async function setupWalletConsumeScene(points: number) {
  const uid = "rr_d_u_" + randomUUID();
  const wid = "rr_d_ws_" + randomUUID();
  const qid = "rr_d_q_" + randomUUID();
  const walletId = "rr_d_wallet_" + randomUUID();
  const grantId = "rr_d_g_" + randomUUID();
  const taskId = "rr_d_task_" + randomUUID();
  const now = new Date();
  await prisma.user.create({ data: { id: uid, password: "x" } });
  await prisma.workspace.create({ data: { id: wid, name: "rr_d", type: "PERSONAL", ownerId: uid, updatedAt: now } });
  await prisma.userwallet.create({ data: { id: walletId, userId: uid, balance: B(100) } });
  await prisma.workspacequota.create({
    data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
  });
  await prisma.pointgrant.create({
    data: {
      id: grantId,
      scope: "WALLET",
      userId: uid,
      workspaceId: null,
      points: B(100),
      remaining: B(100),
      sourceType: "MANUAL",
      status: "ACTIVE",
    },
  });
  const cr = await consumePoints({
    workspaceId: wid,
    userId: uid,
    points,
    componentId: "C07",
    componentName: "错配测试",
    taskId,
    workspaceType: "PERSONAL",
    workspaceName: "rr_d",
    idempotencyKey: `CONSUME:${taskId}`,
  });
  const cleanup = async () => {
    await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
    await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
    await prisma.pointgrant.deleteMany({ where: { id: grantId } }).catch(() => {});
    await prisma.userwallet.deleteMany({ where: { id: walletId } }).catch(() => {});
    await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
  };
  return { uid, wid, walletId, grantId, taskId, cr, cleanup };
}

async function createRecoveryRow(p: {
  taskId: string;
  userId: string;
  workspaceId: string;
  ledgerIds: string[];
  details: unknown[];
  points: number;
  monthly?: number;
}) {
  const id = randomUUID();
  const now = new Date();
  await prisma.refundrecovery.create({
    data: {
      id,
      taskId: p.taskId,
      userId: p.userId,
      workspaceId: p.workspaceId,
      consumeIdempotencyKey: `CONSUME:${p.taskId}`,
      consumeLedgerIds: p.ledgerIds,
      details: p.details as unknown as object,
      points: B(p.points),
      monthlyUsedRollback: B(p.monthly ?? 0),
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    },
  });
  return id;
}

describe("退款恢复：明细/流水错配必须转 REQUIRES_REVIEW", { skip: !process.env.DATABASE_URL }, () => {
  test("明细金额与流水金额不一致 → LEDGER_DETAIL_POINTS_MISMATCH", async () => {
    const s = await setupWalletConsumeScene(40);
    try {
      const id = await createRecoveryRow({
        taskId: s.taskId,
        userId: s.uid,
        workspaceId: s.wid,
        ledgerIds: s.cr.ledgerIds,
        details: [{ grantId: s.grantId, kind: "WALLET", scope: "WALLET", sourceType: "MANUAL", points: 30 }],
        points: 30,
      });
      const res = await retryRefundRecovery(id);
      assert.equal(res.ok, false);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.match(res.error || "", /LEDGER_DETAIL_POINTS_MISMATCH/);

      // 不得产生任何退款
      const w = await prisma.userwallet.findUnique({ where: { id: s.walletId }, select: { balance: true } });
      assert.equal(Number(w!.balance), 60, "不得退款，钱包应仍为扣费后余额");
    } finally {
      await s.cleanup();
    }
  });

  test("明细 grantId 与流水 grantId 不一致 → LEDGER_DETAIL_GRANT_ID_MISMATCH", async () => {
    const s = await setupWalletConsumeScene(40);
    try {
      const id = await createRecoveryRow({
        taskId: s.taskId,
        userId: s.uid,
        workspaceId: s.wid,
        ledgerIds: s.cr.ledgerIds,
        details: [{ grantId: "other_grant", kind: "WALLET", scope: "WALLET", sourceType: "MANUAL", points: 40 }],
        points: 40,
      });
      const res = await retryRefundRecovery(id);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.match(res.error || "", /LEDGER_DETAIL_GRANT_ID_MISMATCH/);
    } finally {
      await s.cleanup();
    }
  });

  test("MEMBER 明细指向 WALLET 流水 → MEMBER_LEDGER_GRANT_ID_NOT_NULL", async () => {
    const s = await setupWalletConsumeScene(40);
    try {
      const id = await createRecoveryRow({
        taskId: s.taskId,
        userId: s.uid,
        workspaceId: s.wid,
        ledgerIds: s.cr.ledgerIds,
        details: [{ grantId: "", kind: "MEMBER", scope: "WORKSPACE", sourceType: "MEMBER", points: 40 }],
        points: 40,
      });
      const res = await retryRefundRecovery(id);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.match(res.error || "", /MEMBER_LEDGER_GRANT_ID_NOT_NULL|MEMBER_LEDGER_SCOPE_INVALID/);
    } finally {
      await s.cleanup();
    }
  });

  test("明细数量与流水数量不一致 → LEDGER_DETAIL_COUNT_MISMATCH", async () => {
    const s = await setupWalletConsumeScene(40);
    try {
      const id = await createRecoveryRow({
        taskId: s.taskId,
        userId: s.uid,
        workspaceId: s.wid,
        ledgerIds: s.cr.ledgerIds,
        details: [
          { grantId: s.grantId, kind: "WALLET", scope: "WALLET", sourceType: "MANUAL", points: 20 },
          { grantId: s.grantId, kind: "WALLET", scope: "WALLET", sourceType: "MANUAL", points: 20 },
        ],
        points: 40,
      });
      const res = await retryRefundRecovery(id);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.match(res.error || "", /LEDGER_DETAIL_COUNT_MISMATCH/);
    } finally {
      await s.cleanup();
    }
  });

  test("分桶 grant 属于其他用户 → GRANT_USER_MISMATCH", async () => {
    const s = await setupWalletConsumeScene(40);
    const otherUid = "rr_d_other_" + randomUUID();
    const otherGrant = "rr_d_g_other_" + randomUUID();
    const manualLedgerId = randomUUID();
    try {
      await prisma.user.create({ data: { id: otherUid, password: "x" } });
      await prisma.pointgrant.create({
        data: {
          id: otherGrant,
          scope: "WALLET",
          userId: otherUid,
          workspaceId: null,
          points: B(100),
          remaining: B(100),
          sourceType: "MANUAL",
          status: "ACTIVE",
        },
      });
      // 手工构造一条指向他人分桶的消费流水（模拟明细被篡改）
      await prisma.pointledger.create({
        data: {
          id: manualLedgerId,
          direction: "OUT",
          type: "CONSUME",
          scope: "WALLET",
          userId: s.uid,
          workspaceId: s.wid,
          grantId: otherGrant,
          points: B(40),
          balanceAfter: B(60),
          taskId: s.taskId,
          title: "篡改流水",
          idempotencyKey: `CONSUME:${s.taskId}#2`,
        },
      });
      const id = await createRecoveryRow({
        taskId: s.taskId,
        userId: s.uid,
        workspaceId: s.wid,
        ledgerIds: [manualLedgerId],
        details: [{ grantId: otherGrant, kind: "WALLET", scope: "WALLET", sourceType: "MANUAL", points: 40 }],
        points: 40,
      });
      const res = await retryRefundRecovery(id);
      assert.equal(res.status, "REQUIRES_REVIEW");
      assert.match(res.error || "", /GRANT_USER_MISMATCH/);
    } finally {
      await prisma.pointledger.deleteMany({ where: { id: manualLedgerId } }).catch(() => {});
      await prisma.pointgrant.deleteMany({ where: { id: otherGrant } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: otherUid } }).catch(() => {});
      await s.cleanup();
    }
  });
});

describe("退款恢复：租约 fencing 阻止旧 Worker 覆盖新 Worker", { skip: !process.env.DATABASE_URL }, () => {
  test("旧 Worker 持过期租约写入终态失败：状态保持 SETTLED，退款与月度回滚各一次", async () => {
    const uid = "rr_f_u_" + randomUUID();
    const wid = "rr_f_ws_" + randomUUID();
    const qid = "rr_f_q_" + randomUUID();
    const memberId = "rr_f_mem_" + randomUUID();
    const taskId = "rr_f_task_" + randomUUID();
    const now = new Date();
    let recoveryId = "";
    try {
      await prisma.user.create({ data: { id: uid, password: "x" } });
      await prisma.workspace.create({ data: { id: wid, name: "rr_f", type: "ENTERPRISE", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: memberId, userId: uid, workspaceId: wid, role: "MEMBER", monthlyTokenUsed: B(40), tokenBalance: B(100) },
      });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: B(0), updatedAt: now },
      });

      const cr = await consumePoints({
        workspaceId: wid,
        userId: uid,
        points: 30,
        componentId: "C07",
        componentName: "fencing 测试",
        taskId,
        workspaceType: "ENTERPRISE",
        workspaceName: "rr_f",
        idempotencyKey: `CONSUME:${taskId}`,
      });
      await enqueueRefundRecovery({
        taskId,
        userId: uid,
        workspaceId: wid,
        consumeIdempotencyKey: `CONSUME:${taskId}`,
        consumeResult: cr,
        error: "SIMULATED_FAILURE",
      });
      const rec = await prisma.refundrecovery.findFirst({ where: { taskId } });
      recoveryId = rec!.id;

      // 1) Worker A 认领并持有租约
      const tokenA = randomUUID();
      await prisma.refundrecovery.update({
        where: { id: recoveryId },
        data: { status: "PROCESSING", claimToken: tokenA, processingStartedAt: now, leaseUntil: now },
      });

      // 2) Worker A 长时间未完成 → 手动模拟租约过期
      const past = new Date(now.getTime() - 10 * 60 * 1000);
      await prisma.refundrecovery.update({
        where: { id: recoveryId },
        data: { processingStartedAt: past, leaseUntil: past },
      });

      // 3) Worker B 重新认领并完成退款
      const b = await retryRefundRecovery(recoveryId);
      assert.equal(b.ok, true, `Worker B 应接管并退款成功，实际 error=${b.error}`);
      assert.equal(b.status, "SETTLED");
      assert.equal(b.refunded, 30);

      // 4) Worker A 恢复运行，尝试写入失败终态（旧令牌）
      const aWrite = await writeRefundRecoveryResult(recoveryId, tokenA, {
        status: "FAILED",
        lastError: "OLD_WORKER_OVERWRITE",
      });
      assert.equal(aWrite.applied, false, "旧 Worker 必须被 fencing 阻断");

      // 5) 最终状态仍为 SETTLED，且未被旧 Worker 覆盖
      const final = await prisma.refundrecovery.findUnique({
        where: { id: recoveryId },
        select: { status: true, lastError: true, claimToken: true, retryCount: true },
      });
      assert.equal(final!.status, "SETTLED", "SETTLED 不可被旧 Worker 改回 FAILED");
      assert.equal(final!.lastError, null);
      assert.equal(final!.claimToken, null, "终态必须释放租约");
      assert.equal(final!.retryCount, 1);

      // 6) 余额只恢复一次、月度只回滚一次
      const mem = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true, monthlyTokenUsed: true },
      });
      assert.equal(Number(mem!.tokenBalance), 100);
      assert.equal(Number(mem!.monthlyTokenUsed), 40);

      // 7) 再次重试幂等，不再恢复
      const again = await retryRefundRecovery(recoveryId);
      assert.equal(again.refunded, 0);
      const mem2 = await prisma.workspacemember.findUnique({
        where: { id: memberId },
        select: { tokenBalance: true, monthlyTokenUsed: true },
      });
      assert.equal(Number(mem2!.tokenBalance), 100);
      assert.equal(Number(mem2!.monthlyTokenUsed), 40);
    } finally {
      if (recoveryId) await prisma.refundrecovery.deleteMany({ where: { id: recoveryId } }).catch(() => {});
      await prisma.refundrecovery.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.pointledger.deleteMany({ where: { taskId } }).catch(() => {});
      await prisma.workspacemember.deleteMany({ where: { id: memberId } }).catch(() => {});
      await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
    }
  });
});
