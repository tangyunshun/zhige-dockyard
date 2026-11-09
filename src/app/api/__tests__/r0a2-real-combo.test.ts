/**
 * R0-A2 真实服务组合回归测试。
 *
 * 关键：本文件不 mock 整个 provisionEnterpriseUpgrade / upgradePersonalToEnterprise，
 * 而是用「内存 Prisma 代理」替换持久化与支付等外部副作用，跑【真实 route + 真实严格读取 +
 * 真实开通服务】。这样能复现并验证 R0-A2 审核的核心问题：
 *   - 核验哪一套餐就只能开通哪一套餐（B1 目标漂移）；
 *   - 写边界不回退/重选目标（B4）；
 *   - 统一免费条件，零价非基础档与混合价不得免支付开通（B3）；
 *   - 合法正价只创建 PENDING，不提前开通（B3）。
 *
 * 隔离说明：全程 mock Prisma / 鉴权 / 支付 / 命名 / 算力赠送 / 迁移 / 只读守卫，
 * 不连接真实库或外部服务，不调用真实支付/模型/短信/邮件。本测试不冒充真实 MySQL 事务测试。
 *
 * 运行（仅本定向文件）：
 *   npx vitest run --no-color src/app/api/__tests__/r0a2-real-combo.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// 内存数据（替代真实数据库；仅记录最终结果，不连真实库）
// ---------------------------------------------------------------------------
const basePersonal = () => ({
  id: "personal-ws",
  name: "个人空间",
  description: null,
  type: "PERSONAL",
  ownerId: "u1",
  plan: "FREE",
  status: "ACTIVE",
  planExpiresAt: null,
});

const store: { workspace: Record<string, any>; billingrecord: Record<string, any> } = {
  workspace: { "personal-ws": basePersonal() },
  billingrecord: {},
};

// 套餐原始行（getWorkspacePlanStrict 先核验原始行）
const FREE_ROW = {
  id: "STANDARD", key: "STANDARD", name: "标准空间", description: "",
  priceMonthly: 0, priceYearly: 0, isActive: true, purchasable: true,
  maxMembers: 5, maxComponents: 3, maxStorage: 1024, maxApiCalls: 1000,
  features: [], sortOrder: 10, trialGift: null,
};
// PRO 付费、且 sortOrder(5) 排在 STANDARD(10) 之前 —— 用于证明即便 PRO 排序更前也不会被自动选中
const PAID_PRO_ROW = { ...FREE_ROW, id: "PRO", key: "PRO", name: "专业空间", priceMonthly: 19900, priceYearly: 199000, sortOrder: 5 };
// 零价非基础档 PRO（B3：必须拒绝，不得免支付开通，不得创建 0 元订单）
const ZERO_PRO_ROW = { ...FREE_ROW, id: "PRO", key: "PRO", name: "专业空间零价", priceMonthly: 0, priceYearly: 0, sortOrder: 5 };

let planRows: Record<string, any> = {};
let authBehavior: { valid: boolean; user: any } = { valid: true, user: { id: "u1", role: "USER" } };
const callLog: Record<string, number> = {};

function makePrismaProxy() {
  const model = (name: string) =>
    new Proxy({}, {
      get: (_t, method: string) => {
        return async (args?: any) => {
          callLog[`${name}.${method}`] = (callLog[`${name}.${method}`] || 0) + 1;
          switch (`${name}.${method}`) {
            case "workspaceplan.findUnique": {
              const k = (args?.where?.key || "").toString().toUpperCase();
              return planRows[k] ? { ...planRows[k] } : null;
            }
            case "workspace.findUnique": {
              const id = args?.where?.id;
              return store.workspace[id] ? { ...store.workspace[id] } : null;
            }
            case "workspace.findMany": {
              return Object.values(store.workspace).filter((w: any) => {
                if (args?.where?.type && w.type !== args.where.type) return false;
                if (args?.where?.ownerId && w.ownerId !== args.where.ownerId) return false;
                return true;
              });
            }
            case "workspace.update": {
              const id = args?.where?.id;
              if (store.workspace[id]) store.workspace[id] = { ...store.workspace[id], ...args.data };
              return store.workspace[id];
            }
            case "workspace.create": {
              store.workspace[args.data.id] = { ...args.data };
              return store.workspace[args.data.id];
            }
            case "workspacequota.findUnique":
              return { id: "wsq1", membershipLevelId: "FREE" };
            case "workspacequota.create":
            case "workspacequota.update":
              return { id: "wsq1" };
            case "membershiplevel.findUnique":
              return { maxEnterpriseWorkspaces: 1 };
            case "membershiplevel.findFirst":
              return { maxStorage: BigInt(0), maxApiCalls: BigInt(0), tokenLimit: BigInt(0) };
            case "user.findUnique":
              return { role: authBehavior.user?.role || "USER", membershipLevel: "FREE", name: "tester" };
            case "operationlog.create":
              return { id: "op" };
            case "billingrecord.create":
              store.billingrecord[args.data.id] = args.data;
              return args.data;
            case "billingrecord.findUnique":
              return store.billingrecord[args?.where?.id] || null;
            case "platformdefaultmodel.findMany":
              return [];
            case "workspace_model_policy.findUnique":
              return null;
            case "workspace_model_policy.create":
              return { id: "wmp" };
            case "workspacemember.create":
              return { id: "wsm" };
            default:
              return null;
          }
        };
      },
    });
  const prismaProxy: any = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "$transaction") {
        return async (fn: any) => (typeof fn === "function" ? fn(prismaProxy) : Promise.resolve());
      }
      return model(prop);
    },
  });
  return prismaProxy;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrismaProxy() }));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => {
    if (!authBehavior.valid) return { valid: false, error: "UNAUTHORIZED" };
    return { valid: true, user: authBehavior.user };
  },
  isAdminRole: (r: string) => typeof r === "string" && r.toUpperCase().includes("ADMIN"),
  getAuthToken: () => null,
}));
const createCharge = vi.fn(async () => ({ mode: "MOCK", payUrl: "https://pay.example/x" }));
const resolvePaymentMode = vi.fn(() => "MOCK");
vi.mock("@/lib/payment-gateway", () => ({ createCharge, resolvePaymentMode }));
vi.mock("@/lib/workspace-naming", () => ({ generateEnterpriseWorkspaceName: vi.fn(async () => "企业空间-测试") }));
vi.mock("@/lib/new-space-trial-quota", () => ({ grantNewSpaceTrialQuota: vi.fn(async () => ({ granted: 0 })) }));
vi.mock("@/lib/personal-gift-migration", () => ({ migratePersonalGiftToEnterprisePool: vi.fn(async () => ({ migrated: 0 })) }));
vi.mock("@/lib/workspace-readonly-guard", () => ({ assertWorkspaceWritable: vi.fn(async () => {}) }));

// 真实 route / 真实严格读取 / 真实开通服务（仅持久化与外部副作用被 mock）
const { POST: workspaceUpgradePOST } = await import("@/app/api/workspace/upgrade/route");
const { upgradePersonalToEnterprise } = await import("@/lib/workspace-upgrade-service");

function upgradeReq(overrides: any) {
  return new NextRequest("http://localhost/api/workspace/upgrade", {
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: JSON.stringify({ workspaceId: "personal-ws", option: "upgrade", billingCycle: "MONTH", ...overrides }),
  });
}

beforeEach(() => {
  store.workspace = { "personal-ws": basePersonal() };
  store.billingrecord = {};
  for (const k of Object.keys(callLog)) delete callLog[k];
  planRows = {};
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  (createCharge as any).mockClear();
});

// ---------------------------------------------------------------------------
// B1：目标漂移 —— 核验 STANDARD 就只开通 STANDARD；即便付费 PRO 排序更前也不漂移
// ---------------------------------------------------------------------------
describe("R0-A2 真实组合 B1：规范目标贯穿写入，无漂移", () => {
  it("PRO 排序更前、显式目标 STANDARD → 最终 workspace.plan 为 STANDARD（非 PRO），零订单、零支付", async () => {
    planRows = { STANDARD: FREE_ROW, PRO: PAID_PRO_ROW }; // PRO.sortOrder(5) < STANDARD(10)
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    // 断言最终写入套餐、类型（而非仅断言函数被调用）
    expect(store.workspace["personal-ws"].plan).toBe("STANDARD");
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
    // 服务内部 SUCCESS 账单金额为 0（合法免费授予），目标为 STANDARD
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].status).toBe("SUCCESS");
    expect(bills[0].amount).toBe(0);
    expect(bills[0].metadata?.toPlan).toBe("STANDARD");
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("目标缺失/空白 → 400 拒绝，个人空间不变、无订单无支付无开通", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "" }));
    expect(res.status).toBe(400);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(store.workspace["personal-ws"].type).toBe("PERSONAL");
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("retain 选项：新建企业空间，最终 plan 仍为 STANDARD（非 PRO），个人空间不变", async () => {
    planRows = { STANDARD: FREE_ROW, PRO: PAID_PRO_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(200);
    // 个人空间未被改动
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    // 新建的企业空间目标绑定为 STANDARD
    const created = Object.values(store.workspace).find((w: any) => w.id !== "personal-ws") as any;
    expect(created).toBeTruthy();
    expect(created.plan).toBe("STANDARD");
    expect(created.type).toBe("ENTERPRISE");
  });
});

// ---------------------------------------------------------------------------
// B3：统一免费条件，零价非基础档 / 混合价不得免支付开通，合法正价只 PENDING
// ---------------------------------------------------------------------------
describe("R0-A2 真实组合 B3：免费条件与下单规则", () => {
  it("零价非基础档 PRO → 拒绝(400)，无订单、无支付、无开通", async () => {
    planRows = { PRO: ZERO_PRO_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(400);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("基础档月0年正价（混合价）→ 拒绝(400)，不免费、零写入", async () => {
    planRows = { STANDARD: { ...FREE_ROW, priceYearly: 10000 } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "MONTH" }));
    expect(res.status).toBe(400);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("合法正价 PRO → 仅创建 PENDING 订单（目标 PRO、金额 19900），不提前开通、支付被调用", async () => {
    planRows = { PRO: PAID_PRO_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payUrl).toBeTruthy();
    // 订单 metadata 目标与请求一致，未漂移
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].status).toBe("PENDING");
    expect(bills[0].amount).toBe(19900);
    expect(bills[0].metadata?.targetPlan).toBe("PRO");
    // 真正开通未发生：个人空间未变
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(createCharge).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B4：写边界重新严格核验自助目标，不一致/缺失目标直接拒绝（不回退/重选）
// ---------------------------------------------------------------------------
describe("R0-A2 真实组合 B4：写边界重验自助目标", () => {
  it("自助显式目标 PRO 且配置存在 → 写入 PRO，无漂移", async () => {
    planRows = { PRO: PAID_PRO_ROW, STANDARD: FREE_ROW };
    store.workspace = { "personal-ws": basePersonal() };
    const r = await upgradePersonalToEnterprise({
      workspaceId: "personal-ws",
      targetPlanKey: "PRO",
      source: "SELF_SERVICE_PURCHASE",
      billingCycle: "MONTH",
    });
    expect(r.plan).toBe("PRO");
    expect(store.workspace["personal-ws"].plan).toBe("PRO");
  });

  it("自助目标配置缺失 → 写边界重验拒绝（TARGET_PLAN_NOT_FOUND），不回退默认", async () => {
    planRows = {}; // PRO 不存在
    store.workspace = { "personal-ws": basePersonal() };
    await expect(
      upgradePersonalToEnterprise({
        workspaceId: "personal-ws",
        targetPlanKey: "PRO",
        source: "SELF_SERVICE_PURCHASE",
        billingCycle: "MONTH",
      }),
    ).rejects.toThrow(/TARGET_PLAN_NOT_FOUND/);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
  });
});
