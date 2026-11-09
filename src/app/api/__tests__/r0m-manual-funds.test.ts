/**
 * R0-A2 / 原方案 F16 止损：人工资金入口（旧直充旁路 + 线下充值工单审批）。
 *
 * M01—M03 定向隔离验收：执行**真实** legacy 直充 POST 与后台工单 PATCH/GET，
 * 只替换认证 / 权限 / 持久化 IO；被修的路由与权限键选择不 mock。
 * 内存夹具记录所有业务写（billing_record / tokenrechargeorder.updateMany）、
 * 工单状态、以及权限 helper 实际请求的键。
 *
 * 隔离说明：@/lib/prisma 被完整替换，零真实库连接/写入/支付/模型调用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state: any = {};
  function reset(opts: {
    authenticated?: boolean;
    role?: string;
    grantedKeys?: string[];
    orderStatus?: string;
  } = {}) {
    state.authenticated = opts.authenticated !== false;
    state.role = opts.role ?? "PLATFORM_ADMIN";
    state.grantedKeys = opts.grantedKeys ?? ["order:manage"];
    state.requestedPermissions = [];
    state.writes = [];
    state.audits = [];
    state.orders = [
      {
        id: "ro-1",
        orderNo: "RO20261108123456ABCD",
        workspaceId: "w1",
        workspaceName: "测试空间",
        scope: "WALLET",
        applicantId: "u1",
        applicantName: "申请人",
        packName: null,
        points: 500,
        amountCents: 5000,
        paymentMethod: "OFFLINE_BANK",
        invoiceTitle: null,
        taxNo: null,
        bankName: null,
        bankAccount: null,
        remark: null,
        status: opts.orderStatus ?? "PENDING",
        reviewerId: null,
        reviewerName: null,
        reviewNote: null,
        paidAt: null,
        createdAt: new Date("2026-11-08T00:00:00Z"),
      },
    ];
    state.workspace = { id: "w1", name: "测试空间", type: "PERSONAL" };
    state.user = { id: "u1", name: "申请人", email: "u1@x" };
    state.applicants = [{ id: "u1", name: "申请人", email: "u1@x" }];
  }
  reset();
  return { state, reset };
});
const { state, reset } = h;
const clone = <T,>(v: T): T => structuredClone(v);

function makePrisma() {
  const prisma: any = {
    tokenrechargeorder: {
      findUnique: async ({ where }: any) => clone(state.orders.find((o: any) => o.id === where.id) ?? null),
      findMany: async ({ where, skip, take }: any) => {
        let rows = clone(
          state.orders.filter((o: any) =>
            Object.entries(where || {}).every(([k, v]) => o[k] === v),
          ),
        );
        if (skip) rows = rows.slice(skip);
        if (take) rows = rows.slice(0, take);
        return rows;
      },
      count: async ({ where }: any) =>
        state.orders.filter((o: any) => Object.entries(where || {}).every(([k, v]) => o[k] === v)).length,
      groupBy: async ({ by }: any) => {
        const groups: Record<string, number> = {};
        for (const o of state.orders) {
          const k = (o as any)[by[0]];
          groups[k] = (groups[k] || 0) + 1;
        }
        return Object.entries(groups).map(([status, _all]) => ({ status, _count: { _all } }));
      },
      aggregate: async ({ where }: any) => {
        const rows = state.orders.filter((o: any) =>
          Object.entries(where || {}).every(([k, v]) => o[k] === v),
        );
        return { _sum: { amountCents: rows.reduce((s: number, o: any) => s + o.amountCents, 0) } };
      },
      updateMany: async ({ where, data }: any) => {
        state.writes.push({ table: "tokenrechargeorder", method: "updateMany", where });
        const rows = state.orders.filter((o: any) =>
          Object.entries(where || {}).every(([k, v]: any) => {
            if (v && typeof v === "object" && "in" in v) return v.in.includes(o[k]);
            return o[k] === v;
          }),
        );
        for (const r of rows) Object.assign(r, clone(data));
        return { count: rows.length };
      },
      create: async ({ data }: any) => {
        state.writes.push({ table: "tokenrechargeorder", method: "create" });
        const row = clone(data);
        state.orders.push(row);
        return row;
      },
    },
    workspace: { findUnique: async () => clone(state.workspace) },
    user: { findUnique: async () => clone(state.user), findMany: async () => clone(state.applicants) },
    tokenpack: { findUnique: async () => null, findFirst: async () => null },
    membershiplevel: { findUnique: async () => ({ tokenPackDiscount: 0 }) },
    billing_record: {
      create: async ({ data }: any) => {
        state.writes.push({ table: "billing_record", method: "create", data: clone(data) });
        return clone(data);
      },
    },
  };
  return prisma;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@/lib/security", () => ({
  requirePlatformPermission: async (_req: Request, ...keys: string[]) => {
    state.requestedPermissions.push(keys);
    if (!state.authenticated) {
      return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "未授权" }), { status: 401 }) };
    }
    // 超管放行全部模块（与 requirePlatformAuth 一致）
    if (state.role === "SUPER_ADMIN") {
      return { authorized: true, user: { id: "admin-1", email: "a@x", name: "admin", role: "SUPER_ADMIN", status: "active" } };
    }
    const granted = keys.length === 0 || keys.some((k) => state.grantedKeys.includes(k));
    if (!granted) {
      return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "无权限" }), { status: 403 }) };
    }
    return { authorized: true, user: { id: "admin-1", email: "a@x", name: "admin", role: "PLATFORM_ADMIN", status: "active" } };
  },
  isPlatformAdminRole: (role?: string | null) =>
    ["ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN"].includes(String(role || "").toUpperCase()),
  writeAuditLog: async (...args: any[]) => {
    state.audits.push(args);
  },
}));
vi.mock("@/lib/auth", () => ({
  validateUser: async () =>
    state.authenticated
      ? { valid: true, user: { id: "u1", name: "fixture", email: "u1@x", role: state.role } }
      : { valid: false },
}));

// 真实路由（不 mock 被修对象）
const { POST: legacyRechargePOST } = await import("@/app/api/workspace/quota/recharge/route");
const { GET: adminGET, PATCH: adminPATCH } = await import("@/app/api/admin/recharge-orders/route");

const RETIRED_CODE = "LEGACY_RECHARGE_RETIRED";
const CONFIRM_PAUSED_CODE = "RECHARGE_CONFIRM_PAID_PAUSED";

const legacyReq = () =>
  new NextRequest("http://localhost/api/workspace/quota/recharge", {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: "w1", points: 500 }),
  });
const adminPatchReq = (id: string, action: string, reviewNote?: string) =>
  new NextRequest("http://localhost/api/admin/recharge-orders", {
    method: "PATCH",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ id, action, reviewNote }),
  });
const adminGetReq = () =>
  new NextRequest("http://localhost/api/admin/recharge-orders?status=");

beforeEach(() => reset());

describe("A2 M01：旧免支付直充旁路退役（零资金写）", () => {
  it("未登录 POST → 401，无任何业务写", async () => {
    reset({ authenticated: false });
    const res = await legacyRechargePOST(legacyReq());
    expect(res.status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("已登录（任意角色）POST → 409 退役，零资金/账单写、不签发订单号", async () => {
    reset();
    const res = await legacyRechargePOST(legacyReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe(RETIRED_CODE);
    // 零写：未签发订单、未入账、未写账单
    expect(state.writes).toEqual([]);
    expect(state.orders.length).toBe(1); // 未新增工单
  });

  it("超级管理员 POST → 同样 409 退役（全局暂停，不留后端可调用通道）", async () => {
    reset({ role: "SUPER_ADMIN" });
    const res = await legacyRechargePOST(legacyReq());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(RETIRED_CODE);
    expect(state.writes).toEqual([]);
  });
});

describe("A2 M02：后台工单按动作授权 + 事实核销（CONFIRM_PAID 暂停）", () => {
  it("未登录 PATCH → 401", async () => {
    reset({ authenticated: false });
    const res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("普通用户（非管理员）PATCH → 403（isPlatformAdminRole 身份拒绝）", async () => {
    reset({ role: "USER" });
    const res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(403);
    expect(state.writes).toEqual([]);
  });

  it("仅持 order:read 的管理员 APPROVE → 403（只读权限不能审批），且真实请求的是专用审批键", async () => {
    reset({ grantedKeys: ["order:read"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(403);
    expect(state.requestedPermissions.at(-1)).toContain("recharge_order:approve");
    expect(state.writes).toEqual([]);
  });

  it("仅持 order:refund_approve 的管理员 APPROVE → 403（退款权限不能用于充值审批/确认）", async () => {
    reset({ grantedKeys: ["order:refund_approve"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(403);
    expect(state.writes).toEqual([]);
  });

  it("持 order:manage 或专用 recharge_order:approve 均可 APPROVE 成功（PENDING→APPROVED）", async () => {
    // 兼容粗粒度 order:manage
    reset({ grantedKeys: ["order:manage"] });
    let res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(200);
    expect(state.orders[0].status).toBe("APPROVED");
    expect(state.writes.filter((w: any) => w.table === "tokenrechargeorder").length).toBe(1);

    // 专用键
    reset({ grantedKeys: ["recharge_order:approve"] });
    res = await adminPATCH(adminPatchReq("ro-1", "APPROVE"));
    expect(res.status).toBe(200);
    expect(state.orders[0].status).toBe("APPROVED");
  });

  it("REJECT 成功（需理由），PENDING→REJECTED，零资金写", async () => {
    reset({ grantedKeys: ["order:manage"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "REJECT", "经核实该工单信息不实，予以驳回"));
    expect(res.status).toBe(200);
    expect(state.orders[0].status).toBe("REJECTED");
    // REJECT 不产生任何资金/账单写
    expect(state.writes.filter((w: any) => w.table === "billing_record")).toEqual([]);
  });

  it("REJECT 理由不足 → 400；已驳回单再 REJECT → 400（状态条件裁决）", async () => {
    reset({ grantedKeys: ["order:manage"] });
    const short = await adminPATCH(adminPatchReq("ro-1", "REJECT", ""));
    expect(short.status).toBe(400);
    expect(state.writes).toEqual([]);

    reset({ grantedKeys: ["order:manage"], orderStatus: "REJECTED" });
    const handled = await adminPATCH(adminPatchReq("ro-1", "REJECT", "合规驳回理由说明"));
    expect(handled.status).toBe(400);
  });

  it("CONFIRM_PAID（持专用权限）→ 409 暂停，零资金/账单写，工单仍 APPROVED", async () => {
    reset({ orderStatus: "APPROVED", grantedKeys: ["recharge_order:confirm_paid"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "CONFIRM_PAID"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe(CONFIRM_PAUSED_CODE);
    // 关键：未调用 grantPoints（路由已无该调用）；未写 billing_record；未变更工单状态
    expect(state.writes).toEqual([]);
    expect(state.orders[0].status).toBe("APPROVED");
  });

  it("CONFIRM_PAID 无专用权限 → 403", async () => {
    reset({ orderStatus: "APPROVED", grantedKeys: ["order:manage"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "CONFIRM_PAID"));
    expect(res.status).toBe(403);
    expect(state.writes).toEqual([]);
  });

  it("超管 CONFIRM_PAID → 同样 409 暂停，零写", async () => {
    reset({ orderStatus: "APPROVED", role: "SUPER_ADMIN" });
    const res = await adminPATCH(adminPatchReq("ro-1", "CONFIRM_PAID"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(CONFIRM_PAUSED_CODE);
    expect(state.writes).toEqual([]);
  });

  it("重复 / 并发 CONFIRM_PAID（8 次）→ 全部 409，零资金/账单写", async () => {
    reset({ orderStatus: "APPROVED", grantedKeys: ["recharge_order:confirm_paid"] });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => adminPATCH(adminPatchReq("ro-1", "CONFIRM_PAID"))),
    );
    for (const res of results) {
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe(CONFIRM_PAUSED_CODE);
    }
    expect(state.writes).toEqual([]);
    expect(state.orders[0].status).toBe("APPROVED");
  });

  it("并发 APPROVE（4 次）→ 仅 1 个成功（条件 updateMany + count 防并发覆盖）", async () => {
    reset({ grantedKeys: ["order:manage"] });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => adminPATCH(adminPatchReq("ro-1", "APPROVE"))),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBe(1);
    const conflict = results.filter((r) => r.status === 409);
    expect(conflict.length).toBe(3);
    expect(state.orders[0].status).toBe("APPROVED");
  });

  it("PATCH 不存在的工单 → 404，无写", async () => {
    reset({ grantedKeys: ["order:manage"] });
    const res = await adminPATCH(adminPatchReq("nope", "APPROVE"));
    expect(res.status).toBe(404);
    expect(state.writes).toEqual([]);
  });

  it("未知动作 → 400", async () => {
    reset({ grantedKeys: ["order:manage"] });
    const res = await adminPATCH(adminPatchReq("ro-1", "FROBNICATE"));
    expect(res.status).toBe(400);
  });
});

describe("A2 M03：管理员查询保持 + 无写", () => {
  it("管理员 GET 列表 200，正常查询无写", async () => {
    reset({ grantedKeys: ["order:read"] });
    const res = await adminGET(adminGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orders.length).toBe(1);
    expect(state.writes).toEqual([]);
  });
});
