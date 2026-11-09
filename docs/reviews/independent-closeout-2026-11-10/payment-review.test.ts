/**
 * U04（原 5）收口正式反例：收款事实与唯一履约。
 *
 * 隔离：仅替换数据库委托 / 权益发放 / 订单过期判定等外部 IO；真实执行 fulfillPaidOrder
 * 与两条 notify 路由。替身忠实模拟 billingrecord.id 主键唯一约束（P2002）、
 * 条件 updateMany 的 count 语义、grantPoints 的 orderNo 幂等键；不用"自动成功"失真 mock。
 * 零真实库/支付/网络/密钥；金额与交易号全为虚构夹具。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const state: any = {
  orders: {} as Record<string, any>,
  grantCalls: 0,
  grantedKeys: new Set<string>(),
  wxResource: null as any,
  aliForm: null as any,
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

vi.mock("@/lib/prisma", () => {
  const billing = {
    create: async ({ data }: any) => {
      // 忠实模拟主键唯一约束：重复认领键抛 P2002。
      if (state.orders[data.id]) {
        throw Object.assign(new Error("Unique constraint failed on (`id`)"), { code: "P2002" });
      }
      state.orders[data.id] = clone(data);
      return clone(data);
    },
    findUnique: async ({ where }: any) => {
      const o = state.orders[where.id];
      return o ? clone(o) : null;
    },
    findFirst: async ({ where }: any) => {
      if (where?.status === "SUCCESS" && where?.id?.not && where?.metadata?.equals != null) {
        for (const id of Object.keys(state.orders)) {
          const o = state.orders[id];
          if (o.status === "SUCCESS" && id !== where.id.not && o.metadata?.gatewayTransactionId === where.metadata.equals) {
            return clone(o);
          }
        }
      }
      return null;
    },
    update: async ({ where, data }: any) => {
      const o = state.orders[where.id];
      if (!o) return null;
      const merged = { ...o, ...data };
      if (data.metadata) merged.metadata = { ...(o.metadata || {}), ...data.metadata };
      state.orders[where.id] = merged;
      return clone(merged);
    },
    updateMany: async ({ where, data }: any) => {
      const o = state.orders[where.id];
      if (o && o.status === where.status) {
        Object.assign(o, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
  };
  return {
    prisma: {
      billingrecord: billing,
      billing_record: billing,
      workspace: { findUnique: async () => ({ id: "w1", type: "PERSONAL", name: "ws" }) },
    },
  };
});

vi.mock("@/lib/credit-service", () => ({
  grantPoints: async (args: any) => {
    if (args?.idempotencyKey != null) {
      if (state.grantedKeys.has(args.idempotencyKey)) return { ledgerId: "LEDGER" };
      state.grantedKeys.add(args.idempotencyKey);
    }
    state.grantCalls++;
    return { ledgerId: "LEDGER" };
  },
  getBalanceSummary: async () => ({ balance: 100 }),
}));
vi.mock("@/lib/order-expiry", () => ({ isOrderExpired: () => false }));
vi.mock("@/lib/workspace-upgrade-service", () => ({ fulfillEnterpriseUpgradeFromOrder: async () => ({ ok: true, newWorkspaceId: "w2" }) }));
vi.mock("@/lib/payment/seat-addon-fulfill", () => ({ fulfillSeatAddonOrder: async () => ({ ok: true, status: "FULFILLED" as const, seats: 2 }) }));
vi.mock("@/lib/payment/wechatpay", () => ({
  verifyNotify: async () => ({ ok: true, resource: clone(state.wxResource) }),
  NOTIFY_RESPONSE: { success: { code: "SUCCESS" }, fail: { code: "FAIL" } },
}));
vi.mock("@/lib/payment/alipay", () => ({
  verifyNotify: async () => ({
    ok: true,
    outTradeNo: state.aliForm.out_trade_no,
    tradeStatus: state.aliForm.trade_status,
    totalAmount: state.aliForm.total_amount,
    tradeNo: state.aliForm.trade_no,
    appId: state.aliForm.app_id,
  }),
}));

import { fulfillPaidOrder } from "@/lib/payment/fulfill";
import { parseYuanToCents, parseCents } from "@/lib/payment/receipt";
import { POST as wechatPOST } from "@/app/api/payments/notify/wechat/route";
import { POST as alipayPOST } from "@/app/api/payments/notify/alipay/route";

function seed(id: string, opts: any = {}) {
  state.orders[id] = {
    id, userId: "u1", workspaceId: "w1", type: "TOKEN_RECHARGE", title: "充值",
    amount: opts.amount ?? 1000, status: opts.status ?? "PENDING",
    channel: opts.channel ?? "WECHAT_PAY", currency: opts.currency ?? "CNY",
    metadata: { points: 100, ...(opts.metadata || {}) },
  };
}
const real = (orderNo: string, extra: any = {}) => ({
  orderNo, paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "fixture",
  gatewayTransactionId: "TXN-1", gatewayAmountCents: 1000, ...extra,
});

beforeEach(() => {
  state.orders = {};
  state.grantCalls = 0;
  state.grantedKeys.clear();
  state.wxResource = null;
  state.aliForm = null;
});

describe("U04 金额按安全整数与协议精度解析", () => {
  it("parseYuanToCents：合法两位小数、整数元", () => {
    expect(parseYuanToCents("10.00")).toBe(1000);
    expect(parseYuanToCents("0.01")).toBe(1);
    expect(parseYuanToCents("12")).toBe(1200);
  });
  it("多余精度/指数/NaN/负数/超范围/非字符串一律拒绝", () => {
    expect(parseYuanToCents("10.004")).toBeNull();
    expect(parseYuanToCents("1e3")).toBeNull();
    expect(parseYuanToCents("NaN")).toBeNull();
    expect(parseYuanToCents("-1.00")).toBeNull();
    expect(parseYuanToCents("")).toBeNull();
    expect(parseYuanToCents("9999999999999999.99")).toBeNull();
    expect(parseYuanToCents(1000 as any)).toBeNull();
  });
  it("parseCents：仅正的安全整数分", () => {
    expect(parseCents(1000)).toBe(1000);
    expect(parseCents(10.5)).toBeNull();
    expect(parseCents(NaN)).toBeNull();
    expect(parseCents(Infinity)).toBeNull();
    expect(parseCents(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseCents("1000" as any)).toBeNull();
  });
});

describe("U04 收款事实与唯一履约", () => {
  it("合法 REAL 收款：恰好一次发放，认领行与订单 SUCCESS 同时落下", async () => {
    seed("o1");
    const r = await fulfillPaidOrder(real("o1"));
    expect(r.status).toBe("FULFILLED");
    expect(state.grantCalls).toBe(1);
    expect(state.orders["o1"].status).toBe("SUCCESS");
  });

  it("双订单并发同交易号：最多一次权益、一次发放（持久唯一认领裁决）", async () => {
    seed("A"); seed("B");
    const results = await Promise.all([
      fulfillPaidOrder(real("A")),
      fulfillPaidOrder(real("B")),
    ]);
    expect(results.filter((r) => r.status === "FULFILLED").length).toBeLessThanOrEqual(1);
    expect(state.grantCalls).toBeLessThanOrEqual(1);
  });

  it("同单重发：首次 FULFILLED，二次 ALREADY_PROCESSED，零双发", async () => {
    seed("o1");
    const a = await fulfillPaidOrder(real("o1"));
    const b = await fulfillPaidOrder(real("o1"));
    expect(a.status).toBe("FULFILLED");
    expect(b.status).toBe("ALREADY_PROCESSED");
    expect(state.grantCalls).toBe(1);
  });

  it("渠道不符（ALIPAY 收款兑现 WECHAT_PAY 订单）→ 拒绝，零发放", async () => {
    seed("A");
    const r = await fulfillPaidOrder(real("A", { paymentMethod: "ALIPAY" }));
    expect(r.status).toBe("REJECTED");
    expect(state.grantCalls).toBe(0);
  });

  it("币种非 CNY → 拒绝，零发放", async () => {
    seed("A", { currency: "USD" });
    const r = await fulfillPaidOrder(real("A"));
    expect(r.status).toBe("REJECTED");
    expect(state.grantCalls).toBe(0);
  });

  it("REAL 缺交易号 / 缺金额 / 金额不符 → 拒绝，零发放", async () => {
    seed("A");
    expect((await fulfillPaidOrder(real("A", { gatewayTransactionId: null }))).status).toBe("REJECTED");
    expect((await fulfillPaidOrder(real("A", { gatewayAmountCents: null }))).status).toBe("REJECTED");
    expect((await fulfillPaidOrder(real("A", { gatewayAmountCents: 999 }))).status).toBe("REJECTED");
    expect(state.grantCalls).toBe(0);
  });

  it("金额非法（小数分 / NaN / Infinity）→ 拒绝，零发放", async () => {
    seed("A");
    for (const bad of [10.5, NaN, Infinity]) {
      expect((await fulfillPaidOrder(real("A", { gatewayAmountCents: bad }))).status).toBe("REJECTED");
    }
    expect(state.grantCalls).toBe(0);
  });

  it("SUCCESS 幂等不被用来掩盖金额异常", async () => {
    seed("A", { status: "SUCCESS" });
    const r = await fulfillPaidOrder(real("A", { gatewayAmountCents: 999 }));
    expect(r.status).toBe("REJECTED");
    expect(state.grantCalls).toBe(0);
  });

  it("同交易号不同渠道是合法不同收款，不误冲突", async () => {
    seed("A", { channel: "WECHAT_PAY" });
    seed("B", { channel: "ALIPAY" });
    const a = await fulfillPaidOrder(real("A"));
    const b = await fulfillPaidOrder(real("B", { paymentMethod: "ALIPAY" }));
    expect(a.status).toBe("FULFILLED");
    expect(b.status).toBe("FULFILLED");
  });
});

describe("U04 晚收款多笔不覆盖", () => {
  it("CANCELLED 订单两笔不同交易：首笔保留，冲突另存，零发放", async () => {
    seed("A", { status: "CANCELLED" });
    const first = await fulfillPaidOrder(real("A", { gatewayTransactionId: "FIRST" }));
    const second = await fulfillPaidOrder(real("A", { gatewayTransactionId: "SECOND" }));
    expect(first.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(second.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(state.orders["A"].metadata.pendingReceipt.gatewayTransactionId).toBe("FIRST");
    expect(state.orders["A"].metadata.receiptConflicts.length).toBeGreaterThanOrEqual(1);
    expect(state.grantCalls).toBe(0);
  });

  it("同一笔晚收款重发幂等，不重复写入、不发放", async () => {
    seed("A", { status: "CANCELLED" });
    await fulfillPaidOrder(real("A", { gatewayTransactionId: "T5" }));
    await fulfillPaidOrder(real("A", { gatewayTransactionId: "T5" }));
    expect(state.orders["A"].metadata.receiptConflicts).toBeUndefined();
    expect(state.grantCalls).toBe(0);
  });
});

describe("U04 两条 notify 路由的金额与字段门禁", () => {
  const wxReq = () => new NextRequest("http://audit/api/payments/notify/wechat", {
    method: "POST",
    headers: { "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r" },
    body: "{}",
  });
  const aliReq = () => new NextRequest("http://audit/api/payments/notify/alipay", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1",
  });

  it("微信：金额齐全 → 200 入账一次", async () => {
    seed("o1");
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: "wxT1", amount: { total: 1000 } };
    const res = await wechatPOST(wxReq());
    expect(res.status).toBe(200);
    expect(state.grantCalls).toBe(1);
  });

  it("微信：非整数金额 / 缺金额 → 400 FAIL，零发放", async () => {
    seed("o1");
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: "wxT1", amount: { total: 10.5 } };
    expect((await wechatPOST(wxReq())).status).toBe(400);
    state.wxResource = { out_trade_no: "o1", trade_state: "SUCCESS", transaction_id: "wxT1", amount: null };
    expect((await wechatPOST(wxReq())).status).toBe(400);
    expect(state.grantCalls).toBe(0);
  });

  it("支付宝：10.004 多余精度视为非法，400 fail，零发放（不被四舍五入接受）", async () => {
    seed("o1", { channel: "ALIPAY" });
    state.aliForm = { app_id: "fixture-app", out_trade_no: "o1", trade_status: "TRADE_SUCCESS", trade_no: "aliT1", total_amount: "10.004" };
    const res = await alipayPOST(aliReq());
    expect(res.status).toBe(400);
    expect(state.grantCalls).toBe(0);
  });

  it("支付宝：合法 10.00 + trade_no → 200 success 入账一次", async () => {
    seed("o1", { channel: "ALIPAY" });
    state.aliForm = { app_id: "fixture-app", out_trade_no: "o1", trade_status: "TRADE_SUCCESS", trade_no: "aliT1", total_amount: "10.00" };
    const res = await alipayPOST(aliReq());
    expect(res.status).toBe(200);
    expect(state.grantCalls).toBe(1);
  });
});


describe("U04/原5 交易唯一认领覆盖所有订单类型", () => {
  it("同一交易并发两个不同席位订单：最多一次合法权益（认领唯一裁决，不复制席位发放）", async () => {
    seed("S1");
    state.orders["S1"].type = "SEAT_ADDON";
    seed("S2");
    state.orders["S2"].type = "SEAT_ADDON";
    const [r1, r2] = await Promise.all([
      fulfillPaidOrder(real("S1")),
      fulfillPaidOrder(real("S2")),
    ]);
    const fulfilled = [r1, r2].filter((r) => r.status === "FULFILLED");
    const rejected = [r1, r2].filter((r) => r.status === "REJECTED");
    expect(fulfilled.length).toBe(1); // 一笔收款最多一次权益
    expect(rejected.length).toBe(1); // 败者被认领唯一性拒绝（不静默吞）
    console.log("[DBG]", JSON.stringify([r1, r2].map(r=>r.status)), "grant=", state.grantCalls, Object.keys(state.orders));
    expect(state.grantCalls).toBe(0); // 席位走专用服务，无点数发放
  });

  it("REAL 席位缺交易号 → 拒绝，零权益（席位不再豁免交易号唯一认领）", async () => {
    seed("S3");
    state.orders["S3"].type = "SEAT_ADDON";
    const r = await fulfillPaidOrder(real("S3", { gatewayTransactionId: null }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe("REJECTED");
  });

  it("SUCCESS 订单收到另一笔交易：原子留存差异事实并 ACK，不追加权益不退款", async () => {
    seed("D1");
    await fulfillPaidOrder(real("D1")); // TXN-1 → SUCCESS
    const grantBefore = state.grantCalls;
    const r = await fulfillPaidOrder(real("D1", { gatewayTransactionId: "TXN-2" }));
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ALREADY_PROCESSED");
    expect(state.grantCalls).toBe(grantBefore); // 不追加权益
    // 差异事实行已持久（每 (订单,交易) 一行，可追溯）
    const diffId = "receipt-diff::D1::WECHAT_PAY::TXN-2";
    expect(state.orders[diffId]).toBeTruthy();
    expect(state.orders[diffId].status).toBe("DIFF_FACT");
  });

  it("终态订单两笔不同交易并发到账：两笔事实都可追溯（原子落行，互不覆盖）", async () => {
    seed("A", { status: "CANCELLED" });
    const [f1, f2] = await Promise.all([
      fulfillPaidOrder(real("A", { gatewayTransactionId: "T1" })),
      fulfillPaidOrder(real("A", { gatewayTransactionId: "T2" })),
    ]);
    expect(f1.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(f2.status).toBe("RECEIPT_PENDING_RECOVERY");
    // 两笔事实行各自持久
    const c1 = "receipt-claim::WECHAT_PAY::default::T1";
    const c2 = "receipt-claim::WECHAT_PAY::default::T2";
    expect(state.orders[c1]?.status).toBe("PENDING_RECOVERY");
    expect(state.orders[c2]?.status).toBe("PENDING_RECOVERY");
    expect(state.grantCalls).toBe(0);
  });
});
describe('Independent cross-state receipt ownership',()=>{
 it('DEFECT: transaction first registered as SUCCESS-order difference can still fulfill another pending order',async()=>{
  seed('A',{status:'SUCCESS',metadata:{gatewayTransactionId:'ORIGINAL'}});
  await fulfillPaidOrder(real('A',{gatewayTransactionId:'SECOND'}));
  expect(Object.values(state.orders).some((x:any)=>x.status==='DIFF_FACT'&&x.metadata?.gatewayTransactionId==='SECOND')).toBe(true);
  seed('B');const r=await fulfillPaidOrder(real('B',{gatewayTransactionId:'SECOND'}));
  expect(r.status).toBe('FULFILLED');expect(state.grantCalls).toBe(1);
 });
});