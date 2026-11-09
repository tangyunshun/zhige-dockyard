/**
 * R0-D / 原方案 F07 止损：人工批准权限与错误发放。
 *
 * D01—D06、D08 定向隔离验收：执行**真实** resolve POST、用户 GET/POST/DELETE、后台 GET，
 * 只替换认证 / 权限 / 持久化 / 通知 / 审计 IO；被修的路由与权限键选择不 mock。
 * 内存账务夹具记录所有业务写、钱包/池/桶/流水与工单状态，以及权限 helper 实际请求的键。
 *
 * 隔离说明：@/lib/prisma 被完整替换，零真实库连接/写入/支付/模型调用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state: any = {};
  function reset(opts: {
    authenticated?: boolean;
    grantedKeys?: string[];
    scope?: string;
    automaticallyRefunded?: boolean;
    requestStatus?: string;
    requestPoints?: number;
  } = {}) {
    state.authenticated = opts.authenticated !== false;
    state.grantedKeys = opts.grantedKeys ?? ["order:refund_approve"];
    state.scope = opts.scope ?? "WALLET";
    state.requestedPermissions = [];
    state.wallet = opts.scope === "WALLET" && opts.automaticallyRefunded ? BigInt(100) : BigInt(0);
    state.pool = opts.scope === "WORKSPACE" && opts.automaticallyRefunded ? BigInt(100) : BigInt(0);
    state.grants = [{
      id: "source", scope: state.scope, userId: "u1",
      workspaceId: state.scope === "WORKSPACE" ? "w1" : null,
      remaining: opts.automaticallyRefunded ? BigInt(100) : BigInt(0),
      sourceType: state.scope === "WORKSPACE" ? "OFFLINE_RECHARGE" : "PURCHASE",
    }];
    state.ledger = [{
      id: "consume", direction: "OUT", type: "CONSUME", userId: "u1", taskId: "t1",
      workspaceId: "w1", scope: state.scope, points: BigInt(100), grantId: "source",
      componentId: null, idempotencyKey: "TASK:t1#1",
    }];
    if (opts.automaticallyRefunded) {
      state.ledger.push({
        id: "auto-refund", direction: "IN", type: "REFUND", userId: "u1", taskId: "t1",
        workspaceId: "w1", scope: state.scope, points: BigInt(100), grantId: "source",
        idempotencyKey: "REFUND_MODEL_FAILURE:t1:0",
      });
    }
    state.requests = [{
      id: "rr-1", taskId: "t1", userId: "u1", workspaceId: "w1", componentId: null,
      points: opts.requestPoints ?? 100,
      reason: "fixture reason for audit",
      status: opts.requestStatus ?? "PENDING",
      adminId: null, adminRemark: null, refundLedgerId: null, resolvedAt: null,
    }];
    state.writes = [];
    state.notifications = [];
    state.grantPointsCalls = 0;
    state.audits = [];
  }
  reset();
  return { state, reset };
});
const { state, reset } = h;
const clone = <T,>(v: T): T => structuredClone(v);

function makePrisma() {
  const log = (table: string, method: string) => state.writes.push({ table, method });
  const prisma: any = {
    pointledger: {
      findMany: async ({ where }: any) => clone(
        state.ledger.filter((row: any) =>
          Object.entries(where || {}).every(([k, v]) => {
            if (v && typeof v === "object" && "not" in (v as any)) return row[k] !== (v as any).not;
            return row[k] === v;
          })),
      ),
      findFirst: async ({ where }: any) => clone(state.ledger.find((r: any) =>
        Object.entries(where || {}).every(([k, v]) => r[k] === v)) ?? null),
      create: async ({ data }: any) => { log("pointledger", "create"); state.ledger.push(clone(data)); return clone(data); },
    },
    pointgrant: {
      create: async ({ data }: any) => { log("pointgrant", "create"); state.grants.push(clone(data)); return clone(data); },
    },
    userwallet: {
      upsert: async ({ create, update }: any) => {
        log("userwallet", "upsert");
        state.wallet = state.wallet === BigInt(0) ? create.balance : state.wallet + update.balance.increment;
        return { balance: state.wallet };
      },
    },
    refundrequest: {
      findFirst: async ({ where }: any) => clone(state.requests.find((r: any) =>
        Object.entries(where || {}).every(([k, v]) => r[k] === v)) ?? null),
      findUnique: async ({ where }: any) => clone(state.requests.find((r: any) => r.id === where.id) ?? null),
      findMany: async ({ where }: any = {}) => clone(state.requests.filter((r: any) =>
        Object.entries(where || {}).every(([k, v]) => r[k] === v))),
      create: async ({ data }: any) => { log("refundrequest", "create"); state.requests.push(clone(data)); return clone(data); },
      update: async ({ where, data }: any) => {
        log("refundrequest", "update");
        const row = state.requests.find((r: any) => r.id === where.id);
        Object.assign(row, clone(data));
        return clone(row);
      },
      updateMany: async ({ where, data }: any) => {
        log("refundrequest", "updateMany");
        const rows = state.requests.filter((r: any) =>
          Object.entries(where || {}).every(([k, v]) => r[k] === v));
        for (const row of rows) Object.assign(row, clone(data));
        return { count: rows.length };
      },
      delete: async ({ where }: any) => {
        log("refundrequest", "delete");
        state.requests = state.requests.filter((r: any) => r.id !== where.id);
        return { count: 1 };
      },
    },
    componenttask: {
      findUnique: async () => ({ id: "t1", name: "fixture task" }),
      findMany: async () => [{ id: "t1", name: "fixture task", type: "C01", status: "FAILED", workspaceId: "w1" }],
    },
    componentcatalog: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    user: {
      findMany: async () => [],
      findUnique: async () => null,
    },
    workspace: { findMany: async () => [] },
    $transaction: async (fn: any) => {
      const before = clone({ wallet: state.wallet, pool: state.pool, grants: state.grants, ledger: state.ledger });
      try { return await fn(prisma); }
      catch (e) {
        state.wallet = before.wallet; state.pool = before.pool;
        state.grants = before.grants; state.ledger = before.ledger;
        throw e;
      }
    },
  };
  return prisma;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@/lib/security", () => ({
  requirePlatformPermission: async (_req: Request, ...keys: string[]) => {
    for (const k of keys) state.requestedPermissions.push(k);
    if (!state.authenticated) {
      return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "未授权" }), { status: 401 }) };
    }
    const granted = keys.length === 0 || keys.some((k) => state.grantedKeys.includes(k));
    if (!granted) {
      return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "无权限" }), { status: 403 }) };
    }
    return { authorized: true, user: { id: "admin-1", email: "a@x", name: "admin", role: "ADMIN", status: "active" } };
  },
  writeAuditLog: async (...args: any[]) => { state.audits.push(args); },
}));
vi.mock("@/lib/notifications-store", () => ({
  addNotification: async (...args: any[]) => { state.notifications.push(args); },
}));
vi.mock("@/lib/credit-service", () => ({
  // 若被误调用会同时记调用数与资金写；本批断言必须为 0
  grantPoints: async (...args: any[]) => {
    state.grantPointsCalls++;
    state.writes.push({ table: "grantPoints", method: "call", args });
    return { ledgerId: "SHOULD_NOT_HAPPEN" };
  },
}));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => state.authenticated
    ? { valid: true, user: { id: "u1", name: "fixture", email: "u1@x" } }
    : { valid: false },
}));
vi.mock("@/lib/role-utils", () => ({ ADMIN_ROLE_VALUES: ["ADMIN"] }));

// 真实路由（不 mock 被修对象）
const { POST: resolvePOST } = await import("@/app/api/admin/refund-requests/[id]/resolve/route");
const { GET: adminGET } = await import("@/app/api/admin/refund-requests/route");
const userRoute = await import("@/app/api/user/refund-requests/route");

const PAUSED = "MANUAL_REFUND_APPROVAL_PAUSED";
const PAUSED_MSG = "人工批准退点暂不可用，申请保留待核查；不会因此重复退点或转入个人钱包";

const resolveReq = (action: string, remark?: string) => new NextRequest(
  "http://localhost/api/admin/refund-requests/rr-1/resolve",
  {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ action, remark }),
  },
);
const params = { params: Promise.resolve({ id: "rr-1" }) };
const userPostReq = () => new NextRequest("http://localhost/api/user/refund-requests", {
  method: "POST",
  headers: { authorization: "Bearer test", "content-type": "application/json" },
  body: JSON.stringify({ taskId: "t1", reason: "fixture reason for audit" }),
});
const userGetReq = () => new NextRequest("http://localhost/api/user/refund-requests");
const userDeleteReq = (id = "rr-1") => new NextRequest(`http://localhost/api/user/refund-requests?id=${id}`, { method: "DELETE" });
const adminGetReq = () => new NextRequest("http://localhost/api/admin/refund-requests?status=ALL");

/** 零资金写：钱包/池/桶/流水/工单状态与所有业务写调用均不变 */
function expectZeroFundWrites(initial: any) {
  expect(state.grantPointsCalls).toBe(0);
  expect(state.wallet).toBe(initial.wallet);
  expect(state.pool).toBe(initial.pool);
  expect(state.grants.length).toBe(initial.grants.length);
  expect(state.ledger.length).toBe(initial.ledger.length);
  expect(state.requests[0].status).toBe("PENDING");
  expect(state.requests[0].refundLedgerId).toBe(null);
  expect(state.notifications.length).toBe(0);
  expect(state.writes.filter((w: any) =>
    ["pointgrant", "userwallet", "pointledger", "billingrecord"].includes(w.table))).toEqual([]);
}
const snapshot = () => clone({
  wallet: state.wallet, pool: state.pool,
  grants: state.grants, ledger: state.ledger, requests: state.requests,
});

