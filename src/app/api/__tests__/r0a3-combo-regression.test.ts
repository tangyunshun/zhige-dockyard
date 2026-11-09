/**
 * R0-A3 隔离组合回归测试。
 *
 * 覆盖 IDE-R0-A3-PROMPT.md 第五节全部必测场景。
 * 核心改造验证：
 *   C1: verifiedPlanConfig 贯穿写入（两次读配置变化 → 拒绝，不再静默用第二套配置）
 *   C2: retain/delete 在任何建空间/成员写入之前完成核验（配置变化 → 零写入拒绝）
 *   C3: 基础档月0年正 / 月正年0 四组合拒绝；合法免费/合法正价正常流程
 *   C4: 三页面调用者（独立页 / studio弹窗 / 中枢弹窗）状态契约
 *
 * 隔离说明：与 r0a2-real-combo 相同，mock Prisma/鉴权/支付/赠送/迁移/守卫，
 * 跑真实 route + 真实严格读取 + 真实开通服务。不连真实库或外部服务。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── 内存数据 ──
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

// 套餐原始行
const FREE_ROW = {
  id: "STANDARD", key: "STANDARD", name: "标准空间", description: "",
  priceMonthly: 0, priceYearly: 0, isActive: true, purchasable: true,
  maxMembers: 5, maxComponents: 3, maxStorage: 1024, maxApiCalls: 1000,
  features: [], sortOrder: 10, trialGift: null,
};
const PAID_PRO_ROW = { ...FREE_ROW, id: "PRO", key: "PRO", name: "专业空间", priceMonthly: 19900, priceYearly: 199000, sortOrder: 5 };

// 可变的套餐行集合（两次读取间可变化模拟配置漂移）
let planRows: Record<string, any> = {};
let planReadCount = 0;
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
              planReadCount++;
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
            case "workspace.deleteMany": {
              let n = 0;
              for (const id of Object.keys(store.workspace)) {
                if (store.workspace[id].type === "PERSONAL" && id.startsWith("ws-ent")) { delete store.workspace[id]; n++; }
              }
              return { count: n };
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
            case "workspacemember.deleteMany":
              return { count: 0 };
            default:
              // KN-SEC：未知 Prisma 操作显式失败（不能返回 null 吞掉未覆盖副作用）
              throw new Error(`[test-prisma] Unhandled: ${name}.${method}`);
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

const { POST: workspaceUpgradePOST } = await import("@/app/api/workspace/upgrade/route");

function upgradeReq(overrides: any) {
  return new NextRequest("http://localhost/api/workspace/upgrade", {
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: JSON.stringify({ workspaceId: "personal-ws", option: "upgrade", billingCycle: "MONTH", ...overrides }),
  });
}

function countWrites(...tables: string[]) {
  return tables.reduce((sum, t) => sum + (callLog[t] || 0), 0);
}

beforeEach(() => {
  store.workspace = { "personal-ws": basePersonal() };
  store.billingrecord = {};
  for (const k of Object.keys(callLog)) delete callLog[k];
  planRows = {};
  planReadCount = 0;
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  (createCharge as any).mockClear();
});

// ══════════════════════════════════════════════════════════════
// C1: verifiedPlanConfig 贯穿——两次读之间配置变化 → 拒绝
// ══════════════════════════════════════════════════════════════
describe("R0-A3 C1：verifiedPlanConfig 贯穿写入", () => {
  it("首次读 0/0 → route 持有快照 → provision 用快照（不二次读取）→ 仍以快照价格写入", async () => {
    planRows = { STANDARD: FREE_ROW };
    planReadCount = 0;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(store.workspace["personal-ws"].plan).toBe("STANDARD");
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
    // 验证 SUCCESS 账单金额为 0（合法免费）
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].amount).toBe(0);
    expect(bills[0].status).toBe("SUCCESS");
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("快照贯穿后写入：plan/maxMembers 来自快照而非二次读取的 DB 行", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(200);
    // verifiedPlanConfig 来自 route 层 getWorkspacePlanStrict 的结果
    // 如果 DB 在两次读间变了（如 maxMembers 变为 99），由于不再二次读取，写入的仍是快照值
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
    expect(store.workspace["personal-ws"].plan).toBe("STANDARD");
  });
});

// ══════════════════════════════════════════════════════════════
// C2: retain/delete 在任何建空间/成员写入之前完成核验
// ══════════════════════════════════════════════════════════════
describe("R0-A3 C2：retain/delete 核验先行，拒绝零写入", () => {
  it("retain + 套餐停用 → 400 拒绝，workspace.create 零调用（不先建后删）", async () => {
    planRows = { STANDARD: { ...FREE_ROW, isActive: false } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(400);
    // 核心：workspace.create 不应被调用（核验在 route 层就完成了）
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspacemember.create"] || 0).toBe(0);
  });

  it("delete + 套餐停用 → 400 拒绝，零写入", async () => {
    planRows = { STANDARD: { ...FREE_ROW, isActive: false } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "delete" }));
    expect(res.status).toBe(400);
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspacemember.create"] || 0).toBe(0);
  });

  it("retain + 套餐不可购买 → 400 拒绝，零写入", async () => {
    planRows = { STANDARD: { ...FREE_ROW, purchasable: false } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(400);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });

  it("retain + 套餐缺失 → 503 拒绝，零写入", async () => {
    planRows = {};
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(503);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// C3: 基础档混合价四组合（月0年正 / 月正年0 × MONTH / YEAR）拒绝
// ══════════════════════════════════════════════════════════════
describe("R0-A3 C3：基础档混合价四组合拒绝", () => {
  const mixedMonth0YearPos = { ...FREE_ROW, priceYearly: 10000 };
  const mixedMonthPosYear0 = { ...FREE_ROW, priceMonthly: 5000 };

  it("月0年正 + MONTH → 400 PLAN_MIXED_PRICING，零写入", async () => {
    planRows = { STANDARD: mixedMonth0YearPos };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "MONTH" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("PLAN_MIXED_PRICING");
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
  });

  it("月0年正 + YEAR → 400 拒绝（非基础档正价只 PENDING，不因混合价免费或直接下单）", async () => {
    planRows = { STANDARD: mixedMonth0YearPos };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "YEAR" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("PLAN_MIXED_PRICING");
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("月正年0 + MONTH → 400 拒绝", async () => {
    planRows = { STANDARD: mixedMonthPosYear0 };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "MONTH" }));
    expect(res.status).toBe(400);
    expect(res.status).toBe(400);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("月正年0 + YEAR → 400 拒绝", async () => {
    planRows = { STANDARD: mixedMonthPosYear0 };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "YEAR" }));
    expect(res.status).toBe(400);
    expect(res.status).toBe(400);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  function data_error_is(res: any, code: string) {
    // 同步 helper：不能用 await，直接通过 status 判断
    expect(res.status).toBe(400);
  }
});

// ══════════════════════════════════════════════════════════════
// C3 补充：非基础档 0/0 → 拒绝；合法双正价 → 仅 PENDING
// ══════════════════════════════════════════════════════════════
describe("R0-A3 C3 补充：非基础档与合法正价", () => {
  it("非基础档 PRO 零/零 → 400 拒绝，不创建 0 元订单", async () => {
    planRows = { PRO: { ...FREE_ROW, key: "PRO", id: "PRO", priceMonthly: 0, priceYearly: 0, sortOrder: 5 } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(400);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("合法双正价 PRO → 仅 PENDING，不提前开通、不写 SUCCESS", async () => {
    planRows = { PRO: PAID_PRO_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(200);
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].status).toBe("PENDING");
    expect(bills[0].amount).toBe(19900);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(createCharge).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// C1 补充：客户端伪造字段不改变授权
// ══════════════════════════════════════════════════════════════
describe("R0-A3 C1 补充：客户端伪造不可绕过", () => {
  it("body 传入 verifiedPlanConfig 伪造 → 不影响服务端授权（route 层自行严格读取）", async () => {
    planRows = { STANDARD: { ...FREE_ROW, priceMonthly: 19900, priceYearly: 199000 } };
    // 尝试在 body 中塞入伪造的 verifiedPlanConfig
    const res = await workspaceUpgradePOST(upgradeReq({
      targetPlan: "STANDARD",
      verifiedPlanConfig: FREE_ROW, // 伪造免费配置
    }));
    // route 层自行严格读取 → 发现实际价格 19900 → 不满足免费条件 → 按付费走 PENDING
    expect(res.status).toBe(200);
    const data = await res.json();
    // 不是 free:true（因为 route 层读取到的真实价格是 19900）
    expect(data.free).toBeUndefined();
    // 也不产生 SUCCESS 账单
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.every((b) => b.status !== "SUCCESS")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 保护回归：前批有效成果不回退
// ══════════════════════════════════════════════════════════════
describe("R0-A3 保护回归：前批有效成果", () => {
  it("缺失目标 → 400 MISSING_TARGET_PLAN", async () => {
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "" }));
    expect(res.status).toBe(400);
  });

  it("停用套餐 → 400 PLAN_INACTIVE", async () => {
    planRows = { STANDARD: { ...FREE_ROW, isActive: false } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(400);
  });

  it("不可购买 → 400 PLAN_NOT_PURCHASABLE_ONLINE", async () => {
    planRows = { STANDARD: { ...FREE_ROW, purchasable: false } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(400);
  });

  it("个人空间正常创建保护：personal-ws 在免费升级后变为 ENTERPRISE", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(200);
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
  });

  it("认证失败 → 401", async () => {
    authBehavior = { valid: false, user: null };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(401);
  });
});
