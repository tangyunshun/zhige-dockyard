/**
 * R0-C / 原方案 F06 止损：企业共享池 → 个人钱包转移暂停。
 *
 * C01—C05 定向隔离验收：执行**真实** credit-service 导出函数与**真实**两个 POST 路由，
 * 只替换认证 / 持久化 / 通知 / 成员关系等 IO；被修的服务与路由不 mock。
 * 内存账务夹具记录表、操作、$transaction 调用与前后快照，断言零业务写。
 *
 * 隔离说明：无真实数据库连接（@/lib/prisma 被完整替换），零真实库写入/支付/模型调用。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存账务夹具 ══════════════
const h = vi.hoisted(() => {
  const state: any = {};
  function reset(opts: { authenticated?: boolean; member?: boolean; role?: string; sourceType?: string } = {}) {
    state.authenticated = opts.authenticated !== false;
    state.member = opts.member !== false;
    state.role = opts.role ?? "OWNER";
    state.actorId = state.role === "OWNER" ? "owner" : state.role === "PLATFORM_ADMIN" ? "platform-admin" : "staff";
    state.pool = BigInt(100);
    state.wallets = {};
    state.grants = [{
      id: "source", scope: "WORKSPACE", workspaceId: "w1",
      points: BigInt(100), remaining: BigInt(100), status: "ACTIVE",
      sourceType: opts.sourceType ?? "OFFLINE_RECHARGE",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    }];
    state.ledgers = [];
    state.writes = [];
    state.txCount = 0;
    state.audits = 0;
    state.notifications = [];
    state.successToasts = [];
  }
  reset();
  return { state, reset };
});

const { state, reset } = h;
const copy = <T,>(v: T): T => structuredClone(v);

function makePrisma() {
  function client(kind: "ROOT" | "TX") {
    const log = (model: string, method: string) =>
      state.writes.push({ kind, model, method });
    return {
      workspace: {
        findUnique: async () => ({
          id: "w1", name: "fixture", type: "ENTERPRISE", status: "ACTIVE",
          ownerId: "owner", plan: "PRO",
        }),
      },
      workspacemember: {
        findUnique: async () => (state.member
          ? { role: state.role === "OWNER" ? "OWNER" : state.role === "ADMIN" ? "ADMIN" : "MEMBER" }
          : null),
      },
      user: {
        findUnique: async () => ({
          id: state.actorId,
          role: state.role === "PLATFORM_ADMIN" ? "ADMIN" : "USER",
        }),
      },
      workspacequota: {
        findUnique: async () => ({ tokenBalance: state.pool, poolLowThreshold: null }),
        update: async ({ data }: any) => {
          log("workspacequota", "update");
          state.pool -= data.tokenBalance.decrement;
          return { tokenBalance: state.pool };
        },
      },
      userwallet: {
        upsert: async ({ where, create, update }: any) => {
          log("userwallet", "upsert");
          state.wallets[where.userId] = Object.hasOwn(state.wallets, where.userId)
            ? state.wallets[where.userId] + update.balance.increment
            : create.balance;
          return { userId: where.userId, balance: state.wallets[where.userId] };
        },
      },
      pointgrant: {
        create: async ({ data }: any) => {
          log("pointgrant", "create");
          state.grants.push(copy(data));
          return copy(data);
        },
      },
      pointledger: {
        create: async ({ data }: any) => {
          log("pointledger", "create");
          state.ledgers.push(copy(data));
          return copy(data);
        },
      },
      billingrecord: {
        create: async ({ data }: any) => {
          log("billingrecord", "create");
          return copy(data);
        },
      },
    };
  }
  return {
    ...client("ROOT"),
    $transaction: async (fn: any) => {
      state.txCount++;
      state.writes.push({ kind: "TX", model: "$transaction", method: "begin" });
      const before = copy({ pool: state.pool, wallets: state.wallets, grants: state.grants, ledgers: state.ledgers });
      try {
        return await fn(client("TX"));
      } catch (e) {
        state.pool = before.pool;
        state.wallets = before.wallets;
        state.grants = before.grants;
        state.ledgers = before.ledgers;
        throw e;
      }
    },
  };
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/notifications-store", () => ({
  addNotification: async (...args: any[]) => { state.notifications.push(args); },
}));
vi.mock("@/lib/workspace-readonly-guard", () => ({
  assertWorkspaceWritable: async () => {},
}));
vi.mock("@/lib/register-gift-config", () => ({ loadRegisterGiftConfig: async () => ({}) }));
vi.mock("@/lib/points-notifications", () => ({
  notifyGrantsExpired: async () => {},
  notifyRegisterGiftGranted: async () => {},
}));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => state.authenticated
    ? { valid: true, user: { id: state.actorId } }
    : { valid: false },
  isAdminRole: (role: string) => role === "ADMIN",
}));
vi.mock("@/lib/security", () => ({
  requireWorkspaceMembership: async () => state.member,
  writeAuditLog: async () => { state.audits++; },
}));
vi.mock("@/constants/workspace-plans", () => ({ resolvePoolLowThreshold: () => 500 }));

// 真实服务与真实两个 POST（不 mock 被修对象）
const credit = await import("@/lib/credit-service");
const { POST: workspacePOST } = await import("@/app/api/workspace/quota/recycle/route");
const { POST: adminPOST } = await import("@/app/api/admin/workspaces/recycle/route");

const DISABLED = credit.ENTERPRISE_POOL_RECYCLE_DISABLED;
const MESSAGE = credit.ENTERPRISE_POOL_RECYCLE_MESSAGE;

const workspaceReq = () => new NextRequest("http://localhost/api/workspace/quota/recycle", {
  method: "POST",
  headers: { authorization: "Bearer test", "content-type": "application/json" },
  body: JSON.stringify({ workspaceId: "w1", points: 100 }),
});
const adminReq = () => new NextRequest("http://localhost/api/admin/workspaces/recycle", {
  method: "POST",
  headers: { authorization: "Bearer test", "content-type": "application/json" },
  body: JSON.stringify({ workspaceId: "w1", points: 100 }),
});

/** 服务零写 + 资产不变的统一断言（原池 100 / 原桶 100 / 钱包 0） */
function expectZeroWritesAndUnchangedAssets() {
  expect(state.txCount).toBe(0);
  expect(state.writes).toEqual([]);
  expect(state.pool).toBe(BigInt(100));
  expect(state.grants).toHaveLength(1);
  expect(state.grants[0].remaining).toBe(BigInt(100));
  expect(state.grants[0].scope).toBe("WORKSPACE");
  expect(Object.keys(state.wallets)).toHaveLength(0);
  expect(state.ledgers).toHaveLength(0);
  expect(state.audits).toBe(0);
  expect(state.notifications).toHaveLength(0);
}
/** 路由仍会做身份读取，但不得有任何业务写/事务 */
function expectNoBusinessWrites() {
  const business = state.writes.filter((w: any) =>
    w.model === "$transaction" ||
    ["workspacequota", "userwallet", "pointgrant", "pointledger", "billingrecord"].includes(w.model));
  expect(business).toEqual([]);
  expect(state.txCount).toBe(0);
  expect(state.pool).toBe(BigInt(100));
  expect(state.grants).toHaveLength(1);
  expect(state.grants[0].remaining).toBe(BigInt(100));
  expect(Object.keys(state.wallets)).toHaveLength(0);
  expect(state.ledgers).toHaveLength(0);
  expect(state.audits).toBe(0);
  expect(state.notifications).toHaveLength(0);
}
function expectPausedResponse(res: Response, body: any) {
  expect(res.status).toBe(409);
  expect(body.success).toBe(false);
  expect(body.code).toBe(DISABLED);
  expect(body.error).toBe(MESSAGE);
  expect(body.error).toContain("原余额保留在企业空间");
  expect(body.recycledPoints).toBeUndefined();
  expect(body.walletBalance).toBeUndefined();
  expect(body.poolBalance).toBeUndefined();
  expect(body.message).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("成功");
  expect(JSON.stringify(body)).not.toContain("到账");
}