beforeEach(() => reset());

describe("R0-D D01：权限纠正（order:refund_approve）", () => {
  it("只持 order:read 的用户 APPROVE 与 REJECT 均被 403 拒绝，且不读取指定申请、无业务写", async () => {
    for (const action of ["APPROVE", "REJECT"]) {
      reset({ grantedKeys: ["order:read"] });
      const initial = snapshot();
      const res = await resolvePOST(resolveReq(action, "合规驳回理由说明"), params);
      expect(res.status).toBe(403);
      // 真实请求的必须是专用审批权限，不再是可读权限
      expect(state.requestedPermissions).toEqual(["order:refund_approve"]);
      expect(state.grantPointsCalls).toBe(0);
      expect(state.writes).toEqual([]);
      expect(state.requests[0].status).toBe("PENDING");
      expect(JSON.stringify(await res.json())).not.toContain("rr-1");
      expect(state.wallet).toBe(initial.wallet);
    }
  });

  it("未登录 APPROVE / REJECT 均 401，响应不泄露申请/余额", async () => {
    reset({ authenticated: false });
    const res = await resolvePOST(resolveReq("APPROVE"), params);
    expect(res.status).toBe(401);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("100");
    expect(text).not.toContain("rr-1");
    expect(state.writes).toEqual([]);
  });

  it("只读权限仍可 GET 后台列表与导出（保持原身份边界），GET 不产生任何写", async () => {
    reset({ grantedKeys: ["order:read", "billing:export"] });
    const res = await adminGET(adminGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.capabilities.manualApprovalPaused).toBe(true);
    expect(body.capabilities.pointsAreReferenceOnly).toBe(true);
    expect(state.writes).toEqual([]);
    expect(state.requestedPermissions).toContain("order:read");
  });
});

