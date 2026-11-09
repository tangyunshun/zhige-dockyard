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
// [R0-B2-1] 进入事务回调前确定性推进（模拟回调前排队等待）；默认 0 不推进。
let txClockAdvanceMs = 0;
// [R0-B3] 事务「内部异步数据库操作」等待注入：进入回调不等于取锁，
// updateMany / findUnique 各自都可能等待。推进发生在该 client 方法体开头（即 await 的 IO 内部），
// 用于复现「回调开头采样 now 之后，条件求值前又跨过期限」。
interface DbWait {
  kind: "ROOT" | "TX";
  model: string;
  method: string;
  nth: number;
  advanceMs: number;
}
let dbWaitPlan: DbWait[] = [];
let dbCallSeq: Record<string, number> = {};
let dbEventLog: string[] = [];
let commitAdvanceMs = 0; // 授权完成、事务回调返回后（提交阶段）推进；不应反转已合法授权
function maybeAdvanceAtIO(kind: "ROOT" | "TX", model: string, method: string) {
  const key = `${kind}:${model}.${method}`;
  dbCallSeq[key] = (dbCallSeq[key] || 0) + 1;
  const hit = dbWaitPlan.find(
    (p) => p.kind === kind && p.model === model && p.method === method && p.nth === dbCallSeq[key],
  );
  if (hit) {
    dbEventLog.push(`WAIT@${key}#${dbCallSeq[key]}+${hit.advanceMs}ms`);
    try { vi.advanceTimersByTime(hit.advanceMs); } catch { /* 未启用假定时器时忽略 */ }
  } else {
    dbEventLog.push(`${key}#${dbCallSeq[key]}`);
  }
}
// [R0-B1] 明确并发屏障：前 N 次根客户端账单预读返回种子时刻的 PENDING 快照（两个竞争者都持有旧读）
let staleBillingRead: { row: any; remaining: number } | null = null;
let billingReadLog: string[] = []; // 每次根客户端账单读取返回的状态（断言两个竞争者都读到 PENDING）
// [R0-B1 F2] 动态变化注入：第 n 次 workspace 读取（含事务内重读）时执行 fn（模拟检查后变化）
let onNthWorkspaceRead: { n: number; fn: () => void; count: number } | null = null;

function checkFail(model: string, method: string) {
  if (failConf && failConf.model === model && failConf.method === method && failConf.times > 0) {
    failConf.times--;
    throw new Error(`INJECTED_FAIL_${model}_${method}`);
  }
}

