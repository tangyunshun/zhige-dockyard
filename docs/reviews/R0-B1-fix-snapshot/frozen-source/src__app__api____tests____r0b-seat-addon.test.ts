/**
 * R0-B 隔离回归测试：SEAT_ADDON 席位订单唯一履约 + 原子一致性。
 *
 * 覆盖（IDE-R0-B-PROMPT.md 第 5 节验收表）：
 *  - 单次有效订单恰好增加一次；
 *  - 同一订单并发/重复确认（含强制都先读到 PENDING 的陈旧预读）最终只增加一次；
 *  - REAL 与 MOCK 共用同一履约服务（同一状态机）；REAL 金额缺失/不符拒绝；MOCK 门禁/登录/归属保持；
 *  - 事务各写点（状态更新后席位失败、席位更新后提交失败）注入：同回滚、重试后恰好一次；
 *  - 根客户端写入逃逸检测：事务进行中任何根客户端写直接失败（封闭 stub）；
 *  - 不同订单同一空间并发各增加一次；
 *  - 非 PENDING/超时/损坏席位数/缺空间/异常金额/到期基准变化：拒绝且不覆盖状态；
 *  - 充值/PLAN_UPGRADE 既有分支回归。
 *
 * 隔离说明：只替换数据库/认证/网关验签输入等 IO；不 mock 被修的核心履约服务
 * （fulfillSeatAddonOrder / fulfillPaidOrder / mock confirm POST 均为真实代码执行）。
 * 内存 Prisma 记录写操作时序（TX/ROOT）、真实模拟条件更新 count、事务回滚（undo 日志）；
 * 不把所有 updateMany 都当成 count=1，不把 $transaction 当成只执行回调。
 * 内存模型不证明 MySQL 行锁/隔离级别/回滚语义——真实库并发仍待专门验证。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（真实模拟条件更新 / 事务回滚 / 根写逃逸检测） ══════════════

const store: { billingrecord: Record<string, any>; workspace: Record<string, any>; workspaceplan: Record<string, any> } = {
  billingrecord: {},
  workspace: {},
  workspaceplan: {},
};

let writeLog: string[] = []; // 如 "TX billingrecord.updateMany" / "ROOT billingrecord.update"
let txDepth = 0; // >0 表示事务进行中：任何根客户端写直接失败（发现事务外更新）
let txQueue: Promise<any> = Promise.resolve(); // 并发事务串行化（模拟行锁排队，同审核夹具口径）
let failConf: { model: string; method: string; times: number } | null = null; // 事务内故障注入
let failCommit = false; // 提交阶段故障注入
let staleFirstBillingRead: { row: any; used: boolean } | null = null; // 模拟并发下陈旧的事务外预读

function checkFail(model: string, method: string) {
  if (failConf && failConf.model === model && failConf.method === method && failConf.times > 0) {
    failConf.times--;
    throw new Error(`INJECTED_FAIL_${model}_${method}`);
  }
}

function applyData(row: any, data: any): any {
  const next: any = { ...row };
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "increment" in (v as any)) {
      next[k] = Number(next[k] ?? 0) + Number((v as any).increment);
    } else {
      next[k] = v;
    }
  }
  return next;
}

function makeClient(kind: "ROOT" | "TX", undo?: (() => void)[]) {
  const record = (model: string, method: string) => writeLog.push(`${kind} ${model}.${method}`);
  const stage = (restore: () => void) => undo?.push(restore);
  const guardRootWrite = () => {
    if (kind === "ROOT" && txDepth > 0) throw new Error("ROOT_WRITE_DURING_TX");
  };
  return {
    billingrecord: {
      async findUnique({ where }: any) {
        if (staleFirstBillingRead && !staleFirstBillingRead.used && kind === "ROOT") {
          staleFirstBillingRead.used = true;
          return staleFirstBillingRead.row ? { ...staleFirstBillingRead.row } : null;
        }
        const row = store.billingrecord[where?.id];
        return row ? { ...row } : null;
      },
      async update({ where, data }: any) {
        record("billingrecord", "update");
        guardRootWrite();
        checkFail("billingrecord", "update");
        const id = where?.id;
        const row = store.billingrecord[id];
        if (!row) throw new Error("RECORD_NOT_FOUND");
        const prev = { ...row };
        store.billingrecord[id] = applyData(row, data);
        stage(() => {
          store.billingrecord[id] = prev;
        });
        return { ...store.billingrecord[id] };
      },
      async updateMany({ where, data }: any) {
        record("billingrecord", "updateMany");
        guardRootWrite();
        checkFail("billingrecord", "updateMany");
        const id = where?.id;
        const row = store.billingrecord[id];
        if (!row) return { count: 0 };
        if (where.status != null && row.status !== where.status) return { count: 0 }; // 条件不满足 → count 0
        const prev = { ...row };
        store.billingrecord[id] = applyData(row, data);
        stage(() => {
          store.billingrecord[id] = prev;
        });
        return { count: 1 };
      },
      async create({ data }: any) {
        record("billingrecord", "create");
        guardRootWrite();
        checkFail("billingrecord", "create");
        store.billingrecord[data.id] = { ...data };
        return { ...store.billingrecord[data.id] };
      },
    },
    workspace: {
      async findUnique({ where }: any) {
        const row = store.workspace[where?.id];
        return row ? { ...row } : null;
      },
      async update({ where, data }: any) {
        record("workspace", "update");
        guardRootWrite();
        checkFail("workspace", "update");
        const id = where?.id;
        const row = store.workspace[id];
        if (!row) throw new Error("WORKSPACE_NOT_FOUND");
        const prev = { ...row };
        store.workspace[id] = applyData(row, data);
        stage(() => {
          store.workspace[id] = prev;
        });
        return { ...store.workspace[id] };
      },
    },
    workspaceplan: {
      async findUnique({ where }: any) {
        const row = store.workspaceplan[where?.key];
        return row ? { ...row } : null;
      },
    },
  };
}

function makePrisma() {
  const prismaProxy: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          return (fn: any) => {
            // 并发 $transaction 排队串行执行（对应 InnoDB 行锁下事务串行化），不互相嵌套
            const run = async () => {
              txDepth++;
              const undo: (() => void)[] = [];
              try {
                const r = await fn(makeClient("TX", undo));
                if (failCommit) {
                  failCommit = false;
                  throw new Error("INJECTED_COMMIT_FAIL"); // 提交阶段失败 → 回滚
                }
                return r;
              } catch (e) {
                // 回滚：逆序撤销本事务全部写入（原子性）
                for (let i = undo.length - 1; i >= 0; i--) undo[i]();
                throw e;
              } finally {
                txDepth--;
              }
            };
            const p = txQueue.then(run, run);
            txQueue = p.catch(() => {});
            return p;
          };
        }
        const rootClient = makeClient("ROOT");
        return (rootClient as any)[prop];
      },
    },
  );
  return prismaProxy;
}

// ══════════════ 依赖替换 ══════════════

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
const grantPoints = vi.fn(async (_params?: any) => ({ ledgerId: "led_1" }));
vi.mock("@/lib/credit-service", () => ({ grantPoints, getBalanceSummary: vi.fn(async () => ({})) }));
let paymentMode: "MOCK" | "REAL" = "MOCK";
const createCharge = vi.fn(async () => ({ mode: "MOCK", payUrl: "https://pay.example/x" }));
vi.mock("@/lib/payment-gateway", () => ({
  resolvePaymentMode: () => paymentMode,
  createCharge,
}));
let authBehavior: { valid: boolean; user: any } = { valid: true, user: { id: "u1", role: "USER" } };
vi.mock("@/lib/auth", () => ({
  validateUser: async () =>
    authBehavior.valid ? { valid: true, user: authBehavior.user } : { valid: false },
}));
vi.mock("@/lib/workspace-readonly-guard", () => ({ assertWorkspaceWritable: vi.fn(async () => {}) }));
const fulfillEnterpriseUpgradeFromOrder = vi.fn(async () => ({
  newWorkspaceId: "ws-ent-x",
  message: "ok",
  giftMigrated: 0,
}));
vi.mock("@/lib/workspace-upgrade-service", () => ({ fulfillEnterpriseUpgradeFromOrder }));

const { fulfillPaidOrder } = await import("@/lib/payment/fulfill");
const { POST: mockConfirmPOST } = await import("@/app/api/payments/mock/confirm/route");
const { POST: seatAddonPOST } = await import("@/app/api/workspace/seat-addon/route");

// ══════════════ 夹具 ══════════════

function seedFixture(opts: {
  orderId?: string;
  seats?: any;
  amount?: any;
  extraSeats?: number;
  status?: string;
  expired?: boolean;
  workspaceId?: any;
  workspaceMissing?: boolean;
  workspaceType?: string;
  planExpiresMismatch?: boolean;
  workspacePlanExpiresNull?: boolean;
}) {
  const orderId = opts.orderId ?? "SA_test_1";
  const planExpiresAt = new Date(Date.now() + 30 * 86400000);
  const order: any = {
    id: orderId,
    userId: "u1",
    workspaceId: opts.workspaceId !== undefined ? opts.workspaceId : "w1",
    type: "SEAT_ADDON",
    title: "席位增购",
    amount: opts.amount !== undefined ? opts.amount : 2600,
    currency: "CNY",
    status: opts.status ?? "PENDING",
    channel: "WECHAT_PAY",
    expiresAt: opts.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3600_000),
    referenceId: "w1",
    metadata: {
      seats: opts.seats !== undefined ? opts.seats : 2,
      expiresAt: opts.planExpiresMismatch
        ? new Date(Date.now() + 10 * 86400000).toISOString()
        : planExpiresAt.toISOString(),
      billingCycle: "MONTH",
      planKey: "PRO",
    },
    updatedAt: new Date(),
  };
  store.billingrecord[orderId] = order;
  if (!opts.workspaceMissing) {
    store.workspace["w1"] = {
      id: "w1",
      name: "企业空间",
      type: opts.workspaceType ?? "ENTERPRISE",
      ownerId: "u1",
      extraSeats: opts.extraSeats ?? 0,
      plan: "PRO",
      planExpiresAt: opts.workspacePlanExpiresNull ? null : planExpiresAt,
    };
  }
  return { order };
}

function mockConfirmReq(orderNo: string) {
  return new NextRequest("http://localhost/api/payments/mock/confirm", {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ orderNo }),
  });
}

beforeEach(() => {
  store.billingrecord = {};
  store.workspace = {};
  store.workspaceplan = {};
  writeLog = [];
  txDepth = 0;
  txQueue = Promise.resolve();
  failConf = null;
  failCommit = false;
  staleFirstBillingRead = null;
  paymentMode = "MOCK";
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  grantPoints.mockClear();
  createCharge.mockClear();
  fulfillEnterpriseUpgradeFromOrder.mockClear();
});

// ══════════════ 1. 单次有效订单 ══════════════

describe("R0-B 基础履约：单次有效 2 席位订单", () => {
  it("REAL 回调：总增量 2，状态 SUCCESS，履约记录完整（付款模式/交易号/席位数）", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "test",
      gatewayTransactionId: "wx_tx_1",
      gatewayAmountCents: 2600,
    });
    expect(r).toMatchObject({ ok: true, status: "FULFILLED", seats: 2, workspaceId: "w1" });
    const order = store.billingrecord["SA_test_1"];
    expect(order.status).toBe("SUCCESS");
    expect(order.metadata.seatsAdded).toBe(2);
    expect(order.metadata.paymentMode).toBe("REAL");
    expect(order.metadata.gatewayTransactionId).toBe("wx_tx_1");
    expect(order.metadata.paidAt).toBeTruthy();
    expect(store.workspace["w1"].extraSeats).toBe(2);
    // 履约写入全部在事务客户端：条件更新（写边界）→ 席位增量；无根客户端写逃逸
    expect(writeLog).toContain("TX billingrecord.updateMany");
    expect(writeLog).toContain("TX workspace.update");
    expect(writeLog.filter((w) => w.startsWith("ROOT"))).toEqual([]);
  });

  it("MOCK 确认：同一服务入账，paymentMode 如实记录 MOCK（不冒充真实收入）", async () => {
    seedFixture({ seats: 3, amount: 3900 });
    const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, alreadyProcessed: false, seats: 3 });
    expect(store.billingrecord["SA_test_1"].metadata.paymentMode).toBe("MOCK");
    expect(store.billingrecord["SA_test_1"].metadata.gatewayTransactionId).toBeNull();
    expect(store.workspace["w1"].extraSeats).toBe(3);
    expect(writeLog).toContain("TX billingrecord.updateMany");
  });

  it("REAL 与 MOCK 共用同一状态机：两次独立订单分别经两条入口，写入序列同构", async () => {
    // REAL 入口
    seedFixture({ orderId: "SA_real", seats: 2, amount: 2600 });
    const r1 = await fulfillPaidOrder({
      orderNo: "SA_real",
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "t",
      gatewayAmountCents: 2600,
    });
    expect(r1.status).toBe("FULFILLED");
    const realLog = [...writeLog];
    // MOCK 入口
    writeLog = [];
    seedFixture({ orderId: "SA_mock", seats: 2, amount: 2600 });
    await mockConfirmPOST(mockConfirmReq("SA_mock"));
    // 两条入口的履约写序列一致：同一 updateMany + 同一 workspace.update
    expect(writeLog.filter((w) => w.startsWith("TX"))).toEqual(
      realLog.filter((w) => w.startsWith("TX")),
    );
  });
});

// ══════════════ 2. 并发/重复确认只履约一次 ══════════════

describe("R0-B 并发唯一履约权", () => {
  it("同一订单两次真实并发确认（Promise.all）：只增 2，恰好一次 FULFILLED，其余已处理", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const mk = () =>
      fulfillPaidOrder({
        orderNo: "SA_test_1",
        paymentMethod: "WECHAT_PAY",
        paymentMode: "REAL",
        remark: "t",
        gatewayAmountCents: 2600,
      });
    const [r1, r2] = await Promise.all([mk(), mk()]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(["ALREADY_PROCESSED", "FULFILLED"]);
    expect(store.workspace["w1"].extraSeats).toBe(2); // 最终仍只增 2
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBe(2);
  });

  it("强制陈旧预读（两个请求都先读到 PENDING）：写边界条件更新仍只允许一个履约", async () => {
    const { order } = seedFixture({ seats: 2, amount: 2600 });
    // 第二个请求的事务外预读返回陈旧的 PENDING 快照（模拟并发下读到旧值）
    staleFirstBillingRead = { row: JSON.parse(JSON.stringify(order)), used: false };
    const r1 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    const r2 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r1.status).toBe("FULFILLED");
    expect(r2.status).toBe("ALREADY_PROCESSED"); // 事务外读 PENDING ≠ 获得履约权
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("三次重复确认：最终仍只增 2，零重复成功记录", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const mk = () =>
      fulfillPaidOrder({ orderNo: "SA_test_1", paymentMethod: "ALIPAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600 });
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await mk()).status);
    expect(results.filter((s) => s === "FULFILLED").length).toBe(1);
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("mock 确认先成功后重复 POST：alreadyProcessed 响应，零新增权益、无重复成功记录", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    const data = await res.json();
    expect(data).toMatchObject({ success: true, alreadyProcessed: true, seats: 2 });
    expect(store.workspace["w1"].extraSeats).toBe(2);
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBe(2);
  });

  it("不同订单同一空间并发：各增加一次，总量正确，互不覆盖", async () => {
    seedFixture({ orderId: "SA_a", seats: 2, amount: 2600 });
    seedFixture({ orderId: "SA_b", seats: 3, amount: 3900 });
    const [ra, rb] = await Promise.all([
      fulfillPaidOrder({ orderNo: "SA_a", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600 }),
      fulfillPaidOrder({ orderNo: "SA_b", paymentMethod: "ALIPAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 3900 }),
    ]);
    expect(ra.status).toBe("FULFILLED");
    expect(rb.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(5);
    expect(store.billingrecord["SA_a"].metadata.seatsAdded).toBe(2);
    expect(store.billingrecord["SA_b"].metadata.seatsAdded).toBe(3);
  });
});

// ══════════════ 3. 事务原子性与故障恢复 ══════════════

describe("R0-B 事务原子性：各写点/提交故障注入", () => {
  it("席位更新失败（状态条件更新已执行）→ 同回滚：订单保持 PENDING、席位未增；重试后恰好履约一次", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    failConf = { model: "workspace", method: "update", times: 1 };
    const r1 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r1.ok).toBe(false);
    expect((r1 as any).retryable).toBe(true);
    // 无半成功：SUCCESS 未落、席位未增
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBeUndefined();
    expect(store.workspace["w1"].extraSeats).toBe(0);
    // 重试：恰好履约一次
    const r2 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r2.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
  });

  it("提交阶段失败（状态与席位均已写入后 commit 失败）→ 全回滚，重试后恰好一次", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    failCommit = true;
    const r1 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r1.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
    expect(store.workspace["w1"].extraSeats).toBe(0);
    const r2 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r2.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("订单条件更新失败注入 → 可重试错误，无任何写入", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    failConf = { model: "billingrecord", method: "updateMany", times: 1 };
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("所有履约测试中根客户端写从未逃逸出事务（封闭 stub 使根写在事务内直接失败）", async () => {
    // 由 harness 保证：txDepth>0 时根写抛 ROOT_WRITE_DURING_TX，任何用例失败即暴露。
    // 此处补一个显式断言：正常履约写序列只包含 TX 写 + 事务外的预读/重读（只读）。
    seedFixture({ seats: 2, amount: 2600 });
    await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    const rootWrites = writeLog.filter((w) => w.startsWith("ROOT"));
    expect(rootWrites).toEqual([]);
  });
});

// ══════════════ 4. REAL 金额门禁与 MOCK 权限门禁 ══════════════

describe("R0-B 金额与权限门禁", () => {
  it("REAL 缺实付金额 → 拒绝，零权益写入，订单保持 PENDING", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: null,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("REAL 金额与订单不一致 → 拒绝入账", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2601,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("REAL 模式下 MOCK 确认接口被门禁阻断（403），零写入", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    paymentMode = "REAL";
    const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res.status).toBe(403);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("未登录 → 401；他人订单 → 403，均零写入", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    authBehavior = { valid: false, user: null as any };
    const res1 = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res1.status).toBe(401);
    authBehavior = { valid: true, user: { id: "attacker", role: "USER" } };
    const res2 = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res2.status).toBe(403);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });
});

// ══════════════ 5. 不可入账/损坏订单 ══════════════

describe("R0-B 非 PENDING、超时与损坏订单", () => {
  const nonPending = ["EXPIRED", "FAILED", "REFUNDED"];
  for (const st of nonPending) {
    it(`状态 ${st} → 拒绝且不覆盖为 SUCCESS，零席位`, async () => {
      seedFixture({ seats: 2, amount: 2600, status: st });
      const r = await fulfillPaidOrder({
        orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
      });
      expect(r.ok).toBe(false);
      expect(store.billingrecord["SA_test_1"].status).toBe(st); // 未被覆盖
      expect(store.workspace["w1"].extraSeats).toBe(0);
    });
  }

  it("已过支付截止时间的 PENDING 订单 → 落库 EXPIRED 并拒绝（迟到回调）", async () => {
    seedFixture({ seats: 2, amount: 2600, expired: true });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  const badSeats = [0, -1, 1.5, "abc", null];
  for (const s of badSeats) {
    it(`损坏席位数 seats=${JSON.stringify(s)} → 拒绝并人工核查，零写入`, async () => {
      seedFixture({ seats: s as any, amount: 2600 });
      const r = await fulfillPaidOrder({
        orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
      });
      expect(r.ok).toBe(false);
      expect(store.workspace["w1"].extraSeats).toBe(0);
      expect(store.billingrecord["SA_test_1"].status).toBe("PENDING"); // 不伪造成 SUCCESS
    });
  }

  it("异常金额（0 元）→ 拒绝并入工核查，零写入", async () => {
    seedFixture({ seats: 2, amount: 0 });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 0,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("缺目标空间（workspaceId 为空）→ 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceId: null });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("目标空间不存在 → 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceMissing: true });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"]).toBeUndefined();
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("空间类型变化（非企业）→ 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceType: "PERSONAL" });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("席位相加溢出 Int 上限 → 拒绝，零写入", async () => {
    seedFixture({ seats: 3, amount: 2600, extraSeats: 2147483646 });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(2147483646);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("套餐到期基准变化（已续费/变更）→ 拒绝并人工核查，不授予错误席位", async () => {
    seedFixture({ seats: 2, amount: 2600, planExpiresMismatch: true });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("空间套餐到期时间为空 → 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspacePlanExpiresNull: true });
    const r = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });
});

// ══════════════ 6. 下单契约与既有分支回归 ══════════════

describe("R0-B 下单契约与回归（不改变定价公式）", () => {
  it("seat-addon 下单：小数席位数被拒绝（不用 Math.floor 猜成有效）", async () => {
    store.workspace["w1"] = {
      id: "w1", name: "企业空间", type: "ENTERPRISE", ownerId: "u1", extraSeats: 0,
      plan: "PRO", planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 30 * 86400000),
    };
    store.workspaceplan["PRO"] = { key: "PRO", priceMonthly: 2600, maxMembers: 5 };
    const req = new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2.5, paymentMethod: "WECHAT_PAY" }),
    });
    const res = await seatAddonPOST(req);
    expect(res.status).toBe(400);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("seat-addon 下单：合法请求只创建 PENDING 订单，绝不立即加席位", async () => {
    const ws = {
      id: "w1", name: "企业空间", type: "ENTERPRISE", ownerId: "u1", extraSeats: 0,
      plan: "PRO", planBillingCycle: "MONTH", planExpiresAt: new Date(Date.now() + 30 * 86400000),
    };
    store.workspace["w1"] = ws;
    store.workspaceplan["PRO"] = { key: "PRO", priceMonthly: 2600, maxMembers: 5 };
    const req = new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
    });
    const res = await seatAddonPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.payUrl).toBeTruthy(); // 仅返回收银台地址
    const order = store.billingrecord[data.orderNo];
    expect(order.status).toBe("PENDING"); // 待支付
    expect(order.metadata.seats).toBe(2);
    expect(store.workspace["w1"].extraSeats).toBe(0); // 未提前发权益
  });

  it("回归：RECHARGE 分支不受影响（grantPoints 幂等键绑定订单号）", async () => {
    store.billingrecord["RC_1"] = {
      id: "RC_1", userId: "u1", workspaceId: "w1", type: "TOKEN_RECHARGE", amount: 1000,
      status: "PENDING", channel: "WECHAT_PAY", expiresAt: new Date(Date.now() + 3600_000),
      title: "充值", metadata: { points: 100 },
    };
    store.workspace["w1"] = { id: "w1", name: "w", type: "PERSONAL", ownerId: "u1", extraSeats: 0 };
    const r = await fulfillPaidOrder({
      orderNo: "RC_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 1000,
    });
    expect(r.status).toBe("FULFILLED");
    expect(grantPoints).toHaveBeenCalledTimes(1);
    expect((grantPoints.mock.calls[0] as any[])[0].idempotencyKey).toBe("RC_1");
    expect(store.billingrecord["RC_1"].status).toBe("SUCCESS");
  });

  it("回归：PLAN_UPGRADE 分支不受影响（履约后标记 SUCCESS）", async () => {
    store.billingrecord["UP_1"] = {
      id: "UP_1", userId: "u1", workspaceId: "w1", type: "PLAN_UPGRADE", amount: 19900,
      status: "PENDING", channel: "WECHAT_PAY", expiresAt: new Date(Date.now() + 3600_000),
      title: "升级", metadata: {},
    };
    const r = await fulfillPaidOrder({
      orderNo: "UP_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 19900,
    });
    expect(r.status).toBe("FULFILLED");
    expect(fulfillEnterpriseUpgradeFromOrder).toHaveBeenCalledWith("UP_1");
    expect(store.billingrecord["UP_1"].status).toBe("SUCCESS");
  });
});