describe("R0-D D02：专用权限下人工 APPROVE 零资金写", () => {
  it("持 order:refund_approve 批准普通钱包申请 → 409 稳定暂停，PENDING/钱包/桶/流水不变", async () => {
    const initial = snapshot();
    const res = await resolvePOST(resolveReq("APPROVE"), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe(PAUSED);
    expect(body.error).toBe(PAUSED_MSG);
    expect(body.refunded).toBeUndefined();
    expect(body.refundLedgerId).toBeUndefined();
    expect(state.requestedPermissions).toEqual(["order:refund_approve"]);
    expectZeroFundWrites(initial);
  });

  it("暂停响应不携带申请信息/金额/余额字段", async () => {
    const res = await resolvePOST(resolveReq("APPROVE"), params);
    const raw = JSON.stringify(await res.json());
    for (const leak of ["rr-1", "t1", "u1", "100", "walletBalance", "points"]) {
      expect(raw).not.toContain(leak);
    }
  });
});

describe("R0-D D03：不同来源 / 已自动退点 / 来源缺失场景均不走人工加钱包", () => {
  it("企业池来源、赠送来源、已自动全额退点、来源缺失、混合来源全部安全暂停", async () => {
    const cases = [
      { scope: "WORKSPACE", automaticallyRefunded: false },
      { scope: "WORKSPACE", automaticallyRefunded: true },
      { scope: "WALLET", automaticallyRefunded: true },
      { scope: "PERSONAL_GIFT", automaticallyRefunded: false },
      { scope: "UNKNOWN_SCOPE", automaticallyRefunded: false, requestPoints: 250 },
    ];
    for (const c of cases) {
      reset(c);
      const initial = snapshot();
      const res = await resolvePOST(resolveReq("APPROVE"), params);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe(PAUSED);
      expectZeroFundWrites(initial);
      // 不自动改历史：不新增 REJECTED/APPROVED、不删工单
      expect(state.requests.length).toBe(1);
      expect(state.requests[0].status).toBe("PENDING");
    }
  });
});

describe("R0-D D04：重复 / 连点 / 并发人工 APPROVE", () => {
  it("同单重复 5 次：每次 409，零资金/成功状态写", async () => {
    const initial = snapshot();
    for (let i = 0; i < 5; i++) {
      const res = await resolvePOST(resolveReq("APPROVE"), params);
      expect(res.status).toBe(409);
    }
    expectZeroFundWrites(initial);
  });

  it("并发 8 次 APPROVE（含多申请同任务）：全部 409，资产与工单状态不变", async () => {
    reset();
    // 另一张同任务申请：也不能借幂等键差异绕过
    state.requests.push({ ...state.requests[0], id: "rr-2", points: 100 });
    const initial = snapshot();
    const results = await Promise.all(Array.from({ length: 8 }, () => resolvePOST(resolveReq("APPROVE"), params)));
    for (const res of results) {
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe(PAUSED);
    }
    expect(state.grantPointsCalls).toBe(0);
    expect(state.wallet).toBe(initial.wallet);
    expect(state.pool).toBe(initial.pool);
    expect(state.requests.every((r: any) => r.status === "PENDING")).toBe(true);
    expect(state.writes.filter((w: any) => w.table !== "refundrequest")).toEqual([]);
  });
});

describe("R0-D D05：合法 REJECT 保持可用且无加点", () => {
  it("持专用权限 + 合法理由 → 驳回成功，PENDING 条件裁决，零资金写", async () => {
    const initial = snapshot();
    const res = await resolvePOST(resolveReq("REJECT", "经核实任务已正常输出结果，不符合退款条件"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(state.requests[0].status).toBe("REJECTED");
    expect(state.grantPointsCalls).toBe(0);
    expect(state.wallet).toBe(initial.wallet);
    expect(state.grants.length).toBe(initial.grants.length);
    expect(state.writes.filter((w: any) =>
      ["pointgrant", "userwallet", "pointledger"].includes(w.table))).toEqual([]);
    // 驳回通知如实显示（不是退款到账通知）
    expect(state.notifications.length).toBe(1);
    expect(state.notifications[0][1]).toContain("未通过");
  });

  it("理由不足 400；已处理单 409；只读者不能 REJECT", async () => {
    reset();
    const short = await resolvePOST(resolveReq("REJECT", "短"), params);
    expect(short.status).toBe(400);
    expect(state.writes).toEqual([]);

    reset({ grantedKeys: ["order:read"] });
    const readonly = await resolvePOST(resolveReq("REJECT", "合规驳回理由说明"), params);
    expect(readonly.status).toBe(403);
    expect(state.writes).toEqual([]);

    reset({ requestStatus: "APPROVED" });
    const handled = await resolvePOST(resolveReq("REJECT", "合规驳回理由说明"), params);
    expect(handled.status).toBe(409);
    expect(state.requests[0].status).toBe("APPROVED"); // 历史已批准记录不被改写
  });

  it("并发 REJECT 只有一个能改变状态（PENDING 条件裁决 + count 检查）", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      resolvePOST(resolveReq("REJECT", "合规驳回理由说明"), params)));
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBe(1);
    expect(state.requests[0].status).toBe("REJECTED");
  });
});