// 真实评估 where 条件（与本次改动实际使用的 Prisma 选择器一致的最小算子集合）：
// id 由调用方按主键定位故跳过；notIn / gt / gte / lt / lte / equals / in 按真实语义求值；
// 标量（含 Date）按相等比较。未知算子不静默放行，抛错暴露夹具缺口。
function evalWhere(where: any, row: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (k === "id") continue;
    if (k === "OR" && Array.isArray(v)) {
      // [R0-B2-1] 真实 OR 语义：任一分支成立即可（用于 expiresAt 为 null 的历史订单）
      if (!v.some((branch: any) => evalWhere(branch, row))) return false;
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const ops = v as Record<string, any>;
      const known = ["notIn", "gt", "gte", "lt", "lte", "equals", "in"];
      const used = known.filter((op) => op in ops);
      if (used.length === 0) throw new Error(`UNSUPPORTED_WHERE_OPERATOR_${k}`);
      for (const op of used) {
        if (op === "notIn") {
          if (ops.notIn.includes(row[k])) return false;
        } else if (op === "in") {
          if (!ops.in.includes(row[k])) return false;
        } else if (op === "equals") {
          const a = ops.equals instanceof Date ? ops.equals.getTime() : new Date(ops.equals).getTime();
          const b = new Date(row[k]).getTime();
          if (a !== b && ops.equals !== row[k]) return false;
        } else {
          const rv = new Date(row[k]).getTime();
          const ov = new Date(ops[op]).getTime();
          if (op === "gt" && !(rv > ov)) return false;
          if (op === "gte" && !(rv >= ov)) return false;
          if (op === "lt" && !(rv < ov)) return false;
          if (op === "lte" && !(rv <= ov)) return false;
        }
      }
      continue; // 含算子则不走标量比较
    }
    if (v instanceof Date || row[k] instanceof Date) {
      if (new Date(row[k]).getTime() !== new Date(v as any).getTime()) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
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
        maybeAdvanceAtIO(kind, "billingrecord", "findUnique");
        if (kind === "ROOT") {
          if (staleBillingRead && staleBillingRead.remaining > 0) {
            staleBillingRead.remaining--;
            billingReadLog.push(staleBillingRead.row?.status ?? "null");
            return { ...staleBillingRead.row };
          }
        }
        const row = store.billingrecord[where?.id];
        if (kind === "ROOT") billingReadLog.push(row?.status ?? "null");
        return row ? { ...row } : null;
      },
      async findFirst({ where }: any) {
        // R1 跨订单交易号去重：扫描是否存在同交易号的其他 SUCCESS 订单（只读，不计入写日志）
        if (where?.status && where?.id?.not != null && where?.metadata?.path && where?.metadata?.equals != null) {
          const tid = where.metadata.equals;
          for (const id of Object.keys(store.billingrecord)) {
            const row = store.billingrecord[id];
            if (row?.status === where.status && id !== where.id.not && row?.metadata?.gatewayTransactionId === tid) {
              return { ...row };
            }
          }
          return null;
        }
        return null;
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
        maybeAdvanceAtIO(kind, "billingrecord", "updateMany");
        guardRootWrite();
        checkFail("billingrecord", "updateMany");
        const id = where?.id;
        const row = store.billingrecord[id];
        if (!row) return { count: 0 };
        if (!evalWhere(where, row)) return { count: 0 }; // 条件不满足 → count 0（含 status/过期/损坏）
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
        // [U04/§13] 忠实唯一约束：主键冲突抛 P2002（收款认领/事实行依赖它裁决并发）
        if (store.billingrecord[data.id]) {
          const e = new Error("unique constraint");
          (e as any).code = "P2002";
          throw e;
        }
        store.billingrecord[data.id] = { ...data };
        return { ...store.billingrecord[data.id] };
      },
    },
    workspace: {
      async findUnique({ where }: any) {
        maybeAdvanceAtIO(kind, "workspace", "findUnique");
        if (onNthWorkspaceRead) {
          onNthWorkspaceRead.count++;
          if (onNthWorkspaceRead.count === onNthWorkspaceRead.n) {
            onNthWorkspaceRead.fn();
          }
        }
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
      // [R0-B1 F2] 条件席位写入：真实评估全部关键事实条件（不恒 count=1）
      async updateMany({ where, data }: any) {
        record("workspace", "updateMany");
        maybeAdvanceAtIO(kind, "workspace", "updateMany");
        guardRootWrite();
        checkFail("workspace", "updateMany");
        const id = where?.id;
        const row = store.workspace[id];
        if (!row) return { count: 0 };
        if (!evalWhere(where, row)) return { count: 0 }; // 条件不满足 → count 0（type/plan/cycle/planExpiresAt/status）
        const prev = { ...row };
        store.workspace[id] = applyData(row, data);
        stage(() => {
          store.workspace[id] = prev;
        });
        return { count: 1 };
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
              // [R0-B2-1] 进入事务/取得锁后确定性推进时间，模拟排队/等待后再裁决（覆盖预检通过后跨期限）
              if (txClockAdvanceMs > 0) {
                try { vi.advanceTimersByTime(txClockAdvanceMs); } catch { /* 未启用假定时器时忽略 */ }
              }
              const undo: (() => void)[] = [];
              try {
                const r = await fn(makeClient("TX", undo));
                // [R0-B3 T06] 授权已完成、提交阶段才跨期限：不应反转已合法授权
                if (commitAdvanceMs > 0) {
                  dbEventLog.push(`WAIT@COMMIT+${commitAdvanceMs}ms`);
                  try { vi.advanceTimersByTime(commitAdvanceMs); } catch { /* 未启用假定时器时忽略 */ }
                }
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
const createCharge = vi.fn(async (): Promise<any> => ({ mode: "MOCK", payUrl: "https://pay.example/x" }));
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
// [R0-B1] 回调验签 IO stub（仅替换验签输入，验签结果为模拟，非实际交易；不放宽生产验签）
const wxVerifyNotify = vi.fn();
vi.mock("@/lib/payment/wechatpay", () => ({
  verifyNotify: wxVerifyNotify,
  NOTIFY_RESPONSE: { success: { code: "SUCCESS", message: "成功" } },
}));
const aliVerifyNotify = vi.fn();
vi.mock("@/lib/payment/alipay", () => ({ verifyNotify: aliVerifyNotify }));

const { fulfillPaidOrder } = await import("@/lib/payment/fulfill");
const { fulfillSeatAddonOrder } = await import("@/lib/payment/seat-addon-fulfill");
const { GET: mockConfirmGET, POST: mockConfirmPOST } = await import("@/app/api/payments/mock/confirm/route");
const { POST: seatAddonPOST } = await import("@/app/api/workspace/seat-addon/route");
// [R0-B1] 真实回调路由（验签 IO 以 stub 替换，验签结果为模拟，非实际交易）与订单查询路由
const { POST: wxNotifyPOST } = await import("@/app/api/payments/notify/wechat/route");
const { POST: aliNotifyPOST } = await import("@/app/api/payments/notify/alipay/route");
const { GET: orderGET } = await import("@/app/api/payments/order/route");
// [R0-B1 F4] 实际生产展示契约（两个收银台页面直接导入使用）
const { resolveCashierStatusView, resolveCashierSuccessView, resolveCashierCompletion, isConfirmedSuccessResponse, isQrReady } = await import(
  "@/lib/payment-cashier-display"
);

// ══════════════ 夹具 ══════════════

// 共享套餐到期基准：所有订单与空间一致（多个订单同一空间时报价基准可比对）
const PLAN_EXPIRES_BASE = new Date(Date.now() + 30 * 86400000);

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
  workspaceStatus?: string;
  workspacePlan?: string;
  workspaceCycle?: string;
  planExpiresMismatch?: boolean;
  workspacePlanExpiresNull?: boolean;
  omitPlanKey?: boolean;
  omitBillingCycle?: boolean;
  omitExpiresAt?: boolean;
  // [U04] 订单支付渠道，默认微信；支付宝回调用例显式传 "ALIPAY" 以符合渠道一致性。
  channel?: string;
  // [R0-B2-1] 期限偏置：相对"此刻"向后/向前偏移，用于构造"预检通过、进入事务前跨过截止"的窗口
  expiresOffsetMs?: number;
  planExpiresOffsetMs?: number;
}) {
  const orderId = opts.orderId ?? "SA_test_1";
  const meta: Record<string, unknown> = {
    seats: opts.seats !== undefined ? opts.seats : 2,
    expiresAt: opts.planExpiresMismatch
      ? new Date(Date.now() + 10 * 86400000).toISOString()
      : opts.planExpiresOffsetMs !== undefined
        ? new Date(Date.now() + opts.planExpiresOffsetMs).toISOString()
        : PLAN_EXPIRES_BASE.toISOString(),
    billingCycle: "MONTH",
    planKey: "PRO",
  };
  if (opts.omitPlanKey) delete meta.planKey;
  if (opts.omitBillingCycle) delete meta.billingCycle;
  if (opts.omitExpiresAt) delete meta.expiresAt;
  const order: any = {
    id: orderId,
    userId: "u1",
    workspaceId: opts.workspaceId !== undefined ? opts.workspaceId : "w1",
    type: "SEAT_ADDON",
    title: "席位增购",
    amount: opts.amount !== undefined ? opts.amount : 2600,
    currency: "CNY",
    status: opts.status ?? "PENDING",
    channel: opts.channel ?? "WECHAT_PAY",
    expiresAt: opts.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3600_000),
    referenceId: "w1",
    metadata: meta,
    updatedAt: new Date(),
  };
  store.billingrecord[orderId] = order;
  if (!opts.workspaceMissing) {
    store.workspace["w1"] = {
      id: "w1",
      name: "企业空间",
      type: opts.workspaceType ?? "ENTERPRISE",
      status: opts.workspaceStatus ?? "ACTIVE",
      ownerId: "u1",
      extraSeats: opts.extraSeats ?? 0,
      plan: opts.workspacePlan ?? "PRO",
      planBillingCycle: opts.workspaceCycle ?? "MONTH",
      planExpiresAt: opts.workspacePlanExpiresNull
        ? null
        : opts.planExpiresOffsetMs !== undefined
          ? new Date(Date.now() + opts.planExpiresOffsetMs)
          : PLAN_EXPIRES_BASE,
    };
  }
  if (opts.expiresOffsetMs !== undefined) {
    // [R0-B2-1] 订单支付截止偏置：构造"预检通过、进入事务前跨过截止"的窗口
    store.billingrecord[orderId].expiresAt = new Date(Date.now() + opts.expiresOffsetMs);
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
  txClockAdvanceMs = 0;
  dbWaitPlan = [];
  dbCallSeq = {};
  dbEventLog = [];
  commitAdvanceMs = 0;
  staleBillingRead = null;
  billingReadLog = [];
  onNthWorkspaceRead = null;
  paymentMode = "MOCK";
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  grantPoints.mockClear();
  createCharge.mockReset(); // 清除上个用例遗留的 mockImplementation（mockClear 不清除实现）
  createCharge.mockImplementation(async () => ({
    mode: "MOCK",
    channel: "WECHAT_PAY",
    payUrl: "/user/pay/mock?orderNo=x",
    gatewayPayload: null,
  }));
  fulfillEnterpriseUpgradeFromOrder.mockClear();
  wxVerifyNotify.mockReset();
  wxVerifyNotify.mockResolvedValue({ ok: false, error: "not configured" });
  aliVerifyNotify.mockReset();
  aliVerifyNotify.mockResolvedValue({ ok: false, error: "not configured" });
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
    // 履约写入全部在事务客户端：条件更新（写边界）→ 条件席位写入；无根客户端写逃逸
    expect(writeLog).toContain("TX billingrecord.updateMany");
    expect(writeLog).toContain("TX workspace.updateMany");
    expect(writeLog.filter((w) => w.startsWith("ROOT"))).toEqual(["ROOT billingrecord.create"]); // [U04] 唯一认领行
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
      gatewayTransactionId: "tx_SA_real",
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
        gatewayTransactionId: "tx_SA_test_1",
        gatewayAmountCents: 2600,
      });
    const [r1, r2] = await Promise.all([mk(), mk()]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(["ALREADY_PROCESSED", "FULFILLED"]);
    expect(store.workspace["w1"].extraSeats).toBe(2); // 最终仍只增 2
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBe(2);
  });

  it("[R0-B1 修正] 明确同步屏障：同订单两个竞争者都先读到 PENDING，仍恰好一次履约", async () => {
    const { order } = seedFixture({ seats: 2, amount: 2600 });
    // 屏障：前 2 次根客户端账单预读都返回种子时刻的 PENDING 快照（两个竞争者各持旧读）
    staleBillingRead = { row: JSON.parse(JSON.stringify(order)), remaining: 2 };
    const mk = () =>
      fulfillPaidOrder({
        gatewayTransactionId: "tx_SA_test_1",
        orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
      });
    const [r1, r2] = await Promise.all([mk(), mk()]);
    // 读日志断言：两个竞争者在写边界前都读到 PENDING（不是第二次读到 SUCCESS 的串行重放）
    expect(billingReadLog.slice(0, 2)).toEqual(["PENDING", "PENDING"]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(["ALREADY_PROCESSED", "FULFILLED"]);
    expect(store.workspace["w1"].extraSeats).toBe(2);
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
  });

  it("三次重复确认：最终仍只增 2，零重复成功记录", async () => {
    seedFixture({ seats: 2, amount: 2600, channel: "ALIPAY" });
    const mk = () =>
      fulfillPaidOrder({ orderNo: "SA_test_1", paymentMethod: "ALIPAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_SA_test_1", gatewayAmountCents: 2600 });
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
    seedFixture({ orderId: "SA_b", seats: 3, amount: 3900, channel: "ALIPAY" });
    const [ra, rb] = await Promise.all([
      fulfillPaidOrder({ orderNo: "SA_a", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_SA_a", gatewayAmountCents: 2600 }),
      fulfillPaidOrder({ orderNo: "SA_b", paymentMethod: "ALIPAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_SA_b", gatewayAmountCents: 3900 }),
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
  it("席位写入失败（状态条件更新已执行）→ 同回滚：订单保持 PENDING、席位未增；重试后恰好履约一次", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    // [R0-B1 F2] 席位写入现为条件 updateMany（写边界核验），注入其失败
    failConf = { model: "workspace", method: "updateMany", times: 1 };
    const r1 = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
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
      gatewayTransactionId: "tx_SA_test_1",
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
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r1.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
    expect(store.workspace["w1"].extraSeats).toBe(0);
    const r2 = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r2.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("订单条件更新失败注入 → 可重试错误，无任何写入", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    failConf = { model: "billingrecord", method: "updateMany", times: 1 };
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
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
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    const rootWrites = writeLog.filter((w) => w.startsWith("ROOT"));
    expect(rootWrites).toEqual(["ROOT billingrecord.create"]); // [U04] 唯一认领行
  });
});

// ══════════════ 4. REAL 金额门禁与 MOCK 权限门禁 ══════════════

describe("R0-B 金额与权限门禁", () => {
  it("REAL 缺实付金额 → 拒绝，零权益写入，订单保持 PENDING", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: null,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("REAL 金额与订单不一致 → 拒绝入账", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
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
        gatewayTransactionId: "tx_SA_test_1",
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
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 0,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("缺目标空间（workspaceId 为空）→ 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceId: null });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("目标空间不存在 → 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceMissing: true });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"]).toBeUndefined();
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("空间类型变化（非企业）→ 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceType: "PERSONAL" });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("席位相加溢出 Int 上限 → 拒绝，零写入", async () => {
    seedFixture({ seats: 3, amount: 2600, extraSeats: 2147483646 });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(2147483646);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("套餐到期基准变化（已续费/变更）→ 拒绝并人工核查，不授予错误席位", async () => {
    seedFixture({ seats: 2, amount: 2600, planExpiresMismatch: true });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayAmountCents: 2600,
    });
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("空间套餐到期时间为空 → 拒绝并人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspacePlanExpiresNull: true });
    const r = await fulfillPaidOrder({
      gatewayTransactionId: "tx_SA_test_1",
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
      // [U04] REAL 收款口径修正：底层强制交易号 + 精确金额，不能只给金额。
      orderNo: "RC_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t",
      gatewayTransactionId: "wx_rc_1", gatewayAmountCents: 1000,
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
      // [U04] REAL 收款口径修正：底层强制交易号 + 精确金额。
      orderNo: "UP_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t",
      gatewayTransactionId: "wx_up_1", gatewayAmountCents: 19900,
    });
    expect(r.status).toBe("FULFILLED");
    expect(fulfillEnterpriseUpgradeFromOrder).toHaveBeenCalledWith("UP_1");
    expect(store.billingrecord["UP_1"].status).toBe("SUCCESS");
  });
});

// ══════════════════════════════════════════════════════
// R0-B1 F1: 超时关闭与成功履约竞争同一订单状态
// ══════════════════════════════════════════════════════
describe("R0-B1 F1：超时关闭不覆盖已成功订单", () => {
  const mkFulfill = () =>
    fulfillPaidOrder({ orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_SA_test_1", gatewayAmountCents: 2600 });

  it("共享席位服务：履约已提交后，持有旧 PENDING+过期快照的迟到请求不得覆盖 SUCCESS", async () => {
    const { order } = seedFixture({ seats: 2, amount: 2600 });
    // 先获准的请求在截止前完成履约
    const r1 = await mkFulfill();
    expect(r1.status).toBe("FULFILLED");
    // 迟到请求只持有种子时刻的旧快照（PENDING + 已过截止时间）
    staleBillingRead = {
      row: { ...JSON.parse(JSON.stringify(order)), expiresAt: new Date(Date.now() - 1000) },
      remaining: 1,
    };
    const { fulfillSeatAddonOrder: svc } = await import("@/lib/payment/seat-addon-fulfill");
    const r2 = await svc({ orderNo: "SA_test_1", paymentMode: "REAL", isRealPayment: true, gatewayAmountCents: 2600 });
    expect(r2).toMatchObject({ ok: true, status: "ALREADY_PROCESSED" });
    // 已成功状态与已发权益不被破坏
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("REAL 外层服务（fulfillPaidOrder）：同样的旧读超时竞争 → ALREADY_PROCESSED，SUCCESS 保留", async () => {
    const { order } = seedFixture({ seats: 2, amount: 2600 });
    await mkFulfill();
    staleBillingRead = {
      row: { ...JSON.parse(JSON.stringify(order)), expiresAt: new Date(Date.now() - 1000) },
      remaining: 1,
    };
    const r2 = await mkFulfill();
    expect(r2).toMatchObject({ ok: true, status: "ALREADY_PROCESSED" });
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("MOCK 确认入口：旧读超时竞争 → 已处理响应，SUCCESS 保留", async () => {
    const { order } = seedFixture({ seats: 2, amount: 2600 });
    await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    staleBillingRead = {
      row: { ...JSON.parse(JSON.stringify(order)), expiresAt: new Date(Date.now() - 1000) },
      remaining: 1,
    };
    const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyProcessed).toBe(true);
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("正常超时关闭先胜出（确实过期的 PENDING）：已验收款 → 留证 + 条件关单；重放幂等且零席位", async () => {
    seedFixture({ seats: 2, amount: 2600, expired: true });
    // [U04/原5] 已超时但收到已验收款：持久收款事实 + 条件关单（不发放、不丢钱）
    const r1 = await mkFulfill();
    expect(r1.ok).toBe(true);
    expect(r1.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED"); // 已条件关单
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].metadata.pendingReceipt).toBeTruthy();
    // 重放（含旧读）：同笔交易幂等 ACK，不重复发放、不覆盖终态
    staleBillingRead = { row: JSON.parse(JSON.stringify(store.billingrecord["SA_test_1"])), remaining: 1 };
    const r2 = await mkFulfill();
    expect(r2.ok).toBe(true);
    expect(r2.status).toBe("RECEIPT_PENDING_RECOVERY");
    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("MOCK 正常超时 → 409 + EXPIRED 落库；不吞状态写失败", async () => {
    seedFixture({ seats: 2, amount: 2600, expired: true });
    const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(res.status).toBe(409);
    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");
  });
});

// ══════════════════════════════════════════════════════
// R0-B1 F2: 写边界核验空间可写状态、企业类型与下单报价基准
// ══════════════════════════════════════════════════════
describe("R0-B1 F2：空间/报价基准校验", () => {
  const mkFulfill = (orderNo = "SA_test_1") =>
    fulfillPaidOrder({ orderNo, paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_x", gatewayAmountCents: 2600 });

  it.each(["ARCHIVED", "DISABLED"])("归档/停用空间（status=%s）→ 拒绝，零席位、订单不落 SUCCESS", async (st) => {
    seedFixture({ seats: 2, amount: 2600, workspaceStatus: st });
    const r = await mkFulfill();
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("检查后到写入前类型变化（事务内重读触发）→ 拒绝且订单状态与席位同回滚", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    // 第 2 次 workspace 读取 = 事务内重读；此时空间被改为 PERSONAL（模拟检查后变化）
    onNthWorkspaceRead = {
      n: 2,
      count: 0,
      fn: () => {
        store.workspace["w1"].type = "PERSONAL";
      },
    };
    const r = await mkFulfill();
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING"); // 履约权回滚，无"成功订单无权益"
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBeUndefined();
  });

  it("写入边界条件核验：套餐 plan 在检查后变化 → 条件更新 count=0，整体回滚", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    // 事务内重读（第 2 次）后、席位条件写入时 plan 已变（条件的 plan 不匹配 → count=0）
    onNthWorkspaceRead = {
      n: 2,
      count: 0,
      fn: () => {
        store.workspace["w1"].plan = "ENTERPRISE";
      },
    };
    const r = await mkFulfill();
    expect(r.ok).toBe(false);
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it.each([
    ["缺 planKey", { omitPlanKey: true }],
    ["planKey 与当前套餐不一致", { workspacePlan: "ENTERPRISE" }],
    ["缺 billingCycle", { omitBillingCycle: true }],
    ["billingCycle 与当前不一致", { workspaceCycle: "YEAR" }],
    ["缺 expiresAt 基准", { omitExpiresAt: true }],
    ["到期基准与当前不一致", { planExpiresMismatch: true }],
  ])("报价事实 %s → 明确拒绝列人工核查，不默认当前配置补齐", async (_label, opt) => {
    seedFixture({ seats: 2, amount: 2600, ...opt });
    const r = await mkFulfill();
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain("人工核查");
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("同一空间两个订单并发且接近 Int 上限：第一笔成功，第二笔事务内重读溢出拒绝", async () => {
    const MAXI = 2147483647;
    seedFixture({ orderId: "SA_a", seats: 2, amount: 2600, extraSeats: MAXI - 3 });
    seedFixture({ orderId: "SA_b", seats: 2, amount: 2600, extraSeats: MAXI - 3 });
    const [ra, rb] = await Promise.all([mkFulfill("SA_a"), mkFulfill("SA_b")]);
    const fulfilled = [ra, rb].filter((x) => x.status === "FULFILLED");
    expect(fulfilled.length).toBe(1);
    expect(store.workspace["w1"].extraSeats).toBe(MAXI - 1); // 只加了合法的一笔
    const statuses = [store.billingrecord["SA_a"].status, store.billingrecord["SA_b"].status];
    expect(statuses.filter((s) => s === "SUCCESS").length).toBe(1);
    expect(statuses.filter((s) => s === "PENDING").length).toBe(1); // 被拒订单保留原状
  });
});

// ══════════════════════════════════════════════════════
// R0-B1 F3: 真实微信席位订单的二维码载体（下单→保存→本人查询）
// ══════════════════════════════════════════════════════
describe("R0-B1 F3：微信扫码载体链路", () => {
  function seedOrderContext() {
    store.workspace["w1"] = {
      id: "w1", name: "企业空间", type: "ENTERPRISE", status: "ACTIVE", ownerId: "u1", extraSeats: 0,
      plan: "PRO", planBillingCycle: "MONTH", planExpiresAt: PLAN_EXPIRES_BASE,
    };
    store.workspaceplan["PRO"] = { key: "PRO", priceMonthly: 2600, maxMembers: 5 };
  }

  it("真实微信下单：网关 codeUrl 被服务端保存，本人订单查询可读取", async () => {
    seedOrderContext();
    paymentMode = "REAL";
    createCharge.mockResolvedValue({
      mode: "REAL",
      channel: "WECHAT_PAY",
      payUrl: "/user/pay/qr?orderNo=X",
      gatewayPayload: { codeUrl: "weixin://wxpay/bizpayurl?pr=abc123" }, // 符合实际网关返回类型的 IO 夹具
    });
    const req = new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
    });
    const res = await seatAddonPOST(req);
    expect(res.status).toBe(200);
    const created = await res.json();
    const order = store.billingrecord[created.orderNo];
    expect(order.metadata.codeUrl).toBe("weixin://wxpay/bizpayurl?pr=abc123"); // 只保存载体本身
    expect(order.metadata.gatewayPayload).toBeUndefined(); // 不保存整个网关 payload
    expect(order.status).toBe("PENDING");
    // 本人订单查询（真实 GET 路由）
    const qres = await orderGET(
      new NextRequest(`http://localhost/api/payments/order?orderNo=${created.orderNo}`, {
        headers: { authorization: "Bearer test" },
      }),
    );
    expect(qres.status).toBe(200);
    const qdata = await qres.json();
    expect(qdata.data.codeUrl).toBe("weixin://wxpay/bizpayurl?pr=abc123");
    expect(qdata.data.type).toBe("SEAT_ADDON");
    // 载体保存走条件更新（仅 PENDING），不覆盖履约记录
    expect(writeLog).toContain("ROOT billingrecord.updateMany");
  });

  it("本人订单查询：他人订单 → 403，不暴露支付载体", async () => {
    seedOrderContext();
    paymentMode = "REAL";
    createCharge.mockResolvedValue({
      mode: "REAL", channel: "WECHAT_PAY", payUrl: "/user/pay/qr?orderNo=X",
      gatewayPayload: { codeUrl: "weixin://wxpay/x" },
    });
    const req = new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
    });
    const created = await (await seatAddonPOST(req)).json();
    authBehavior = { valid: true, user: { id: "attacker", role: "USER" } };
    const qres = await orderGET(
      new NextRequest(`http://localhost/api/payments/order?orderNo=${created.orderNo}`, {
        headers: { authorization: "Bearer test" },
      }),
    );
    expect(qres.status).toBe(403);
  });

  it("MOCK / 支付宝分支：无载体保存，原有契约保持", async () => {
    seedOrderContext();
    // MOCK：payUrl 为本地模拟页，无 gatewayPayload
    const res1 = await seatAddonPOST(new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
    }));
    expect(res1.status).toBe(200);
    const d1 = await res1.json();
    expect(store.billingrecord[d1.orderNo].metadata.codeUrl).toBeUndefined();
    expect(d1.payUrl).toContain("/user/pay/mock");
    // 支付宝 REAL：跳转 URL，无 codeUrl
    paymentMode = "REAL";
    createCharge.mockResolvedValue({ mode: "REAL", channel: "ALIPAY", payUrl: "https://openapi.alipay.com/gateway?x=1", gatewayPayload: null });
    const res2 = await seatAddonPOST(new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "ALIPAY" }),
    }));
    expect(res2.status).toBe(200);
    const d2 = await res2.json();
    expect(store.billingrecord[d2.orderNo].metadata.codeUrl).toBeUndefined();
  });

  it("真实微信但网关未返回载体 → 502 明确错误，订单保留 PENDING，不伪装可付款", async () => {
    seedOrderContext();
    paymentMode = "REAL";
    createCharge.mockResolvedValue({ mode: "REAL", channel: "WECHAT_PAY", payUrl: "/user/pay/qr?orderNo=X", gatewayPayload: {} });
    const res = await seatAddonPOST(new NextRequest("http://localhost/api/workspace/seat-addon", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
    }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("未能准备收银台");
    const order = Object.values(store.billingrecord)[0] as any;
    expect(order.status).toBe("PENDING"); // 订单证据保留供重试/人工核查
  });
});

// ══════════════════════════════════════════════════════
// R0-B1 F4: 收银台展示契约（实际生产模块 + 页面接线源码核验）
// ══════════════════════════════════════════════════════
describe("R0-B1 F4：收银台状态/商品类型展示", () => {
  it("状态视图：仅 SUCCESS 完成；EXPIRED/FAILED/REFUNDED/未知分别呈现", () => {
    expect(resolveCashierStatusView("SUCCESS").isCompleted).toBe(true);
    expect(resolveCashierStatusView("SUCCESS").statusLabel).toBe("已支付并入账");
    for (const [st, kw] of [
      ["EXPIRED", "超时"],
      ["FAILED", "失败"],
      ["REFUNDED", "退款"],
    ] as const) {
      const v = resolveCashierStatusView(st);
      expect(v.isCompleted).toBe(false);
      expect(v.resultMessage).toContain(kw);
      expect(v.tone).not.toBe("success");
    }
    const unk = resolveCashierStatusView("SOMETHING_ELSE");
    expect(unk.isCompleted).toBe(false);
    expect(unk.resultMessage).toContain("请勿重复支付");
    expect(resolveCashierStatusView(null).kind).toBe("unknown");
    expect(resolveCashierStatusView("PENDING").kind).toBe("pending");
  });

  it("商品类型视图：席位成功不出现算力到账/点数流水；充值/套餐/未知各自正确", () => {
    const seat = resolveCashierSuccessView("SEAT_ADDON", 3);
    expect(seat.message).toContain("3 个席位");
    expect(seat.message).not.toContain("算力");
    expect(seat.entries.some((e) => e.href === "/user/points")).toBe(false);
    const recharge = resolveCashierSuccessView("TOKEN_RECHARGE");
    expect(recharge.message).toContain("算力已到账");
    expect(recharge.entries.some((e) => e.href === "/user/points")).toBe(true);
    const upgrade = resolveCashierSuccessView("PLAN_UPGRADE");
    expect(upgrade.message).toContain("企业空间");
    const unknownType = resolveCashierSuccessView("MYSTERY_TYPE");
    expect(unknownType.message).toBe("支付成功");
  });

  it("isQrReady：仅 PENDING 且有载体可展示；缺载体明确不可用", () => {
    expect(isQrReady({ status: "PENDING", codeUrl: "weixin://x" })).toBe(true);
    expect(isQrReady({ status: "PENDING", codeUrl: null })).toBe(false);
    expect(isQrReady({ status: "SUCCESS", codeUrl: "weixin://x" })).toBe(false);
  });

  it("页面接线核验（源码级）：两个收银台页面均导入共享契约，旧错误模式已移除", async () => {
    const fs = await import("node:fs");
    const mockSrc = fs.readFileSync("src/app/user/pay/mock/page.tsx", "utf-8");
    const qrSrc = fs.readFileSync("src/app/user/pay/qr/page.tsx", "utf-8");
    // 两页都使用实际生产契约模块
    expect(mockSrc).toContain("payment-cashier-display");
    expect(qrSrc).toContain("payment-cashier-display");
    // 旧缺陷不再存在：非 PENDING 一律成功文案；无条件算力到账
    expect(mockSrc).not.toContain('status !== "PENDING") setResult("该订单已完成支付并入账")');
    expect(qrSrc).not.toContain("支付成功，算力已到账");
    expect(qrSrc).toContain("resolveCashierSuccessView(order.type");
    // 缺二维码不再无限加载（ spinner 分支已替换为明确报错出口）
    expect(qrSrc).toContain("未能获取支付二维码");
  });
});

// ══════════════════════════════════════════════════════
// R0-B1: 真实 notify 路由 ACK（验签 IO stub；模拟验签结果非实际交易）
// ══════════════════════════════════════════════════════
describe("R0-B1 notify 路由 ACK 契约", () => {
  function seedSeatForNotify(channel = "WECHAT_PAY") {
    // [U04] 支付宝回调必须用 ALIPAY 渠道订单，避免用微信订单接支付宝收款。
    seedFixture({ seats: 2, amount: 2600, channel });
    return "SA_test_1";
  }

  it("微信：验签失败 → 401 FAIL，零写入（未验签不发权益）", async () => {
    seedSeatForNotify();
    wxVerifyNotify.mockResolvedValue({ ok: false, error: "签名不匹配" });
    const res = await wxNotifyPOST(new NextRequest("http://localhost/api/payments/notify/wechat", {
      method: "POST", body: "x",
    }));
    expect(res.status).toBe(401);
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("微信：验签通过 + SUCCESS → 入账一次并返回规范成功 ACK", async () => {
    const orderNo = seedSeatForNotify();
    wxVerifyNotify.mockResolvedValue({
      ok: true,
      resource: { out_trade_no: orderNo, trade_state: "SUCCESS", transaction_id: "wx_1", amount: { total: 2600 } },
    });
    const res = await wxNotifyPOST(new NextRequest("http://localhost/api/payments/notify/wechat", {
      method: "POST", body: "x",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("SUCCESS");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("微信：重复通知（已 SUCCESS）→ 仍返回成功 ACK，零重复入账", async () => {
    const orderNo = seedSeatForNotify();
    wxVerifyNotify.mockResolvedValue({
      ok: true,
      resource: { out_trade_no: orderNo, trade_state: "SUCCESS", transaction_id: "wx_1", amount: { total: 2600 } },
    });
    await wxNotifyPOST(new NextRequest("http://localhost/api/payments/notify/wechat", { method: "POST", body: "x" }));
    const res2 = await wxNotifyPOST(new NextRequest("http://localhost/api/payments/notify/wechat", { method: "POST", body: "x" }));
    expect(res2.status).toBe(200);
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("微信：履约拒绝（金额不符）→ 500 FAIL（渠道将重试），不假成功吞掉未履约订单", async () => {
    const orderNo = seedSeatForNotify();
    wxVerifyNotify.mockResolvedValue({
      ok: true,
      resource: { out_trade_no: orderNo, trade_state: "SUCCESS", transaction_id: "wx_1", amount: { total: 1 } },
    });
    const res = await wxNotifyPOST(new NextRequest("http://localhost/api/payments/notify/wechat", { method: "POST", body: "x" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("FAIL");
    expect(store.workspace["w1"].extraSeats).toBe(0);
  });

  it("支付宝：TRADE_SUCCESS → 入账 + 纯文本 success；拒绝 → fail 500", async () => {
    const orderNo = seedSeatForNotify("ALIPAY");
    aliVerifyNotify.mockResolvedValue({ ok: true, outTradeNo: orderNo, tradeStatus: "TRADE_SUCCESS", totalAmount: "26.00", tradeNo: "ali_1", appId: "fixture-app" });
    const res = await aliNotifyPOST(new NextRequest("http://localhost/api/payments/notify/alipay", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1",
    }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("success");
    expect(store.workspace["w1"].extraSeats).toBe(2);
    // 拒绝路径：损坏订单（席位数无效）
    seedFixture({ orderId: "SA_bad", seats: 0, amount: 2600, channel: "ALIPAY" });
    aliVerifyNotify.mockResolvedValue({ ok: true, outTradeNo: "SA_bad", tradeStatus: "TRADE_SUCCESS", totalAmount: "26.00", tradeNo: "ali_bad", appId: "fixture-app" });
    const res2 = await aliNotifyPOST(new NextRequest("http://localhost/api/payments/notify/alipay", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1",
    }));
    expect(res2.status).toBe(500);
    expect(await res2.text()).toBe("fail");
    expect(store.billingrecord["SA_bad"].status).toBe("PENDING");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// R0-B2 同批补修：B2-1 时间裁决边界 / B2-2 周期规则 / B2-3 收银台完成状态
// ════════════════════════════════════════════════════════════════════════════

describe("R0-B2-1：时间裁决边界（预检通过后、事务/取锁后才跨过期限）", () => {
  it("支付截止在预检通过、进入事务前跨过 → 不履约；订单诚实转 EXPIRED，席位零变化", async () => {
    // 用确定性的假时钟：预检时未过期（expiresAt 在基准后 500ms），事务入口推进 2s 后裁决
    vi.useFakeTimers();
    const base = new Date("2026-11-06T08:00:00.000Z");
    vi.setSystemTime(base);
    txClockAdvanceMs = 2000;
    try {
      seedFixture({ seats: 2, amount: 2600, expiresOffsetMs: 500 });
      const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expect(r.ok === false && r.error).toContain("超时");
      expect(store.workspace["w1"].extraSeats).toBe(0); // 零席位变化
      expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED"); // 诚实过期，不覆盖成功
    } finally {
      txClockAdvanceMs = 0;
      vi.useRealTimers();
    }
  });

  it("套餐在预检通过、写边界前到期 → 不履约；订单回滚保留 PENDING，席位零变化", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-11-06T08:00:00.000Z");
    vi.setSystemTime(base);
    txClockAdvanceMs = 2000;
    try {
      // 空间到期与席位有效期均为基准后 500ms（一致）；预检未过期，事务入口推进 2s 后写边界拒绝
      seedFixture({ seats: 2, amount: 2600, planExpiresOffsetMs: 500 });
      const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expect(store.workspace["w1"].extraSeats).toBe(0); // 零席位变化
      expect(store.billingrecord["SA_test_1"].status).toBe("PENDING"); // 回滚保留，不落 SUCCESS
    } finally {
      txClockAdvanceMs = 0;
      vi.useRealTimers();
    }
  });

  it("正常窗口内（截止与套餐均有效）→ 履约一次，席位 +2，状态 SUCCESS", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
  });

  it("时间边界与 helper 一致：expiresAt 恰好等于裁决时刻不算过期（gte 而非 gt）", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-11-06T08:00:00.000Z");
    vi.setSystemTime(t0);
    try {
      seedFixture({ seats: 2, amount: 2600 });
      // 让支付截止 == now，且事务内不推进时钟：isOrderExpired 用 now > expiresAt → false
      store.billingrecord["SA_test_1"].expiresAt = new Date(t0);
      const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
      expect(r.ok).toBe(true);
      expect(r.status).toBe("FULFILLED");
      expect(store.workspace["w1"].extraSeats).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("历史订单 expiresAt 为 null（无支付截止）→ 按 helper 原语义不过期，不被新条件静默拒绝", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    store.billingrecord["SA_test_1"].expiresAt = null;
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("REAL 外层服务（fulfillPaidOrder）：同样跨期限 → 拒绝，零席位，诚实过期", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T08:00:00.000Z"));
    txClockAdvanceMs = 2000;
    try {
      seedFixture({ seats: 2, amount: 2600, expiresOffsetMs: 500 });
      const r = await fulfillPaidOrder({
        orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL",
        gatewayTransactionId: "tx_SA_test_1",
        remark: "t", gatewayAmountCents: 2600,
      });
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expect(r.ok === false && r.error).toContain("超时");
      expect(store.workspace["w1"].extraSeats).toBe(0);
      expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");
    } finally {
      txClockAdvanceMs = 0;
      vi.useRealTimers();
    }
  });

  it("MOCK 确认路由（真实 POST）：同样跨期限 → 409 明确错误，零席位，订单不伪装成功", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T08:00:00.000Z"));
    txClockAdvanceMs = 2000;
    try {
      seedFixture({ seats: 2, amount: 2600, expiresOffsetMs: 500 });
      const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).not.toBe(true);
      expect(store.workspace["w1"].extraSeats).toBe(0);
      expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");
    } finally {
      txClockAdvanceMs = 0;
      vi.useRealTimers();
    }
  });

  it("已合法裁决完成的事务：提交后时间跨界或后续迟到请求不得把 SUCCESS 反转成 EXPIRED", async () => {
    // 先在有效窗口内完成真实履约
    seedFixture({ seats: 2, amount: 2600 });
    const r1 = await fulfillPaidOrder({
      orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL",
      gatewayTransactionId: "tx_SA_test_1",
      remark: "t", gatewayAmountCents: 2600,
    });
    expect(r1.ok).toBe(true);
    expect(store.workspace["w1"].extraSeats).toBe(2);

    // 迟到请求持有过期旧读 + 推进后的时钟，仍须按最新 SUCCESS 分类，不覆盖、不多发
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T08:00:00.000Z"));
    txClockAdvanceMs = 2000;
    staleBillingRead = {
      row: { ...JSON.parse(JSON.stringify(store.billingrecord["SA_test_1"])), status: "PENDING", expiresAt: new Date(Date.now() - 1000) },
      remaining: 1,
    };
    try {
      const r2 = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
      expect(r2).toMatchObject({ ok: true, status: "ALREADY_PROCESSED" });
      expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
      expect(store.workspace["w1"].extraSeats).toBe(2);
    } finally {
      staleBillingRead = null;
      txClockAdvanceMs = 0;
      vi.useRealTimers();
    }
  });
});

describe("R0-B2-2：下单与履约周期规则（仅接受真实空间配置 MONTH/YEAR）", () => {
  // 只 seed 空间与套餐配置，不预置任何订单，便于断言"零新订单"
  function seedWorkspaceOnly(cycle: any) {
    store.workspace["w1"] = {
      id: "w1", name: "企业空间", type: "ENTERPRISE", status: "ACTIVE", ownerId: "u1", extraSeats: 0,
      plan: "PRO", planBillingCycle: cycle, planExpiresAt: PLAN_EXPIRES_BASE,
    };
    store.workspaceplan["PRO"] = { key: "PRO", priceMonthly: 2600, maxMembers: 5 };
  }
  const addonReq = () => new NextRequest("http://localhost/api/workspace/seat-addon", {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: "w1", seats: 2, paymentMethod: "WECHAT_PAY" }),
  });

  it("空间 planBillingCycle 为 null → 创建订单被拒(400)，零订单、零网关调用", async () => {
    seedWorkspaceOnly(null); // 模拟损坏/缺失配置
    const res = await seatAddonPOST(addonReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("计费周期不合规");
    expect(createCharge).not.toHaveBeenCalled(); // 拒绝在调用网关之前
    expect(Object.keys(store.billingrecord).length).toBe(0); // 零新订单
  });

  it("空间 planBillingCycle 为空串 / WEEK → 创建订单被拒(400)，零订单、零网关调用", async () => {
    for (const cycle of ["", "WEEK", "week", "QUARTER"]) {
      store.billingrecord = {};
      createCharge.mockClear();
      seedWorkspaceOnly(cycle);
      const res = await seatAddonPOST(addonReq());
      expect(res.status).toBe(400);
      expect(createCharge).not.toHaveBeenCalled();
      expect(Object.keys(store.billingrecord).length).toBe(0);
    }
  });

  it("履约端独立拒绝非法周期（WEEK）订单 → REJECTED，零席位变化", async () => {
    // 模拟历史损坏订单：metadata.billingCycle=WEEK
    seedFixture({ seats: 2, amount: 2600 });
    (store.billingrecord["SA_test_1"].metadata as any).billingCycle = "WEEK";
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("REJECTED");
    expect(r.ok === false && r.error).toContain("计费周期非法");
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING");
  });

  it("历史损坏订单：订单与空间同为 WEEK 也不能因『一致』而通过，仍拒绝并列人工核查", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceCycle: "WEEK" });
    (store.billingrecord["SA_test_1"].metadata as any).billingCycle = "WEEK";
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("REJECTED");
    expect(r.ok === false && r.error).toContain("计费周期非法");
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe("PENDING"); // 不改历史数据，保留供人工核查
  });

  it("MONTH / YEAR 真实组合：下单→网关载体 stub→本人 GET→履约一次，载体保留、定价不改", async () => {
    for (const cycle of ["MONTH", "YEAR"]) {
      store.billingrecord = {};
      store.workspaceplan = {};
      createCharge.mockClear();
      paymentMode = "REAL";
      createCharge.mockResolvedValue({
        mode: "REAL", channel: "WECHAT_PAY", payUrl: "/user/pay/qr?orderNo=X",
        gatewayPayload: { codeUrl: `weixin://isolated-fixture-${cycle}` },
      });
      seedWorkspaceOnly(cycle);
      const created = await seatAddonPOST(addonReq());
      expect(created.status).toBe(200);
      const { orderNo, amountCents } = await created.json();
      expect(amountCents).toBeGreaterThan(0); // 价格公式未改动，仍有合法报价
      expect(store.billingrecord[orderNo].metadata.billingCycle).toBe(cycle);
      expect(createCharge).toHaveBeenCalledTimes(1);

      // 本人订单查询：二维码载体保留、周期、金额可读
      const q = await orderGET(new NextRequest(`http://localhost/api/payments/order?orderNo=${orderNo}`));
      expect(q.status).toBe(200);
      const qd = await q.json();
      expect(qd.data.codeUrl).toBe(`weixin://isolated-fixture-${cycle}`);
      expect(qd.data.status).toBe("PENDING");

      // 真实履约服务：一次发放，无重复
      const r = await fulfillSeatAddonOrder({ orderNo, paymentMode: "REAL", isRealPayment: true, gatewayAmountCents: amountCents });
      expect(r.ok).toBe(true);
      expect(r.status).toBe("FULFILLED");
      expect(store.workspace["w1"].extraSeats).toBe(2);
      expect(store.billingrecord[orderNo].status).toBe("SUCCESS");
    }
  });

  it("合法 MONTH 周期组合 → 履约一次，席位 +2", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceCycle: "MONTH" });
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  it("合法 YEAR 周期组合 → 履约一次，席位 +2（按 365 天折算）", async () => {
    seedFixture({ seats: 2, amount: 2600, workspaceCycle: "YEAR" });
    // 真实下单时订单 metadata.billingCycle 来自空间真实配置；同步为 YEAR 才是合法组合
    (store.billingrecord["SA_test_1"].metadata as any).billingCycle = "YEAR";
    const r = await fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });
});

describe("R0-B2-3：模拟收银台完成状态（真实 mock/confirm 路由 + 页面共用展示契约）", () => {
  const getReq = (orderNo: string) =>
    new NextRequest(`http://localhost/api/payments/mock/confirm?orderNo=${encodeURIComponent(orderNo)}`);

  it("完成判定：SUCCESS → 完成且按商品类型给入口；EXPIRED/FAILED/REFUNDED/未知 → 非完成", () => {
    const seatDone = resolveCashierCompletion("SEAT_ADDON", 3, "SUCCESS");
    expect(seatDone.completed).toBe(true);
    expect(seatDone.message).toContain("3 个席位");
    expect(seatDone.entries.some((e) => e.href === "/workspace-hub")).toBe(true);
    expect(seatDone.entries.some((e) => e.href === "/user/points")).toBe(false); // 席位成功不引导点数流水

    const rechargeDone = resolveCashierCompletion("TOKEN_RECHARGE", 0, "SUCCESS");
    expect(rechargeDone.completed).toBe(true);
    expect(rechargeDone.entries.some((e) => e.href === "/user/points")).toBe(true);

    for (const st of ["EXPIRED", "FAILED", "REFUNDED", "SOMETHING_ELSE", null] as const) {
      expect(resolveCashierCompletion("SEAT_ADDON", 2, st as any).completed).toBe(false);
    }
  });

  it("直接打开/刷新已成功席位订单（GET）→ 恢复商品对应的完成结果与空间入口，非完成态如实呈现", async () => {
    // 直接打开：先真实 POST 完成一次，再由 GET 刷新（页面加载时走的真实路由）
    seedFixture({ seats: 3, amount: 3900 });
    const first = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(first.status).toBe(200);
    expect(isConfirmedSuccessResponse(await first.json())).toBe(true);

    // 刷新：GET 返回 SUCCESS 订单，页面调用者用它决定完成分支
    const res = await mockConfirmGET(getReq("SA_test_1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("SUCCESS");
    expect(body.data.type).toBe("SEAT_ADDON");
    expect(body.data.seats).toBe(3);

    const completion = resolveCashierCompletion(body.data.type, body.data.seats, body.data.status);
    expect(completion.completed).toBe(true);
    expect(completion.message).toContain("3 个席位");
    expect(completion.message).not.toContain("算力已到账"); // 席位不泛称算力到账
    expect(completion.entries.some((e) => e.href === "/workspace-hub")).toBe(true);
    expect(completion.entries.some((e) => e.href === "/user/points")).toBe(false);

    // 失败/过期/退款/未知状态：如实呈现为未完成，入口不伪装成功
    for (const [st, kw] of [["EXPIRED", "超时"], ["FAILED", "失败"], ["REFUNDED", "退款"], ["SOMETHING_ELSE", "未知"]] as const) {
      store.billingrecord["SA_test_1"].status = st;
      const r = await mockConfirmGET(getReq("SA_test_1"));
      const d = await r.json();
      const v = resolveCashierStatusView(d.data.status);
      expect(v.isCompleted).toBe(false);
      expect(v.resultMessage).toContain(kw);
      expect(resolveCashierCompletion(d.data.type, d.data.seats, d.data.status).completed).toBe(false);
    }
  });

  it("正常确认成功 + 重复确认成功 → 都带真实完成证据；重复确认零重复入账", async () => {
    seedFixture({ seats: 2, amount: 2600 });
    const r1 = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    expect(isConfirmedSuccessResponse(d1)).toBe(true);
    expect(d1.alreadyProcessed).toBe(false);
    expect(d1.seats).toBe(2);
    expect(store.workspace["w1"].extraSeats).toBe(2);

    // 重复确认：业务仍为已完成（不能因中性提示被判成"未完成"）
    const r2 = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
    expect(r2.status).toBe(200);
    const d2 = await r2.json();
    expect(d2.success).toBe(true);
    expect(d2.alreadyProcessed).toBe(true);
    expect(d2.message).toContain("未重复扣款");
    expect(isConfirmedSuccessResponse(d2)).toBe(true); // 完成证据成立 → 页面进入完成分支
    expect(resolveCashierCompletion("SEAT_ADDON", d2.seats, "SUCCESS").completed).toBe(true);
    expect(store.workspace["w1"].extraSeats).toBe(2); // 零重复入账
  });

  it("不把任意 HTTP 2xx 当作业务成功：success:false / 缺完成证据 / 空响应均不伪装完成", () => {
    expect(isConfirmedSuccessResponse({ success: false, seats: 2 })).toBe(false);
    expect(isConfirmedSuccessResponse({ success: true })).toBe(false); // 无任何完成证据
    expect(isConfirmedSuccessResponse({ success: true, message: "ok" })).toBe(false);
    expect(isConfirmedSuccessResponse({ success: true, workspaceId: "" })).toBe(false);
    expect(isConfirmedSuccessResponse(null)).toBe(false);
    // 真实契约里的完成证据（首次成功 / 重复已处理 / 充值点数 / 升级空间）
    expect(isConfirmedSuccessResponse({ success: true, seats: 2 })).toBe(true);
    expect(isConfirmedSuccessResponse({ success: true, alreadyProcessed: true, seats: 2 })).toBe(true);
    expect(isConfirmedSuccessResponse({ success: true, points: 100 })).toBe(true);
    expect(isConfirmedSuccessResponse({ success: true, workspaceId: "ws-ent-x" })).toBe(true);
  });

  it("页面接线：mock 页面已改用共享完成判定，完成分支不再依赖 result.tone", async () => {
    const fs = await import("node:fs");
    const mockSrc = fs.readFileSync("src/app/user/pay/mock/page.tsx", "utf-8");
    expect(mockSrc).toContain("resolveCashierCompletion");
    expect(mockSrc).toContain("isConfirmedSuccessResponse");
    // 完成分支改为由 completed 决定（不再用 result.tone === "success" 决定是否展示入口）
    expect(mockSrc).not.toContain("result.tone === \"success\" ? (");
    // 切换订单时清空上一单残留结果
    expect(mockSrc).toContain("setResult(null)");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// R0-B3 / B2-1 剩余阻断项：事务「内部」异步数据库等待后，必须用等待后的时间作最终授权
// T01—T08 固定矩阵。时钟推进放在 await 的 IO 内部，而非回调入口；断言为正确业务结果，
// 先在 B3 开始前原始副本上复现失败，再在同一组断言上验证修复。
// ════════════════════════════════════════════════════════════════════════════
describe("R0-B3 T01—T08：最终授权时刻在两把行锁到手、必要等待结束之后", () => {
  const BASE = "2026-11-06T08:00:00.000Z";
  const enterFakeClock = () => { vi.useFakeTimers(); vi.setSystemTime(new Date(BASE)); };
  const leaveFakeClock = () => {
    dbWaitPlan = []; dbCallSeq = {}; dbEventLog = []; commitAdvanceMs = 0; txClockAdvanceMs = 0;
    vi.useRealTimers();
  };
  // 订单/套餐在基准后 500ms 到期；推进 2s 即跨过期限
  const nearOrder = () => seedFixture({ seats: 2, amount: 2600, expiresOffsetMs: 500 });
  const nearPlan = () => seedFixture({ seats: 2, amount: 2600, planExpiresOffsetMs: 500 });
  const wait = (model: string, method: string, nth = 1, advanceMs = 2000): void => {
    dbWaitPlan.push({ kind: "TX", model, method, nth, advanceMs });
  };
  const expectNoRights = (orderStatus: string) => {
    expect(store.workspace["w1"].extraSeats).toBe(0);
    expect(store.billingrecord["SA_test_1"].status).toBe(orderStatus);
    expect(store.billingrecord["SA_test_1"].metadata.seatsAdded).toBeUndefined(); // 临时写已回滚
  };
  const shared = () => fulfillSeatAddonOrder({ orderNo: "SA_test_1", paymentMode: "MOCK", isRealPayment: false, gatewayAmountCents: null });
  const real = () => fulfillPaidOrder({ orderNo: "SA_test_1", paymentMethod: "WECHAT_PAY", paymentMode: "REAL", remark: "t", gatewayTransactionId: "tx_SA_test_1", gatewayAmountCents: 2600 });

  // T01：预检有效，进入事务回调「前」等待跨期（B2 已有效的保护，必须保留）
  it("T01 回调前等待跨订单/套餐期限 → 拒绝、零权益、不覆盖成功", async () => {
    enterFakeClock();
    txClockAdvanceMs = 2000;
    try {
      nearOrder();
      const r = await shared();
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expectNoRights("EXPIRED");
    } finally { leaveFakeClock(); }
  });

  // T02：now 已采样后，第一条订单条件写「内部」等待，裁决前跨订单期限；三入口均覆盖
  it("T02 订单写内部等待跨订单期限 → 共享/REAL/MOCK 三入口均拒绝，零权益", async () => {
    for (const entry of ["shared", "real", "mock"] as const) {
      enterFakeClock();
      try {
        nearOrder();
        wait("billingrecord", "updateMany");
        if (entry === "shared") {
          const r = await shared();
          expect(r.ok).toBe(false);
          expect(r.status).toBe("REJECTED");
        } else if (entry === "real") {
          const r = await real();
          expect(r.ok).toBe(false);
          expect(r.status).toBe("REJECTED");
        } else {
          const res = await mockConfirmPOST(mockConfirmReq("SA_test_1"));
          expect(res.status).toBe(409); // 业务拒绝，不是 2xx 成功
        }
        expect(dbEventLog).toContain("WAIT@TX:billingrecord.updateMany#1+2000ms"); // 推进确实在订单写内部
        expectNoRights("EXPIRED");
      } finally { leaveFakeClock(); }
      // 各入口之间重置夹具状态
      store.billingrecord = {}; store.workspace = {}; store.workspaceplan = {};
      dbCallSeq = {}; dbEventLog = []; writeLog = [];
    }
  });

  // T03：订单写等待期间跨「套餐」期限 → 最终授权拒绝，订单与席位全部回滚
  it("T03 订单写等待期间跨套餐期限 → 拒绝，订单 PENDING、席位与 metadata 全回滚", async () => {
    enterFakeClock();
    try {
      nearPlan();
      wait("billingrecord", "updateMany");
      const r = await shared();
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expectNoRights("PENDING");
      expect(writeLog).toContain("TX workspace.updateMany"); // 两把锁都尝试过，失败后同事务回滚
    } finally { leaveFakeClock(); }
  });

  // T04：事务内空间读取（取空间锁前的等待）期间跨套餐期限
  it("T04 事务内空间读取等待期间跨套餐期限 → 拒绝，不依赖等待前的旧时间", async () => {
    enterFakeClock();
    try {
      nearPlan();
      // 夹具按 kind:model.method 分别计数：TX 的第一次空间读即事务内一致性读
      wait("workspace", "findUnique", 1);
      const r = await shared();
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expect(dbEventLog).toContain("WAIT@TX:workspace.findUnique#1+2000ms");
      expectNoRights("PENDING");
    } finally { leaveFakeClock(); }
  });

  // T05：最终空间条件写「内部」等待期间跨套餐期限（证明空间行锁取得后的路径）
  it("T05 空间条件写内部等待跨套餐期限 → 拒绝，全回滚", async () => {
    enterFakeClock();
    try {
      nearPlan();
      wait("workspace", "updateMany");
      const r = await shared();
      expect(r.ok).toBe(false);
      expect(r.status).toBe("REJECTED");
      expect(dbEventLog).toContain("WAIT@TX:workspace.updateMany#1+2000ms");
      // 真实执行顺序：两次条件 UPDATE 都发生（两把行锁都取得），最终授权在两者之后才拒绝
      expect(writeLog).toEqual([
        "TX billingrecord.updateMany",
        "TX workspace.updateMany",
      ]);
      expectNoRights("PENDING");
    } finally { leaveFakeClock(); }
  });

  // T06：最终授权通过后「提交阶段」才跨期 → 不反转成功；迟到旧过期请求不覆盖 SUCCESS
  it("T06 授权后提交阶段跨界 → 合法完成一次；迟到旧过期快照不覆盖 SUCCESS", async () => {
    enterFakeClock();
    try {
      nearOrder();
      commitAdvanceMs = 2000; // 回调已返回、提交阶段才推进时钟
      const r = await shared();
      expect(r.ok).toBe(true);
      expect(r.status).toBe("FULFILLED");
      expect(store.workspace["w1"].extraSeats).toBe(2);
      expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
      expect(dbEventLog).toContain("WAIT@COMMIT+2000ms");
      // 迟到请求持有过期旧读：按最新 SUCCESS 分类，不多发、不反转
      staleBillingRead = {
        row: { ...JSON.parse(JSON.stringify(store.billingrecord["SA_test_1"])), status: "PENDING", expiresAt: new Date(Date.now() - 1000) },
        remaining: 1,
      };
      const late = await shared();
      expect(late).toMatchObject({ ok: true, status: "ALREADY_PROCESSED" });
      expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
      expect(store.workspace["w1"].extraSeats).toBe(2);
    } finally { staleBillingRead = null; leaveFakeClock(); }
  });

  // T07：截止恰好相等 / 历史 null 期限 / 正常窗口，与 helper 语义一致且只发一次
  it("T07 截止相等不算过期；null 历史期限保留；正常窗口只发一次", async () => {
    enterFakeClock();
    try {
      seedFixture({ seats: 2, amount: 2600 });
      store.billingrecord["SA_test_1"].expiresAt = new Date(BASE); // 恰好相等
      const eq = await shared();
      expect(eq.ok).toBe(true);
      expect(store.workspace["w1"].extraSeats).toBe(2);
    } finally { leaveFakeClock(); }

    seedFixture({ seats: 2, amount: 2600 });
    store.billingrecord["SA_test_1"].expiresAt = null;
    const nul = await shared();
    expect(nul.ok).toBe(true);
    expect(nul.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);

    const again = await shared();
    expect(again).toMatchObject({ ok: true, status: "ALREADY_PROCESSED" });
    expect(store.workspace["w1"].extraSeats).toBe(2);
  });

  // T08：同订单并发、各写点/提交故障、资格变化 → 原子性/一次性不退化
  it("T08 并发/故障/资格变化：根与事务写分离、完整回滚、同单安全重试", async () => {
    // 同订单两个请求明确都读到 PENDING（陈旧读屏障），仍只发一次
    seedFixture({ seats: 2, amount: 2600 });
    const a = shared();
    const b = shared();
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.status, rb.status].sort()).toEqual(["ALREADY_PROCESSED", "FULFILLED"]);
    expect(store.workspace["w1"].extraSeats).toBe(2);
    expect(store.billingrecord["SA_test_1"].status).toBe("SUCCESS");
    expect(writeLog.every((w) => !w.startsWith("ROOT ") || !w.includes("update"))).toBe(true);

    // 空间条件写故障：同事务回滚（订单 PENDING、席位 0、无临时 metadata）
    seedFixture({ seats: 2, amount: 2600 });
    failConf = { model: "workspace", method: "updateMany", times: 1 };
    const f1 = await shared();
    expect(f1.ok).toBe(false);
    expectNoRights("PENDING");
    failConf = null;
    const retry = await shared(); // 同单安全重试，恰好一次
    expect(retry.status).toBe("FULFILLED");
    expect(store.workspace["w1"].extraSeats).toBe(2);

    // 提交阶段故障：同样整体回滚
    seedFixture({ seats: 2, amount: 2600 });
    failCommit = true;
    const f2 = await shared();
    expect(f2.ok).toBe(false);
    expectNoRights("PENDING");

    // 资格变化（事务内空间一致性读时改类型）→ 条件写 count=0 → 回滚
    seedFixture({ seats: 2, amount: 2600 });
    onNthWorkspaceRead = { n: 2, count: 0, fn: () => { store.workspace["w1"].type = "PERSONAL"; } };
    const f3 = await shared();
    expect(f3.ok).toBe(false);
    expectNoRights("PENDING");
    onNthWorkspaceRead = null;
  });
});
