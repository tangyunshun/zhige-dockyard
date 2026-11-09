/**
 * R1 / 第5批（AGI-A）：收款事实与履约一致。
 *
 * 定向隔离验收：真实执行 fulfillPaidOrder 与两条真实网关回调路由（wechat/alipay notify），
 * 仅替换「数据库委托 / 计费发放 / 网关验签输入 / 订单过期判定」等 IO；零真实库/支付/短信/网络/密钥。
 *
 * 覆盖：合法收款、缺交易号/金额、同交易号跨订单去重、取消/超时后收到已验收款的留存（待运营恢复）、
 * 幂等重发、订单只读查询零发放。账本/席位/点数一致性由 r0b/r0e 既有基线守护，本文件只补 R1 未闭合部分。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const state: any = {
  orders: {} as Record<string, any>,
  workspace: { id: "w1", ownerId: "u1", name: "ws", type: "PERSONAL", plan: "STANDARD" },
  grantPointsCalls: 0,
  grantedKeys: new Set<string>(),
  fulfillSeatCalls: 0,
  lastSeatInput: null as any,
  // 网关验签输入（由用例控制）
  wxResource: null as any,
  wxOk: true,
  aliForm: null as any,
  aliOk: true,
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function makePrisma() {
  const p: any = {
    workspace: {
      findUnique: async () => clone(state.workspace),
    },
    billingrecord: {
      create: async (...a: any[]) => {
        const d = a[0].data;
        // 忠实模拟 billingrecord.id 主键唯一约束：重复认领键抛 P2002，不静默覆盖。
        if (state.orders[d.id]) {
          throw Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), { code: "P2002" });
        }
        state.orders[d.id] = clone(d);
        return clone(d);
      },
      findUnique: async (q: any) => {
        const o = state.orders[q.where.id];
        return o ? clone(o) : null;
      },
      // 仅实现 R1 去重所需的查询形状：SUCCESS 且交易号命中且非本单
      findFirst: async (q: any) => {
        const w = q?.where;
        if (w?.status === "SUCCESS" && w?.id?.not && w?.metadata?.path && w?.metadata?.equals != null) {
          const tid = w.metadata.equals;
          for (const id of Object.keys(state.orders)) {
            const o = state.orders[id];
            if (o.status === "SUCCESS" && id !== w.id.not && o.metadata?.gatewayTransactionId === tid) {
              return clone(o);
            }
          }
        }
        return null;
      },
      update: async (...a: any[]) => {
        const { where, data } = a[0];
        const o = state.orders[where.id];
        if (!o) return null;
        const merged = { ...o, ...data };
        if (data.metadata) merged.metadata = { ...(o.metadata || {}), ...data.metadata };
        state.orders[where.id] = merged;
        return clone(merged);
      },
      updateMany: async (...a: any[]) => {
        const { where, data } = a[0];
        const o = state.orders[where.id];
        if (o && o.status === where.status) {
          Object.assign(o, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  p.billing_record = p.billingrecord;
  return p;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@/lib/credit-service", () => ({
  grantPoints: async (...args: any[]) => {
    const key = args?.[0]?.idempotencyKey;
    if (key != null) {
      if (state.grantedKeys.has(key)) return { ledgerId: "LEDGER" };
      state.grantedKeys.add(key);
    }
    state.grantPointsCalls++;
    return { ledgerId: "LEDGER" };
  },
  getBalanceSummary: async () => ({ balance: 100 }),
}));
vi.mock("@/lib/order-expiry", () => ({ isOrderExpired: () => false }));
vi.mock("@/lib/workspace-upgrade-service", () => ({
  fulfillEnterpriseUpgradeFromOrder: async () => ({ ok: true, newWorkspaceId: "w2" }),
}));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => ({ valid: true, user: { id: "u1", email: "u1@x", role: "USER" } }),
  isAdminRole: () => false,
}));
vi.mock("@/lib/payment/seat-addon-fulfill", () => ({
  fulfillSeatAddonOrder: async (input: any) => {
    state.fulfillSeatCalls++;
    state.lastSeatInput = input;
    return { ok: true, status: "FULFILLED" as const, seats: 2 };
  },
}));
vi.mock("@/lib/payment/wechatpay", () => ({
  verifyNotify: async () =>
    state.wxOk
      ? { ok: true, resource: clone(state.wxResource) }
      : { ok: false, error: "bad sig" },
  NOTIFY_RESPONSE: { success: { code: "SUCCESS", message: "OK" }, fail: { code: "FAIL", message: "fail" } },
}));
vi.mock("@/lib/payment/alipay", () => ({
  verifyNotify: async () =>
    state.aliOk
      ? {
          ok: true,
          outTradeNo: state.aliForm.out_trade_no,
          tradeStatus: state.aliForm.trade_status,
          totalAmount: state.aliForm.total_amount,
          tradeNo: state.aliForm.trade_no,
        }
      : { ok: false, error: "bad sig" },
}));

const { fulfillPaidOrder } = await import("@/lib/payment/fulfill");
const { POST: wechatNotifyPOST } = await import("@/app/api/payments/notify/wechat/route");
const { POST: alipayNotifyPOST } = await import("@/app/api/payments/notify/alipay/route");
const { GET: orderGET } = await import("@/app/api/payments/order/route");

function seedRecharge(id: string, status = "PENDING", amount = 1000, channel = "WECHAT_PAY") {
  state.orders[id] = {
    id,
    userId: "u1",
    workspaceId: "w1",
    type: "TOKEN_RECHARGE",
    status,
    title: "充值",
    amount,
    // [U04] 收款渠道必须与订单渠道一致；支付宝回调用例显式传 "ALIPAY"。
    channel,
    metadata: { points: 100 },
  };
}
function seedSeat(id: string, status = "PENDING", amount = 2600) {
  state.orders[id] = {
    id,
    userId: "u1",
    workspaceId: "w1",
    type: "SEAT_ADDON",
    status,
    title: "增购席位",
    amount,
    channel: "WECHAT_PAY",
    metadata: { seats: 2 },
  };
}

beforeEach(() => {
  state.orders = {};
  state.grantPointsCalls = 0;
  state.grantedKeys.clear();
  state.fulfillSeatCalls = 0;
  state.lastSeatInput = null;
  state.wxOk = true;
  state.aliOk = true;
});

describe("R1-A 微信回调：收款事实必需字段", () => {
  it("SUCCESS + 交易号 + 金额齐全 → 入账成功，履约收到交易号与金额", async () => {
    seedRecharge("o1");
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: "wxT1", amount: { total: 1000 } };
    const res = await wechatNotifyPOST(
      new NextRequest("http://localhost/api/payments/notify/wechat", {
        method: "POST",
        headers: { "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r" },
        body: "<xml/>",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe("SUCCESS");
    expect(state.grantPointsCalls).toBe(1);
  });

  it("解密后缺金额 → 拒绝（400 FAIL），绝不入账", async () => {
    seedRecharge("o1");
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: "wxT1", amount: null };
    const res = await wechatNotifyPOST(
      new NextRequest("http://localhost/api/payments/notify/wechat", {
        method: "POST",
        headers: { "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r" },
        body: "<xml/>",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("FAIL");
    expect(state.grantPointsCalls).toBe(0);
  });

  it("解密后缺交易号 → 拒绝（400 FAIL），绝不入账", async () => {
    seedRecharge("o1");
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: null, amount: { total: 1000 } };
    const res = await wechatNotifyPOST(
      new NextRequest("http://localhost/api/payments/notify/wechat", {
        method: "POST",
        headers: { "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r" },
        body: "<xml/>",
      }),
    );
    expect(res.status).toBe(400);
    expect(state.grantPointsCalls).toBe(0);
  });

  it("非 SUCCESS（如 CLOSED）→ 确认收到但不入账，零发放", async () => {
    state.wxResource = { out_trade_no: "o1", trade_state: "CLOSED", transaction_id: "wxT1", amount: { total: 1000 } };
    const res = await wechatNotifyPOST(
      new NextRequest("http://localhost/api/payments/notify/wechat", {
        method: "POST",
        headers: { "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r" },
        body: "<xml/>",
      }),
    );
    expect(res.status).toBe(200);
    expect(state.grantPointsCalls).toBe(0);
  });
});

describe("R1-B 支付宝回调：透传 trade_no 作为网关交易号", () => {
  const baseForm = {
    app_id: "app",
    out_trade_no: "o1",
    trade_status: "TRADE_SUCCESS",
    trade_no: "aliT1",
    total_amount: "10.00",
  };
  const aliReq = (form: any) =>
    new NextRequest("http://localhost/api/payments/notify/alipay", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: Object.entries(form)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&"),
    });

  it("trade_no + 金额齐全 → 入账成功，履约收到 trade_no", async () => {
    // [U04] 渠道口径修正：支付宝收款的订单渠道应为 ALIPAY，不能拿微信订单接支付宝回调。
    seedRecharge("o1", "PENDING", 1000, "ALIPAY");
    state.aliForm = baseForm;
    const res = await alipayNotifyPOST(aliReq(baseForm));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("success");
    expect(state.grantPointsCalls).toBe(1);
  });

  it("缺 trade_no → 拒绝（400 fail），零入账", async () => {
    seedRecharge("o1", "PENDING", 1000, "ALIPAY");
    state.aliForm = { ...baseForm, trade_no: "" };
    const res = await alipayNotifyPOST(aliReq({ ...baseForm, trade_no: "" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("fail");
    expect(state.grantPointsCalls).toBe(0);
  });

  it("缺 total_amount（金额不可解析）→ 拒绝（400 fail），零入账", async () => {
    seedRecharge("o1", "PENDING", 1000, "ALIPAY");
    state.aliForm = { ...baseForm, total_amount: "" };
    const res = await alipayNotifyPOST(aliReq({ ...baseForm, total_amount: "" }));
    expect(res.status).toBe(400);
    expect(state.grantPointsCalls).toBe(0);
  });
});

describe("R1-C fulfill：同交易号跨订单唯一约束", () => {
  it("交易号已被其他 SUCCESS 订单占用 → 后续订单拒绝重复履约", async () => {
    seedRecharge("A", "SUCCESS", 1000);
    state.orders["A"].metadata = { gatewayTransactionId: "T1" };
    seedRecharge("B", "PENDING", 1000);
    const r = await fulfillPaidOrder({
      orderNo: "B",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayTransactionId: "T1",
      gatewayAmountCents: 1000,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("REJECTED");
    expect(r.error).toContain("已被其他订单使用");
    expect(state.grantPointsCalls).toBe(0);
    expect(state.orders["B"].status).toBe("PENDING");
  });

  it("同单重复通知 → 首次入账，二次幂等返回已处理，仅一次发放", async () => {
    seedRecharge("o1");
    const input = { orderNo: "o1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "T2", gatewayAmountCents: 1000 };
    const a = await fulfillPaidOrder(input);
    const b = await fulfillPaidOrder(input);
    expect(a.status).toBe("FULFILLED");
    expect(b.status).toBe("ALREADY_PROCESSED");
    expect(state.grantPointsCalls).toBe(1);
  });
});

describe("R1-D 取消/超时后收到已验收款：留存待恢复事实，不发放不丢钱", () => {
  it("已 CANCELLED 且收款事实齐备 → RECEIPT_PENDING_RECOVERY，零发放，写入 pendingReceipt", async () => {
    seedRecharge("o1", "CANCELLED", 1000);
    const r = await fulfillPaidOrder({
      orderNo: "o1",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayTransactionId: "T3",
      gatewayAmountCents: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(state.grantPointsCalls).toBe(0);
    expect(state.orders["o1"].status).toBe("CANCELLED");
    expect(state.orders["o1"].metadata.pendingReceipt.gatewayTransactionId).toBe("T3");
    expect(state.orders["o1"].metadata.pendingReceipt.recoverable).toBe(true);
  });

  it("已 EXPIRED 且收款事实齐备 → RECEIPT_PENDING_RECOVERY，零发放", async () => {
    // [U04] 渠道口径修正：ALIPAY 收款对应 ALIPAY 订单。
    seedRecharge("o1", "EXPIRED", 1000, "ALIPAY");
    const r = await fulfillPaidOrder({
      orderNo: "o1",
      paymentMethod: "ALIPAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayTransactionId: "T4",
      gatewayAmountCents: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(state.grantPointsCalls).toBe(0);
  });

  it("已 CANCELLED 但缺交易号 → 拒绝且不留存（不接收不可核验的收款）", async () => {
    seedRecharge("o1", "CANCELLED", 1000);
    const r = await fulfillPaidOrder({
      orderNo: "o1",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayAmountCents: 1000,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("REJECTED");
    expect(state.orders["o1"].metadata?.pendingReceipt).toBeUndefined();
    expect(state.grantPointsCalls).toBe(0);
  });

  it("网关重试同笔已留存收款 → 幂等仍为 RECEIPT_PENDING_RECOVERY，不重复写入、不发放", async () => {
    seedRecharge("o1", "CANCELLED", 1000);
    const first = await fulfillPaidOrder({ orderNo: "o1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "T5", gatewayAmountCents: 1000 });
    const second = await fulfillPaidOrder({ orderNo: "o1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "T5", gatewayAmountCents: 1000 });
    expect(first.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(second.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(state.grantPointsCalls).toBe(0);
  });
});

describe("R1-E 席位类型：真实收款透传交易号给席位履约", () => {
  it("SEAT_ADDON 真实回调 → 席位履约收到 gatewayTransactionId", async () => {
    seedSeat("SA1");
    const r = await fulfillPaidOrder({
      orderNo: "SA1",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayTransactionId: "T6",
      gatewayAmountCents: 2600,
    });
    expect(r.status).toBe("FULFILLED");
    expect(state.fulfillSeatCalls).toBe(1);
    expect(state.lastSeatInput.gatewayTransactionId).toBe("T6");
    expect(state.lastSeatInput.isRealPayment).toBe(true);
  });
});

describe("R1-F 订单查询只读：零业务写、零发放", () => {
  it("GET /payments/order 返回订单信息，不触发任何入账", async () => {
    seedRecharge("o1", "SUCCESS");
    const res = await orderGET(new NextRequest("http://localhost/api/payments/order?orderNo=o1", { method: "GET" }));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.success).toBe(true);
    expect(b.data.orderNo).toBe("o1");
    expect(state.grantPointsCalls).toBe(0);
    // 订单状态未被查询改动
    expect(state.orders["o1"].status).toBe("SUCCESS");
  });
});