beforeEach(() => reset());

describe("R0-C C01：真实服务直接调用", () => {
  it("付费来源 OFFLINE_RECHARGE：稳定暂停错误，零事务/零业务写，资产不变", async () => {
    reset({ sourceType: "OFFLINE_RECHARGE" });
    await expect(credit.recycleEnterprisePool({
      workspaceId: "w1", userId: "owner", points: 100, operatorId: "owner",
    })).rejects.toThrow(DISABLED);
    expectZeroWritesAndUnchangedAssets();
  });

  it("赠送来源 GIFT_BONUS：同样暂停，不制造无来源/无期限的钱包桶", async () => {
    reset({ sourceType: "GIFT_BONUS" });
    await expect(credit.recycleEnterprisePool({
      workspaceId: "w1", userId: "owner", points: 100, operatorId: null,
    })).rejects.toThrow(DISABLED);
    expectZeroWritesAndUnchangedAssets();
  });

  it("不同点数/接收者/非法点数均在任何 IO 之前拒绝（无绕过入口）", async () => {
    for (const points of [1, 999, 0, -5]) {
      reset();
      await expect(credit.recycleEnterprisePool({
        workspaceId: "w1", userId: "someone-else", points, operatorId: "attacker",
      })).rejects.toThrow(DISABLED);
      expect(state.txCount).toBe(0);
      expect(state.writes).toEqual([]);
    }
  });
});

describe("R0-C C02：空间 OWNER / ADMIN 真实 POST", () => {
  for (const role of ["OWNER", "ADMIN"]) {
    it(`${role}：409 非成功暂停响应，无转个人、无成功账务`, async () => {
      reset({ role });
      const res = await workspacePOST(workspaceReq());
      const body = await res.json();
      expectPausedResponse(res, body);
      expectNoBusinessWrites();
    });
  }
});

