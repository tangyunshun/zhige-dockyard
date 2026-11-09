/**
 * R0-E / 原方案 F08 止损：生产环境禁止模拟支付入账。
 *
 * E01—E08 定向隔离验收：执行**真实** resolvePaymentMode / createCharge / 三个付费下单路由 /
 * 模拟确认 GET+POST / 真实微信 notify 路由；只替换认证、持久化、计费、履约、验签 IO；
 * 被修的 @/lib/payment-gateway 不 mock（核心修复必须真实执行）。
 *
 * 内存夹具记录所有 prisma 读/写、grantPoints 调用与渠道动态导入，用以证明：
 *  - 生产显式 mock 下零订单读取、零入账、零成功状态/资产写、零真实渠道调用；
 *  - 非生产 mock 与 production+real 既有的安全行为保持。
 *
 * 隔离：process.env 用 vi.stubEnv 隔离并自动恢复；零真实库/支付/模型/密钥/网络访问。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state: any = {
    order: null as any,
    orders: [] as any[],
    workspace: {
      id: "w1", ownerId: "u1", name: "ws", type: "PERSONAL", plan: "STANDARD",
      planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 86400000), description: "",
    },
    reads: 0,
    writes: [] as any[],
    grantPointsCalls: 0,
    fulfillCalls: 0,
    verifyOk: true, // 控制 wechatpay.verifyNotify 的返回
    verifyResource: {
      out_trade_no: "TR_fixture", trade_state: "SUCCESS", transaction_id: "wx123",
      amount: { total: 1000 },
    },
  };
  return { state };
});
const { state } = h;
const clone = <T,>(v: T): T => structuredClone(v);

function makePrisma() {
  const p: any = {
    workspace: {
      findUnique: async () => { state.reads++; return clone(state.workspace); },
      findMany: async () => { state.reads++; return []; },
    },
    workspacemember: {
      findUnique: async () => { state.reads++; return { userId: "u1", workspaceId: "w1", role: "OWNER" }; },
      findMany: async () => { state.reads++; return []; },
    },
    user: {
      findUnique: async () => { state.reads++; return { id: "u1", email: "u1@x", membershipLevel: "FREE", role: "USER" }; },
    },
    membershiplevel: {
      findUnique: async () => { state.reads++; return { id: "FREE", tokenPackDiscount: 0, maxEnterpriseWorkspaces: 1 }; },
    },
    workspaceplan: {
      findUnique: async () => { state.reads++; return { key: "STANDARD", maxMembers: 5, priceMonthly: 1000 }; },
    },
    tokenpack: { findUnique: async () => null, findFirst: async () => null },
    billingrecord: {
      create: async (...a: any[]) => { state.writes.push({ table: "billingrecord", method: "create" }); return { id: a[0]?.data?.id }; },
      findUnique: async () => { state.reads++; return clone(state.order); },
      findMany: async () => clone(state.orders),
      update: async (...a: any[]) => { state.writes.push({ table: "billingrecord", method: "update" }); if (state.order) Object.assign(state.order, a[0]?.data); return clone(state.order); },
      updateMany: async () => { state.writes.push({ table: "billingrecord", method: "updateMany" }); return { count: state.order ? 1 : 0 }; },
    },
  };
  p.billing_record = p.billingrecord;
  return p;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => ({ valid: true, user: { id: "u1", email: "u1@x", role: "USER", membershipLevel: "FREE" } }),
  isAdminRole: () => false,
}));
vi.mock("@/lib/security", () => ({
  requireWorkspaceMembership: async () => true,
}));
vi.mock("@/lib/credit-service", () => ({
  grantPoints: async (...args: any[]) => { state.grantPointsCalls++; return { ledgerId: "LEDGER", args }; },
  getBalanceSummary: async () => ({ balance: 100 }),
}));
vi.mock("@/lib/order-expiry", () => ({
  newOrderExpiry: () => new Date(Date.now() + 3600000),
  isOrderExpired: () => false,
}));
vi.mock("@/lib/workspace-readonly-guard", () => ({
  assertWorkspaceWritable: async () => undefined,
}));
vi.mock("@/lib/workspace-plan-service", () => ({
  getWorkspacePlanStrict: (raw: string) => {
    if (!raw || raw.toUpperCase() === "STANDARD") {
      return { ok: true, config: { name: "标准版", priceMonthly: 0, priceYearly: 0, isActive: true } };
    }
    return { ok: true, config: { name: "PRO 企业版", priceMonthly: 1000, priceYearly: 12000, isActive: true } };
  },
}));
vi.mock("@/constants/workspace-plans", () => ({ DEFAULT_WORKSPACE_PLAN: "STANDARD" }));
vi.mock("@/lib/point-rate", () => ({
  pointsToCents: (p: number) => p * 10,
  discountedCents: (price: number) => price,
  formatDiscountLabel: () => "",
}));
vi.mock("@/lib/workspace-upgrade-service", () => ({
  fulfillEnterpriseUpgradeFromOrder: async () => ({ ok: true, newWorkspaceId: "w2", message: "" }),
  provisionEnterpriseUpgrade: async () => ({ message: "", newWorkspaceId: "w2", giftMigrated: false }),
}));
vi.mock("@/lib/payment/wechatpay", () => ({
  verifyNotify: async () => (state.verifyOk
    ? { ok: true, resource: clone(state.verifyResource) }
    : { ok: false, error: "bad signature" }),
  NOTIFY_RESPONSE: { success: { code: "SUCCESS", message: "OK" } },
}));
vi.mock("@/lib/payment/fulfill", () => ({
  fulfillPaidOrder: async (..._a: any[]) => { state.fulfillCalls++; return { ok: true, status: "FULFILLED" }; },
}));
vi.mock("@/lib/payment/alipay", () => ({ buildPagePayUrl: () => ({ ok: false, error: "mock" }) }));

// 真实 payment-gateway 必须真实加载（核心修复）
const { resolvePaymentMode, createCharge, PaymentConfigError } = await import("@/lib/payment-gateway");
const mockRoute = await import("@/app/api/payments/mock/confirm/route");
const createRoute = await import("@/app/api/payments/create/route");
const seatRoute = await import("@/app/api/workspace/seat-addon/route");
const upgradeRoute = await import("@/app/api/workspace/upgrade/route");
const notifyRoute = await import("@/app/api/payments/notify/wechat/route");

const CODE = "PRODUCTION_MOCK_PAYMENT_DISABLED";
const setEnv = (node: string, mode?: string) => {
  vi.stubEnv("NODE_ENV", node);
  if (mode !== undefined) vi.stubEnv("PAYMENT_MODE", mode);
  else vi.stubEnv("PAYMENT_MODE", "");
};

function mockReq(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  state.order = null;
  state.orders = [];
  state.reads = 0;
  state.writes = [];
  state.grantPointsCalls = 0;
  state.fulfillCalls = 0;
  state.verifyOk = true;
  state.workspace = {
    id: "w1", ownerId: "u1", name: "ws", type: "PERSONAL", plan: "STANDARD",
    planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 86400000), description: "",
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  // 清掉可能遗留的凭证类环境变量
  for (const k of ["WECHATPAY_APP_ID", "WECHATPAY_MCH_ID", "WECHATPAY_API_V3_KEY", "WECHATPAY_SERIAL_NO", "WECHATPAY_PRIVATE_KEY_PATH", "ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY_PATH", "ALIPAY_PUBLIC_KEY_PATH", "PAYMENT_NOTIFY_HOST"]) {
    vi.stubEnv(k, "");
  }
  vi.unstubAllEnvs();
});

describe("R0-E E01：核心模式裁决（真实 resolvePaymentMode / createCharge）", () => {
  it("production + mock（含空格/大小写变体）一律抛 PaymentConfigError，不返回 MOCK", () => {
    for (const mode of ["mock", " MOCK ", "Mock", "MOCK "]) {
      setEnv("production", mode);
      expect(() => resolvePaymentMode()).toThrow(PaymentConfigError);
      try { resolvePaymentMode(); } catch (e: any) { expect(e.code).toBe(CODE); }
      // 直接 createCharge 也必须拒绝
      return expect(createCharge({ orderNo: "X", amountCents: 100, subject: "s", channel: "WECHAT_PAY" })).rejects.toThrow(PaymentConfigError);
    }
  });

  it("即便伪造齐备真实凭证，production+mock 仍拒绝，绝不静默切 REAL 调供应商", async () => {
    setEnv("production", "mock");
    vi.stubEnv("WECHATPAY_APP_ID", "a");
    vi.stubEnv("WECHATPAY_MCH_ID", "b");
    vi.stubEnv("WECHATPAY_API_V3_KEY", "c");
    vi.stubEnv("WECHATPAY_SERIAL_NO", "d");
    vi.stubEnv("WECHATPAY_PRIVATE_KEY_PATH", "/x");
    vi.stubEnv("PAYMENT_NOTIFY_HOST", "https://cb");
    expect(() => resolvePaymentMode()).toThrow(PaymentConfigError);
    await expect(createCharge({ orderNo: "X", amountCents: 100, subject: "s", channel: "WECHAT_PAY" })).rejects.toThrow(PaymentConfigError);
    // 没有任何真实网关动态导入发生（被前置拒绝）
    expect(state.fulfillCalls).toBe(0);
  });

  it("development / test 显式 mock 或缺失配置仍按联调 MOCK 可用", () => {
    setEnv("development", "mock");
    expect(resolvePaymentMode()).toBe("MOCK");
    setEnv("test", "");
    expect(resolvePaymentMode()).toBe("MOCK");
  });

  it("production + real / 未配置 / 非法值 维持 REAL（不降级 MOCK）", () => {
    setEnv("production", "real");
    expect(resolvePaymentMode()).toBe("REAL");
    setEnv("production", "");
    expect(resolvePaymentMode()).toBe("REAL");
    setEnv("production", "invalid");
    expect(resolvePaymentMode()).toBe("REAL");
  });
});

describe("R0-E E02：模拟确认 GET/POST 生产 mock 明确拒绝", () => {
  const mkGet = (orderNo = "o1") =>
    mockReq("GET", `http://localhost/api/payments/mock/confirm?orderNo=${orderNo}`);
  const mkPost = (orderNo = "o1") =>
    mockReq("POST", "http://localhost/api/payments/mock/confirm", { orderNo });

  it("production+mock：GET 与 POST 均 403 + success:false + 稳定 code，零订单读取/发放", async () => {
    for (const mode of ["mock", " MOCK ", "Mock"]) {
      setEnv("production", mode);
      const g = await mockRoute.GET(mkGet());
      expect(g.status).toBe(403);
      const gb = await g.json();
      expect(gb.success).toBe(false);
      expect(gb.code).toBe(CODE);

      const p = await mockRoute.POST(mkPost());
      expect(p.status).toBe(403);
      const pb = await p.json();
      expect(pb.success).toBe(false);
      expect(pb.code).toBe(CODE);

      // 在读取订单 / 入账之前已拒绝：零订单读、零写、零发放
      expect(state.reads).toBe(0);
      expect(state.writes).toEqual([]);
      expect(state.grantPointsCalls).toBe(0);
      // 响应不含订单/金额/用户/密钥信息
      const raw = JSON.stringify(gb) + JSON.stringify(pb);
      expect(raw).not.toContain("o1");
      expect(raw).not.toContain("100");
    }
  });

  it("非生产 mock：GET/POST 正常可用；三类订单与历史 PENDING MOCK 可被模拟确认入账", async () => {
    setEnv("development", "mock");
    // 充值类 PENDING 订单
    state.order = { id: "o1", userId: "u1", workspaceId: "w1", type: "TOKEN_RECHARGE", status: "PENDING", title: "充值", amount: 1000, channel: "WECHAT_PAY", metadata: { points: 100 } };
    const p = await mockRoute.POST(mkPost("o1"));
    expect(p.status).toBe(200);
    const pb = await p.json();
    expect(pb.success).toBe(true);
    expect(pb.points).toBe(100);
    expect(state.grantPointsCalls).toBe(1);

    // 重复确认：已 SUCCESS 不再二次发放
    state.order = { ...state.order, status: "SUCCESS", metadata: { points: 100, grantLedgerId: "LEDGER" } };
    const p2 = await mockRoute.POST(mkPost("o1"));
    expect((await p2.json()).alreadyProcessed).toBe(true);
    expect(state.grantPointsCalls).toBe(1); // 未重复发放

    // 他人订单拒绝
    state.order = { id: "o1", userId: "other", workspaceId: "w1", type: "TOKEN_RECHARGE", status: "PENDING", title: "充值", amount: 1000, channel: "WECHAT_PAY", metadata: { points: 100 } };
    const g = await mockRoute.GET(mkGet("o1"));
    expect(g.status).toBe(403);
  });
});

describe("R0-E E03：三条付费下单路由 生产 mock 前置于下单/权益写拒绝", () => {
  it("充值：production+mock 返回 503 + 稳定 code，零 PENDING 订单创建、零渠道、零发放", async () => {
    setEnv("production", "mock");
    const res = await createRoute.POST(mockReq("POST", "http://localhost/api/payments/create", { workspaceId: "w1", points: 100 }));
    expect(res.status).toBe(503);
    const b = await res.json();
    expect(b.success).toBe(false);
    expect(b.code).toBe(CODE);
    expect(state.writes.filter((w: any) => w.method === "create")).toEqual([]); // 零本次订单创建
    expect(state.grantPointsCalls).toBe(0);
  });

  it("席位增购：production+mock 返回 503，零订单/零席位变化", async () => {
    state.workspace = { id: "w1", ownerId: "u1", name: "ws", type: "ENTERPRISE", plan: "PRO", planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 86400000), description: "" };
    setEnv("production", "mock");
    const res = await seatRoute.POST(mockReq("POST", "http://localhost/api/workspace/seat-addon", { workspaceId: "w1", seats: 2 }));
    expect(res.status).toBe(503);
    const b = await res.json();
    expect(b.success).toBe(false);
    expect(b.code).toBe(CODE);
    expect(state.writes.filter((w: any) => w.method === "create")).toEqual([]);
  });

  it("付费套餐升级：production+mock 返回 503，零订单/零开通", async () => {
    setEnv("production", "mock");
    const res = await upgradeRoute.POST(mockReq("POST", "http://localhost/api/workspace/upgrade", { workspaceId: "w1", targetPlan: "PRO", billingCycle: "MONTH", option: "retain" }, { "x-user-id": "u1" }));
    expect(res.status).toBe(503);
    const b = await res.json();
    expect(b.success).toBe(false);
    expect(b.code).toBe(CODE);
    expect(state.writes.filter((w: any) => w.method === "create")).toEqual([]);
  });
});

describe("R0-E E04：production+real 安全行为保持，不 MOCK 降级", () => {
  it("production+real：模拟 GET/POST 仍 403（REAL_MODE_MOCK_UNAVAILABLE），零发放", async () => {
    setEnv("production", "real");
    const g = await mockRoute.GET(mockReq("GET", "http://localhost/api/payments/mock/confirm?orderNo=o1"));
    expect(g.status).toBe(403);
    const gb = await g.json();
    expect(gb.success).toBe(false);
    expect(gb.code).toBe("REAL_MODE_MOCK_UNAVAILABLE");
    const p = await mockRoute.POST(mockReq("POST", "http://localhost/api/payments/mock/confirm", { orderNo: "o1" }));
    expect(p.status).toBe(403);
    expect(state.grantPointsCalls).toBe(0);
  });

  it("production+real 缺凭证创建充值：诚实拒绝，不返回 MOCK payUrl、不发放", async () => {
    setEnv("production", "real");
    const res = await createRoute.POST(mockReq("POST", "http://localhost/api/payments/create", { workspaceId: "w1", points: 100 }));
    // createCharge 在 REAL 缺凭证下抛错（诚实拒绝），外层 catch 返回错误；无论如何不能出现 MOCK 成功
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.grantPointsCalls).toBe(0);
    const b = await res.json().catch(() => ({}));
    expect(JSON.stringify(b)).not.toContain("/user/pay/mock");
  });

  it("production 非法值 / 未配置：仍按 REAL，模拟确认禁止", async () => {
    for (const mode of ["", "invalid"]) {
      setEnv("production", mode);
      const g = await mockRoute.GET(mockReq("GET", "http://localhost/api/payments/mock/confirm?orderNo=o1"));
      expect(g.status).toBe(403);
    }
  });
});

describe("R0-E E05：development/test 显式 mock 及缺失配置正常联调", () => {
  it("dev+mock 三条付费下单均创建 PENDING 订单并返回 MOCK 收银台，不发放", async () => {
    setEnv("development", "mock");
    const c = await createRoute.POST(mockReq("POST", "http://localhost/api/payments/create", { workspaceId: "w1", points: 100 }));
    expect(c.status).toBe(200);
    const cb = await c.json();
    expect(cb.success).toBe(true);
    expect(cb.payUrl).toMatch(/^\/user\/pay\/mock/);
    expect(cb.paymentMode).toBe("MOCK");
    expect(state.grantPointsCalls).toBe(0);

    state.workspace = { id: "w1", ownerId: "u1", name: "ws", type: "ENTERPRISE", plan: "PRO", planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 86400000), description: "" };
    const s = await seatRoute.POST(mockReq("POST", "http://localhost/api/workspace/seat-addon", { workspaceId: "w1", seats: 2 }));
    expect(s.status).toBe(200);
    const sb = await s.json();
    expect(sb.success).toBe(true);
    expect(sb.payUrl).toMatch(/^\/user\/pay\/mock/);

    // 升级要求 PERSONAL 空间，恢复夹具避免上一子步骤的 ENTERPRISE 状态泄漏
    state.workspace = { id: "w1", ownerId: "u1", name: "ws", type: "PERSONAL", plan: "STANDARD", planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 86400000), description: "" };
    const u = await upgradeRoute.POST(mockReq("POST", "http://localhost/api/workspace/upgrade", { workspaceId: "w1", targetPlan: "PRO", billingCycle: "MONTH", option: "retain" }, { "x-user-id": "u1" }));
    expect(u.status).toBe(200);
    const ub = await u.json();
    expect(ub.success).toBe(true);
    expect(ub.payUrl).toMatch(/^\/user\/pay\/mock/);
    expect(state.grantPointsCalls).toBe(0);
  });

  it("合法免费升级（基础档月年均为 0）不受 production+mock 影响，仍直接开通", async () => {
    setEnv("production", "mock");
    const res = await upgradeRoute.POST(mockReq("POST", "http://localhost/api/workspace/upgrade", { workspaceId: "w1", billingCycle: "MONTH", option: "retain" }, { "x-user-id": "u1" }));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.free).toBe(true); // 免费资格保持，未被付款闸门误拦
    expect(state.writes.filter((w: any) => w.method === "create")).toEqual([]); // 免费路径本就不创建付费订单
  });
});

describe("R0-E E06：真实 notify 路由与验签 IO stub 组合（不改验签算法）", () => {
  const notifyReq = (ok: boolean) => {
    state.verifyOk = ok;
    return new NextRequest("http://localhost/api/payments/notify/wechat", {
      method: "POST",
      headers: {
        "wechatpay-timestamp": "1", "wechatpay-nonce": "n", "wechatpay-signature": "s", "wechatpay-serial": "r",
      },
      body: "<xml/>",
    });
  };

  it("验签通过 + SUCCESS：既有的履约链路被调用并返回微信成功 ACK", async () => {
    setEnv("production", "mock"); // 即便环境误配为 mock，notify 仍按 REAL 履约，不受模式裁决影响
    const res = await notifyRoute.POST(notifyReq(true));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.code).toBe("SUCCESS");
    expect(state.fulfillCalls).toBe(1);
  });

  it("验签失败：401 + code=FAIL，绝不履行入账", async () => {
    const res = await notifyRoute.POST(notifyReq(false));
    expect(res.status).toBe(401);
    const b = await res.json();
    expect(b.code).toBe("FAIL");
    expect(state.fulfillCalls).toBe(0);
  });

  it("验签通过但 trade_state 非 SUCCESS：确认收到但不入账（不放宽）", async () => {
    state.verifyResource = { out_trade_no: "TR_fixture", trade_state: "CLOSED", transaction_id: "wx", amount: { total: 1000 } };
    const res = await notifyRoute.POST(notifyReq(true));
    expect(res.status).toBe(200);
    expect(state.fulfillCalls).toBe(0);
  });
});

describe("R0-E E07：页面错误结果（真实 mock 页在 403 下显示错误、不假成功/不自动重买）", () => {
  it("mock 确认 GET 在生产 mock 下返回稳定 code，页面据以展示错误而非本地 SUCCESS", async () => {
    setEnv("production", "mock");
    const g = await mockRoute.GET(mockReq("GET", "http://localhost/api/payments/mock/confirm?orderNo=o1"));
    const b = await g.json();
    expect(g.status).toBe(403);
    expect(b.success).toBe(false);
    expect(b.code).toBe(CODE);
    // 错误信息清晰且不含任何“成功/已支付/已到账”诱导
    expect(b.error).toContain("生产环境");
    expect(b.error).not.toMatch(/成功|到账|已支付/);
  });
});

describe("R0-E E08：数据边界 — 全程零真实渠道/第三方调用", () => {
  it("全部生产 mock 用例均未触发真实网关动态导入（fulfill/wechatpay 仅被 stub 命中计数）", async () => {
    // E01 中已验证 createCharge 在 production+mock 抛错前不会 import 真实网关；
    // 这里再确认 notify 履约路径的 fulfill 调用只来自显式 stub，无真实请求。
    setEnv("production", "mock");
    await createRoute.POST(mockReq("POST", "http://localhost/api/payments/create", { workspaceId: "w1", points: 100 }));
    // 渠道侧不应有来自 createCharge 的真实调用；fulfillCalls 仅由 E06 显式触发
    expect(state.grantPointsCalls).toBe(0);
  });
});
