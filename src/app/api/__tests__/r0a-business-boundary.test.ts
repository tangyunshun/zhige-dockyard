/**
 * R0-A / R0-A1 业务边界回归测试（隔离：全程 mock Prisma / 鉴权 / 装配 / 赠送 / 支付 / 迁移，不触碰真实数据库或支付）。
 *
 * 本文件不 import node:test，属 vitest 风格；只运行本文件：
 *   npx vitest run src/app/api/__tests__/r0a-business-boundary.test.ts
 *
 * 覆盖（R0-A1 复核点 A1–A6）：
 * A1 免费资格：仅既有免费基础档(DEFAULT_WORKSPACE_PLAN)且真实月年价格均为合法整数 0 才 FREE；
 *    零价非基础档(PRO/ENTERPRISE)一律 PAID；缺失/停用/不可购买/非法(含负数/小数/null)价格拒绝且不回退常量。
 * A2 个人空间：企业门禁仅作用于 ENTERPRISE；个人分支恢复既有 getWorkspacePlanByKey 读取语义，不受企业门禁误伤。
 * A3 邻近升级入口：配置缺失/读取异常/未知目标时拒绝，不调用开通/不下单/不迁移；仅基础免费档免支付开通。
 * A4/A5 同批前端修正（不在本无浏览器测试中，详见报告“页面验证”节）。
 * A6 认证 fixture 真实切换 USER/ADMIN/未认证；对装配/赠送/支付/迁移使用 spy 直接断言未调用；
 *    后端拒绝测试与前端证据分离（前端见报告）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// 隔离桩：记录所有 Prisma 调用，便于断言“无业务写入 / 无赠送 / 无装配 / 无支付调用”
// ---------------------------------------------------------------------------
const callLog: Record<string, number> = {};

let currentPlanRowFor: (key: string) => any = () => null;
let currentMembershipLevelRow: any = null;
let forcePlanReadThrow = false; // 模拟 workspaceplan 读取异常

// 认证 fixture：真实切换 普通用户 / 管理员 / 未认证
let authBehavior: { valid: boolean; user: any } = {
  valid: true,
  user: { id: "u1", role: "USER" },
};

function makePrismaProxy() {
  const model = (name: string) =>
    new Proxy({}, {
      get: (_t, method: string) => {
        return async (args?: any) => {
          callLog[`${name}.${method}`] = (callLog[`${name}.${method}`] || 0) + 1;
          switch (`${name}.${method}`) {
            case "workspaceplan.findUnique":
              if (forcePlanReadThrow) throw new Error("DB read error");
              return currentPlanRowFor(args?.where?.key);
            case "user.findUnique":
              return { role: authBehavior.user?.role || "USER", membershipLevel: "FREE", name: "tester" };
            case "membershiplevel.findUnique":
              return currentMembershipLevelRow;
            case "membershiplevel.findFirst":
              return currentMembershipLevelRow;
            case "workspace.findMany":
              return [];
            case "workspace.findUnique":
              // 个人空间：ownerId 与 auth fixture 的 u1 一致，保证路由“只能升级个人空间/归属校验”通过
              return { id: args?.where?.id, name: "个人空间", type: "PERSONAL", ownerId: "u1", plan: "FREE" };
            case "workspace.findFirst":
              // 已存在个人空间：避免 getPersonalWorkspace 自动创建，保证拒绝路径“零写入”
              return { id: "personal-ws", name: "个人空间", type: "PERSONAL", ownerId: "u1", plan: "FREE" };
            case "workspace.count":
              return 0;
            case "workspace.create":
              return {
                id: args?.data?.id,
                ...args?.data,
                workspacemember: [{ id: "wsm" }],
                workspacequota: [{ id: "wsq" }],
              };
            case "workspacemember.create":
              return { id: "wsm" };
            case "workspacequota.create":
              return { id: "wsq" };
            case "workspacequota.findFirst":
              return null;
            case "operationlog.create":
              return { id: "op" };
            case "membershiporder.create":
              return { id: "mo" };
            case "billingrecord.create":
              return { id: "bil" };
            case "workspacequota.findMany":
              return [];
            default:
              return null;
          }
        };
      },
    });
  const prismaProxy = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "$transaction") return async (fn: any) => fn(prismaProxy);
      return model(prop);
    },
  });
  return prismaProxy;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrismaProxy() }));

// 鉴权 fixture 真实切换
vi.mock("@/lib/auth", () => ({
  validateUser: async () => {
    if (!authBehavior.valid) return { valid: false, error: "UNAUTHORIZED" };
    return { valid: true, user: authBehavior.user };
  },
  isAdminRole: (r: string) =>
    typeof r === "string" && r.toUpperCase().includes("ADMIN"),
  getAuthToken: () => null,
}));

// 装配 / 赠送 / 缓存 / 命名 —— 用 vi.fn 以便断言“拒绝路径未调用”
const ensureDefaultComponents = vi.fn(async () => {});
const inheritFreeDefaultModelsForNewWorkspace = vi.fn(async () => {});
const grantNewSpaceTrialQuota = vi.fn(async () => {});
const clearServerCache = vi.fn();
const generateEnterpriseWorkspaceName = vi.fn(async () => "企业空间-测试");
const assertWorkspaceWritable = vi.fn(async () => {});

vi.mock("@/lib/workspace-naming", () => ({ generateEnterpriseWorkspaceName }));
vi.mock("@/lib/workspaceInit", () => ({ ensureDefaultComponents }));
vi.mock("@/lib/platform-default-models", () => ({ inheritFreeDefaultModelsForNewWorkspace }));
vi.mock("@/lib/new-space-trial-quota", () => ({ grantNewSpaceTrialQuota }));
vi.mock("@/lib/serverCache", () => ({ clearServerCache }));
vi.mock("@/lib/workspace-readonly-guard", () => ({ assertWorkspaceWritable }));

// 支付与升级开通 —— spy 断言
const createCharge = vi.fn(async () => ({ mode: "MOCK", payUrl: "https://pay.example/x" }));
const resolvePaymentMode = vi.fn(() => "MOCK");
const provisionEnterpriseUpgrade = vi.fn(async () => ({
  newWorkspaceId: "new-ent",
  message: "ok",
  giftMigrated: 0,
}));
vi.mock("@/lib/payment-gateway", () => ({ createCharge, resolvePaymentMode }));
vi.mock("@/lib/workspace-upgrade-service", () => ({ provisionEnterpriseUpgrade }));

// 被测模块（mock 注册后再导入）
const { POST: membershipUpgradePOST } = await import("@/app/api/membership/upgrade/route");
const { POST: upgradePlanPOST } = await import("@/app/api/workspace/upgrade-plan/route");
const { POST: createEnterprisePOST } = await import("@/app/api/workspace/create-enterprise/route");
const { POST: workspacesCreatePOST } = await import("@/app/api/user/workspaces/create/route");
const { POST: workspaceUpgradePOST } = await import("@/app/api/workspace/upgrade/route");
const {
  verifyEnterprisePlanForCreation,
  getWorkspacePlanStrict,
} = await import("@/lib/workspace-plan-service");

// ---------------------------------------------------------------------------
// 套餐配置桩（模拟真实 workspaceplan 记录的可能形态）
// ---------------------------------------------------------------------------
const FREE_ROW = {
  id: "STANDARD", name: "标准空间", key: "STANDARD", description: "",
  priceMonthly: 0, priceYearly: 0, isActive: true, purchasable: true,
  maxMembers: 5, maxComponents: 3, maxStorage: 1024, maxApiCalls: 1000,
  features: [], sortOrder: 10, trialGift: { enabled: false, points: 0, expireDays: 0 },
};
const PAID_ROW = { ...FREE_ROW, id: "PRO", name: "专业空间", key: "PRO", priceMonthly: 19900, priceYearly: 199000, sortOrder: 20 };
const ZERO_PRO_ROW = { ...FREE_ROW, id: "PRO", name: "专业空间", key: "PRO", priceMonthly: 0, priceYearly: 0, sortOrder: 20 };
const CUSTOM_ROW = { ...FREE_ROW, id: "CUSTOM", name: "定制版", key: "CUSTOM", purchasable: false };
const INACTIVE_ROW = { ...FREE_ROW, id: "X", name: "已停用", key: "X", isActive: false };
const ILLEGAL_ROW = { ...FREE_ROW, id: "Y", name: "非法价", key: "Y", priceMonthly: null as any, priceYearly: 0 };
const NEGATIVE_ROW = { ...FREE_ROW, id: "Z", name: "负价", key: "Z", priceMonthly: -100, priceYearly: 0 };
const DECIMAL_ROW = { ...FREE_ROW, id: "D", name: "小数价", key: "D", priceMonthly: 19.9, priceYearly: 0 };

const MEMBERSHIP_LEVEL_ROW = {
  id: "FREE", name: "免费版", nameZh: "免费版",
  maxEnterpriseWorkspaces: 1, maxTeamSize: 5, maxStorage: 1024, maxApiCalls: 1000,
};

function makeReq(body: any, query = "") {
  return new NextRequest(`http://localhost/api/x${query}`, {
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of Object.keys(callLog)) delete callLog[k];
  currentPlanRowFor = () => null;
  currentMembershipLevelRow = MEMBERSHIP_LEVEL_ROW;
  forcePlanReadThrow = false;
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  vi.clearAllMocks();
  // 恢复 side-effect / 支付 / 升级 spy 的调用计数（clearAllMocks 会重置，重新赋值引用保持）
  (ensureDefaultComponents as any).mockClear?.();
  (grantNewSpaceTrialQuota as any).mockClear?.();
  (provisionEnterpriseUpgrade as any).mockClear?.();
  (createCharge as any).mockClear?.();
});

// ---------------------------------------------------------------------------
// A1：verifyEnterprisePlanForCreation 严格核验
// ---------------------------------------------------------------------------
describe("A1: verifyEnterprisePlanForCreation 严格核验", () => {
  it("基础免费档 STANDARD（价格 0/0、启用、可在线购买）→ FREE", async () => {
    currentPlanRowFor = () => FREE_ROW;
    const r = await verifyEnterprisePlanForCreation("STANDARD");
    expect(r.status).toBe("FREE");
  });
  it("付费档 PRO（价格>0）→ PAID", async () => {
    currentPlanRowFor = () => PAID_ROW;
    expect((await verifyEnterprisePlanForCreation("PRO")).status).toBe("PAID");
  });
  it("零价非基础档 PRO → PAID（不得当免费基础档放行）", async () => {
    currentPlanRowFor = () => ZERO_PRO_ROW;
    expect((await verifyEnterprisePlanForCreation("PRO")).status).toBe("PAID");
  });
  it("配置缺失 → REJECT(503)，绝不回退常量", async () => {
    currentPlanRowFor = () => null;
    const r = await verifyEnterprisePlanForCreation("GHOST");
    expect(r.status).toBe("REJECT");
    if (r.status === "REJECT") expect(r.httpStatus).toBe(503);
  });
  it("读取异常 → REJECT(503)", async () => {
    forcePlanReadThrow = true;
    const r = await verifyEnterprisePlanForCreation("STANDARD");
    expect(r.status).toBe("REJECT");
  });
  it("已停用 → REJECT(400)", async () => {
    currentPlanRowFor = () => INACTIVE_ROW;
    const r = await verifyEnterprisePlanForCreation("X");
    expect(r.status).toBe("REJECT");
    if (r.status === "REJECT") expect(r.code).toBe("PLAN_INACTIVE");
  });
  it("不可在线购买（线下定制）→ REJECT(400)", async () => {
    currentPlanRowFor = () => CUSTOM_ROW;
    const r = await verifyEnterprisePlanForCreation("CUSTOM");
    expect(r.status).toBe("REJECT");
    if (r.status === "REJECT") expect(r.code).toBe("PLAN_NOT_PURCHASABLE");
  });
  it("非法价格(null) → REJECT(503)", async () => {
    currentPlanRowFor = () => ILLEGAL_ROW;
    const r = await verifyEnterprisePlanForCreation("Y");
    expect(r.status).toBe("REJECT");
    if (r.status === "REJECT") expect(r.code).toBe("PLAN_PRICE_INVALID");
  });
  it("负价 → REJECT(503)", async () => {
    currentPlanRowFor = () => NEGATIVE_ROW;
    const r = await verifyEnterprisePlanForCreation("Z");
    expect(r.status).toBe("REJECT");
  });
  it("小数价 → REJECT(503)", async () => {
    currentPlanRowFor = () => DECIMAL_ROW;
    const r = await verifyEnterprisePlanForCreation("D");
    expect(r.status).toBe("REJECT");
  });
  it("getWorkspacePlanStrict：缺失/异常/停用/不可购买/非法价格返回 ok:false，不回退常量", async () => {
    currentPlanRowFor = () => null;
    expect((await getWorkspacePlanStrict("GHOST")).ok).toBe(false);
    forcePlanReadThrow = true;
    expect((await getWorkspacePlanStrict("STANDARD")).ok).toBe(false);
    forcePlanReadThrow = false;
    currentPlanRowFor = () => INACTIVE_ROW;
    expect((await getWorkspacePlanStrict("X")).ok).toBe(false);
    currentPlanRowFor = () => CUSTOM_ROW;
    expect((await getWorkspacePlanStrict("CUSTOM")).ok).toBe(false);
    currentPlanRowFor = () => ILLEGAL_ROW;
    expect((await getWorkspacePlanStrict("Y")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R0-A1：会员在线购买入口阻断
// ---------------------------------------------------------------------------
describe("R0-A1: 会员在线购买入口阻断（POST /api/membership/upgrade）", () => {
  it("普通用户调用旧会员入口 → 403，且零权益写入", async () => {
    const res = await membershipUpgradePOST(makeReq({ targetLevel: "GOLD", billingCycle: "MONTH", paymentMethod: "WECHAT_PAY" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("MEMBERSHIP_CHECKOUT_UNAVAILABLE");
    expect(callLog["user.update"] || 0).toBe(0);
    expect(callLog["membershiporder.create"] || 0).toBe(0);
    expect(callLog["billingrecord.create"] || 0).toBe(0);
  });
  it("管理员调用旧会员入口同样被阻断（非 2xx）", async () => {
    authBehavior = { valid: true, user: { id: "admin", role: "ADMIN" } };
    const res = await membershipUpgradePOST(makeReq({ targetLevel: "FLAGSHIP" }));
    expect(res.status).toBe(403);
  });
  it("未认证调用 → 401", async () => {
    authBehavior = { valid: false, user: null };
    const res = await membershipUpgradePOST(makeReq({ targetLevel: "GOLD" }));
    expect(res.status).toBe(401);
  });
  it("伪造付款字段无效，仍 403", async () => {
    const res = await membershipUpgradePOST(makeReq({ targetLevel: "GOLD", paid: true, amount: 19900, orderNo: "x", paymentMode: "MOCK", simulated: true }));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// R0-A1：空间套餐在线购买入口阻断
// ---------------------------------------------------------------------------
describe("R0-A1: 空间套餐在线购买入口阻断（POST /api/workspace/upgrade-plan）", () => {
  it("空间所有者调用旧套餐入口 → 403，且零套餐/配额/账单写入", async () => {
    const res = await upgradePlanPOST(makeReq({ workspaceId: "ws1", targetPlan: "PRO", billingCycle: "MONTH" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("WORKSPACE_PLAN_CHECKOUT_UNAVAILABLE");
    expect(callLog["workspace.update"] || 0).toBe(0);
    expect(callLog["billingrecord.create"] || 0).toBe(0);
  });
  it("伪造付款字段无效，仍 403", async () => {
    const res = await upgradePlanPOST(makeReq({ workspaceId: "ws1", targetPlan: "FLAGSHIP", paid: true, amount: 69900 }));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// R0-A1：企业创建入口 - 付费档/异常拒绝 + 免费放行（A1/A6）
// ---------------------------------------------------------------------------
describe("R0-A1: 企业创建入口 - 付费档与异常拒绝、免费放行", () => {
  it("create-enterprise：付费档 PRO(>0) → 402，零写入、装配/赠送/缓存 spy 未调用", async () => {
    currentPlanRowFor = () => PAID_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "PRO" }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("PAID_PLAN_REQUIRES_CHECKOUT");
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspacequota.create"] || 0).toBe(0);
    expect(callLog["operationlog.create"] || 0).toBe(0);
    expect(callLog["billingrecord.create"] || 0).toBe(0);
    expect(ensureDefaultComponents).not.toHaveBeenCalled();
    expect(grantNewSpaceTrialQuota).not.toHaveBeenCalled();
    expect(clearServerCache).not.toHaveBeenCalled();
  });
  it("create-enterprise：零价非基础档 PRO → 402，零写入（不当免费）", async () => {
    currentPlanRowFor = () => ZERO_PRO_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "PRO" }));
    expect(res.status).toBe(402);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：配置缺失(GHOST) → 503，零写入", async () => {
    currentPlanRowFor = () => null;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "GHOST" }));
    expect(res.status).toBe(503);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：已停用 → 400，零写入", async () => {
    currentPlanRowFor = () => INACTIVE_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "X" }));
    expect(res.status).toBe(400);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：不可在线购买 → 400，零写入", async () => {
    currentPlanRowFor = () => CUSTOM_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "CUSTOM" }));
    expect(res.status).toBe(400);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：非法价格(null) → 503，零写入", async () => {
    currentPlanRowFor = () => ILLEGAL_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "Y" }));
    expect(res.status).toBe(503);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：伪造付款字段无效，仍 402，零写入", async () => {
    currentPlanRowFor = () => PAID_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他", plan: "PRO", paid: true, amount: 19900, orderNo: "x", paymentMode: "MOCK", simulated: true }));
    expect(res.status).toBe(402);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("create-enterprise：真实配置一致的免费基础档 STANDARD → 200 且实际创建；装配/赠送 spy 被调用", async () => {
    currentPlanRowFor = () => FREE_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(callLog["workspace.create"] || 0).toBe(1);
    expect(ensureDefaultComponents).toHaveBeenCalled();
    expect(grantNewSpaceTrialQuota).toHaveBeenCalled();
    expect(clearServerCache).toHaveBeenCalled();
  });
  it("create-enterprise：管理员创建免费基础档仍 200", async () => {
    authBehavior = { valid: true, user: { id: "admin", role: "ADMIN" } };
    currentPlanRowFor = () => FREE_ROW;
    const res = await createEnterprisePOST(makeReq({ contactEmail: "a@b.com", teamSize: "1-5", industry: "其他" }));
    expect(res.status).toBe(200);
  });

  it("user/workspaces/create：企业付费档 PRO(>0) → 402，零写入", async () => {
    currentPlanRowFor = () => PAID_ROW;
    const res = await workspacesCreatePOST(makeReq({ type: "ENTERPRISE", name: "T", contactEmail: "a@b.com", plan: "PRO" }));
    expect(res.status).toBe(402);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("user/workspaces/create：企业零价非基础档 PRO → 402，零写入", async () => {
    currentPlanRowFor = () => ZERO_PRO_ROW;
    const res = await workspacesCreatePOST(makeReq({ type: "ENTERPRISE", name: "T", contactEmail: "a@b.com", plan: "PRO" }));
    expect(res.status).toBe(402);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("user/workspaces/create：企业配置缺失 → 503，零写入", async () => {
    currentPlanRowFor = () => null;
    const res = await workspacesCreatePOST(makeReq({ type: "ENTERPRISE", name: "T", contactEmail: "a@b.com", plan: "GHOST" }));
    expect(res.status).toBe(503);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("user/workspaces/create：企业非法价格 → 503，零写入", async () => {
    currentPlanRowFor = () => ILLEGAL_ROW;
    const res = await workspacesCreatePOST(makeReq({ type: "ENTERPRISE", name: "T", contactEmail: "a@b.com", plan: "Y" }));
    expect(res.status).toBe(503);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A2：个人空间不受企业门禁误伤
// ---------------------------------------------------------------------------
describe("A2: 个人空间不受企业购买门禁误伤", () => {
  it("个人空间：即便企业套餐配置整体缺失，仍按常量基线 200 创建（非企业门禁作用）", async () => {
    currentPlanRowFor = () => null; // 所有 workspaceplan 缺失
    const res = await workspacesCreatePOST(makeReq({ type: "PERSONAL", name: "个人空间" }));
    expect(res.status).toBe(200);
    expect(callLog["workspace.create"] || 0).toBe(1);
  });
  it("个人空间：即便 PRO 被配置为付费，仍只创建 STANDARD（plan=PRO 被忽略）", async () => {
    currentPlanRowFor = () => PAID_ROW; // PRO 为付费
    const res = await workspacesCreatePOST(makeReq({ type: "PERSONAL", name: "个人空间", plan: "PRO" }));
    expect(res.status).toBe(200);
    expect(callLog["workspace.create"] || 0).toBe(1);
  });
  it("个人空间：企业门禁（402/503）不会被触发", async () => {
    currentPlanRowFor = () => null;
    const res = await workspacesCreatePOST(makeReq({ type: "PERSONAL", name: "个人空间" }));
    expect(res.status).toBe(200); // 不是 402/503
  });
});

// ---------------------------------------------------------------------------
// A3：邻近升级入口 workspace/upgrade 严格核验（配置异常不放行、基础免费档才免支付开通）
// 该路由从 JSON body 读取 workspaceId/targetPlan/billingCycle/option，且 option∈{retain,delete,upgrade}
// ---------------------------------------------------------------------------
describe("A3: 邻近升级入口 workspace/upgrade 严格核验", () => {
  const upgradeReq = (overrides: any) =>
    new NextRequest("http://localhost/api/workspace/upgrade", {
      method: "POST",
      headers: { authorization: "Bearer test" },
      body: JSON.stringify({ workspaceId: "personal-ws", option: "retain", billingCycle: "MONTH", ...overrides }),
    });

  it("配置缺失(GHOST) → 503，未调用开通/未下单/未迁移、零写入", async () => {
    currentPlanRowFor = () => null;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "GHOST" }));
    expect(res.status).toBe(503);
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
    expect(callLog["billingrecord.create"] || 0).toBe(0);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
  it("配置读取异常(DB throw) → 503，未调用开通", async () => {
    forcePlanReadThrow = true;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(503);
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
  });
  it("目标缺失/空白 → 400 拒绝，未调用开通/未下单", async () => {
    currentPlanRowFor = () => FREE_ROW;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "" }));
    expect(res.status).toBe(400);
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
    expect(callLog["billingrecord.create"] || 0).toBe(0);
  });
  it("基础免费档 STANDARD(0/0) → 200 free:true，调用开通、未下单", async () => {
    currentPlanRowFor = () => FREE_ROW;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(provisionEnterpriseUpgrade).toHaveBeenCalledTimes(1);
    expect(callLog["billingrecord.create"] || 0).toBe(0); // 免费路径不下单
  });
  it("付费档 PRO(>0) → 200 创建 PENDING 订单，未调用直接开通、createCharge 被调用", async () => {
    currentPlanRowFor = () => PAID_ROW;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payUrl).toBeTruthy();
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
    expect(callLog["billingrecord.create"] || 0).toBe(1);
    expect(createCharge).toHaveBeenCalled();
  });
  it("零价非基础档 PRO → 拒绝(400)，不创建 0 元订单、不调用支付、不调用开通", async () => {
    currentPlanRowFor = () => ZERO_PRO_ROW;
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO" }));
    expect(res.status).toBe(400);
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
    expect(callLog["billingrecord.create"] || 0).toBe(0);
    expect(createCharge).not.toHaveBeenCalled();
  });
  it("基础档月0年正价（混合价）→ 拒绝(400)，不免费、零写入", async () => {
    currentPlanRowFor = () => ({ ...FREE_ROW, priceYearly: 10000 });
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", billingCycle: "MONTH" }));
    expect(res.status).toBe(400);
    expect(provisionEnterpriseUpgrade).not.toHaveBeenCalled();
    expect(callLog["billingrecord.create"] || 0).toBe(0);
  });
});