describe("R0-D D06：用户受理/查询/撤销与后台列表/导出保持", () => {
  it("用户 GET 返回历史、候选与暂停能力事实，金额只作参考、无已核准净额字段", async () => {
    const res = await userRoute.GET(userGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.capabilities.manualApprovalPaused).toBe(true);
    expect(body.capabilities.pointsAreReferenceOnly).toBe(true);
    expect(body.data.requests.length).toBe(1);
    // 同一任务已有待核查申请，不应再出现在候选里（不鼓励重复提交）
    expect(body.data.candidates.length).toBe(0);
    expect(JSON.stringify(body)).not.toContain("remainingRefundable");
    expect(state.writes).toEqual([]); // GET 无写
  });

  it("用户可正常提交核查诉求（受理 != 退点成功），可撤销待核查申请", async () => {
    reset();
    state.requests = []; // 清空以允许新建
    const submitted = await userRoute.POST(userPostReq());
    expect(submitted.status).toBe(200);
    const created = (await submitted.json()).data;
    expect(created.status).toBe("PENDING");
    expect(created.points).toBe(100); // 历史累计扣点参考值
    expect(state.grantPointsCalls).toBe(0);
    expect(state.wallet).toBe(BigInt(0)); // 受理不加点

    const del = await userRoute.DELETE(userDeleteReq(created.id));
    expect(del.status).toBe(200);
    expect(state.grantPointsCalls).toBe(0);
  });

  it("未登录用户 GET/POST/DELETE 均 401；后台列表 GET 权限不变且无写", async () => {
    reset({ authenticated: false });
    expect((await userRoute.GET(userGetReq())).status).toBe(401);
    expect((await userRoute.POST(userPostReq())).status).toBe(401);
    expect((await userRoute.DELETE(userDeleteReq())).status).toBe(401);
    expect((await adminGET(adminGetReq())).status).toBe(401);
  });
});

describe("R0-D D08：自动退款与相邻原语保护", () => {
  it("自动任务失败原路退点的既有流水/来源桶不受本批影响（差量外，仅记录不改写）", () => {
    reset({ scope: "WORKSPACE", automaticallyRefunded: true });
    const autoRefunds = state.ledger.filter((r: any) => r.type === "REFUND" && r.id.startsWith("auto-"));
    expect(autoRefunds.length).toBe(1);
    expect(autoRefunds[0].scope).toBe("WORKSPACE"); // 原来源，不是 WALLET
    // 人工 APPROVE 不得再产生任何 REFUND 流水
    return resolvePOST(resolveReq("APPROVE"), params).then(async (res) => {
      expect(res.status).toBe(409);
      const after = state.ledger.filter((r: any) => r.type === "REFUND");
      expect(after.length).toBe(1);
      expect(after[0].id).toBe("auto-refund");
      expect(state.grantPointsCalls).toBe(0);
    });
  });

  it("grantPoints 未被全局禁用（本批只停止人工 APPROVE 路径）", async () => {
    const credit = await import("@/lib/credit-service");
    expect(typeof credit.grantPoints).toBe("function");
  });
});