describe("R0-C C03：平台管理员真实 POST", () => {
  it("PLATFORM_ADMIN：同样 409，不向 owner 或任意接收者转点", async () => {
    reset({ role: "PLATFORM_ADMIN" });
    const res = await adminPOST(adminReq());
    const body = await res.json();
    expectPausedResponse(res, body);
    expect(body.ownerId).toBeUndefined();
    expectNoBusinessWrites();
  });
});

describe("R0-C C04：身份/归属门禁保持", () => {
  it("未登录 401，不泄露空间/余额/用户信息", async () => {
    reset({ authenticated: false });
    const res = await workspacePOST(workspaceReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("100");
    expect(JSON.stringify(body)).not.toContain("wallet");
    expectNoBusinessWrites();
  });

  it("未登录平台管理员接口同样 401", async () => {
    reset({ authenticated: false, role: "PLATFORM_ADMIN" });
    const res = await adminPOST(adminReq());
    expect(res.status).toBe(401);
    expectNoBusinessWrites();
  });

  it("非成员 403、普通成员 MEMBER 403（空间接口）", async () => {
    for (const opts of [{ member: false }, { role: "MEMBER" }]) {
      reset(opts);
      const res = await workspacePOST(workspaceReq());
      expect(res.status).toBe(403);
      expectNoBusinessWrites();
    }
  });

  it("普通用户无平台管理权限 403（管理员接口）", async () => {
    reset({ role: "OWNER" });
    const res = await adminPOST(adminReq());
    expect(res.status).toBe(403);
    expectNoBusinessWrites();
  });
});

describe("R0-C C05：重复 / 连点 / 并发", () => {
  it("同一夹具重复调用服务 5 次：每次都拒绝，原 100 池+100 桶+0 钱包不变", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(credit.recycleEnterprisePool({
        workspaceId: "w1", userId: "owner", points: 100,
      })).rejects.toThrow(DISABLED);
    }
    expectZeroWritesAndUnchangedAssets();
  });

  it("并发：空间 OWNER 6 个真实 POST 与平台管理员 6 个真实 POST 分两组，全部 409、零业务写", async () => {
    const ownerCalls = Array.from({ length: 6 }, () => workspacePOST(workspaceReq()));
    for (const res of await Promise.all(ownerCalls)) {
      expectPausedResponse(res, await res.json());
    }
    expectNoBusinessWrites();

    reset({ role: "PLATFORM_ADMIN" });
    const adminCalls = Array.from({ length: 6 }, () => adminPOST(adminReq()));
    for (const res of await Promise.all(adminCalls)) {
      expectPausedResponse(res, await res.json());
    }
    expectNoBusinessWrites();
  });
});

describe("R0-C C07：相邻账务原语未被误拦/误改", () => {
  it("transferPoints / grantPoints / consumePoints 等导出仍存在且未被本批改为暂停", () => {
    // 成员独立余额 → 企业共享池路径（MEMBER_TO_POOL）与本次暂停函数互不相关
    expect(typeof credit.transferPoints).toBe("function");
    expect(typeof credit.grantPoints).toBe("function");
    expect(typeof credit.consumePoints).toBe("function");
  });

  it("暂停文案与稳定码为唯一新增导出，不影响其它常量", () => {
    expect(DISABLED).toBe("ENTERPRISE_POOL_RECYCLE_DISABLED");
    expect(MESSAGE).toBe("企业额度转入个人钱包暂不可用，原余额保留在企业空间");
  });

  it("成员独立余额 → 企业共享池（MEMBER_TO_POOL）仍走自身业务校验，未被暂停码误拦", async () => {
    // 非法点数在事务前被 transferPoints 自身拒绝；若被本批误拦会抛 DISABLED
    await expect(credit.transferPoints({
      workspaceId: "w1", userId: "staff", points: 0,
      direction: "MEMBER_TO_POOL", operatorId: "owner", reason: "C07 相邻路径回归",
    })).rejects.toThrow("转移点数必须为正整数");
    expect(state.txCount).toBe(0);
    expect(state.writes).toEqual([]);
  });

  it("相邻原语不是暂停函数：仅 recycleEnterprisePool 携带暂停码", () => {
    const src = credit.recycleEnterprisePool.toString();
    expect(src).toContain("ENTERPRISE_POOL_RECYCLE_DISABLED");
    expect(credit.transferPoints.toString()).not.toContain("ENTERPRISE_POOL_RECYCLE_DISABLED");
    expect(credit.grantPoints.toString()).not.toContain("ENTERPRISE_POOL_RECYCLE_DISABLED");
    expect(credit.consumePoints.toString()).not.toContain("ENTERPRISE_POOL_RECYCLE_DISABLED");
  });
});
