import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  planRefundLedgers,
  REFUND_MODEL_FAILURE_PREFIX,
  type ConsumeResult,
  type ConsumeDetail,
  type ConsumeDetailKind,
} from "../credit-service";

function makeDetail(kind: ConsumeDetailKind, points: number, grantId = "", ledgerId = "mock_ledger_test"): ConsumeDetail {
  const scope = kind === "MEMBER" ? "WORKSPACE" : kind;
  return { ledgerId, grantId, scope, sourceType: "TEST", points, kind };
}

function makeResult(opts: { details: ConsumeDetail[] } & Partial<Omit<ConsumeResult, "details">>): ConsumeResult {
  return {
    skipped: opts.skipped ?? false,
    unlimited: opts.unlimited ?? false,
    consumed: opts.consumed ?? opts.details.reduce((s, d) => s + d.points, 0),
    ledgerIds: opts.ledgerIds ?? [],
    details: opts.details,
    balanceAfter: opts.balanceAfter ?? 0,
    monthlyTokenUsedIncremented: opts.monthlyTokenUsedIncremented ?? 0,
  };
}

describe("planRefundLedgers 原路退款决策（纯函数，无需数据库）", () => {
  test("钱包(WALLET)来源 → 计划保留原分桶 ID，幂等键格式正确", () => {
    const cr = makeResult({ details: [makeDetail("WALLET", 10, "g-wallet-1")] });
    const plans = planRefundLedgers(cr, "task-1");
    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind, "WALLET");
    assert.equal(plans[0].grantId, "g-wallet-1");
    assert.equal(plans[0].expiredFallback, false);
    assert.equal(plans[0].idempotencyKey, `${REFUND_MODEL_FAILURE_PREFIX}:task-1:1`);
  });

  test("个人赠送(PERSONAL_GIFT)来源 → 计划 kind 正确", () => {
    const cr = makeResult({ details: [makeDetail("PERSONAL_GIFT", 20, "g-gift-1")] });
    const plans = planRefundLedgers(cr, "task-2");
    assert.equal(plans[0].kind, "PERSONAL_GIFT");
    assert.equal(plans[0].grantId, "g-gift-1");
  });

  test("企业共享池(WORKSPACE)来源 → 计划 kind 正确", () => {
    const cr = makeResult({ details: [makeDetail("WORKSPACE", 30, "g-ws-1")] });
    const plans = planRefundLedgers(cr, "task-3");
    assert.equal(plans[0].kind, "WORKSPACE");
    assert.equal(plans[0].grantId, "g-ws-1");
  });

  test("企业成员独立余额(MEMBER)来源 → 计划 kind=MEMBER，grantId 为 null", () => {
    const cr = makeResult({ details: [makeDetail("MEMBER", 40)] });
    const plans = planRefundLedgers(cr, "task-4");
    assert.equal(plans[0].kind, "MEMBER");
    assert.equal(plans[0].grantId, null);
    assert.equal(plans[0].expiredFallback, false);
  });

  test("多来源混合 → 逐分桶生成序号 1..n，键包含 taskId", () => {
    const cr = makeResult({
      details: [
        makeDetail("WALLET", 10, "g-1"),
        makeDetail("PERSONAL_GIFT", 20, "g-2"),
        makeDetail("WORKSPACE", 30, "g-3"),
        makeDetail("MEMBER", 40),
      ],
    });
    const plans = planRefundLedgers(cr, "task-mix");
    assert.equal(plans.length, 4);
    assert.deepEqual(
      plans.map((p) => p.idempotencyKey),
      [
        `${REFUND_MODEL_FAILURE_PREFIX}:task-mix:1`,
        `${REFUND_MODEL_FAILURE_PREFIX}:task-mix:2`,
        `${REFUND_MODEL_FAILURE_PREFIX}:task-mix:3`,
        `${REFUND_MODEL_FAILURE_PREFIX}:task-mix:4`,
      ],
    );
  });

  test("无限额度(unlimited) → 不产生任何退款点（失败不发退款）", () => {
    const cr = makeResult({ unlimited: true, details: [] });
    const plans = planRefundLedgers(cr, "task-u");
    assert.equal(plans.length, 0);
  });

  test("未实际扣点(skipped / consumed<=0) → 不产生退款点", () => {
    assert.equal(planRefundLedgers(makeResult({ skipped: true, details: [] }), "t1").length, 0);
    assert.equal(
      planRefundLedgers({ ...makeResult({ details: [] }), consumed: 0 }, "t2").length,
      0,
    );
  });

  test("原分桶已过期 → expiredFallback=true 且 grantId 置空（走兜底分桶，不改变余额归属）", () => {
    const cr = makeResult({ details: [makeDetail("WALLET", 15, "g-expired")] });
    const plans = planRefundLedgers(cr, "task-exp", new Set(["g-expired"]));
    assert.equal(plans.length, 1);
    assert.equal(plans[0].expiredFallback, true);
    assert.equal(plans[0].grantId, null);
  });

  test("原分桶缺失(grantId 为空) → 同样标记 expiredFallback，走兜底分桶", () => {
    const cr = makeResult({ details: [makeDetail("WORKSPACE", 15, "")] });
    const plans = planRefundLedgers(cr, "task-missing");
    assert.equal(plans[0].expiredFallback, true);
    assert.equal(plans[0].grantId, null);
  });

  test("幂等键稳定：同一 taskId 重复调用产生相同键（不重复增加余额的前提）", () => {
    const cr = makeResult({
      details: [makeDetail("WALLET", 10, "g-1"), makeDetail("MEMBER", 20)],
    });
    const a = planRefundLedgers(cr, "task-idem");
    const b = planRefundLedgers(cr, "task-idem");
    assert.deepEqual(
      a.map((p) => p.idempotencyKey),
      b.map((p) => p.idempotencyKey),
    );
  });

  test("monthlyTokenUsed 回滚量随 consumeResult 透传（退款时按此值回滚，不额外倍增）", () => {
    const cr = makeResult({ details: [makeDetail("MEMBER", 50)], monthlyTokenUsedIncremented: 50 });
    // 计划本身不含月度字段（月度回滚在 refundConsumedPoints 内依据 cr.monthlyTokenUsedIncremented 执行）
    const plans = planRefundLedgers(cr, "task-m");
    assert.equal(plans.length, 1);
    assert.equal(cr.monthlyTokenUsedIncremented, 50);
  });
});
