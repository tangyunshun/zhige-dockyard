/**
 * R0-A4/A5 隔离回归测试。
 *
 * 覆盖：
 *   R0-A4 D1: option=delete 在 route/service/fulfill 三层被阻断，零业务写入
 *   R0-A4 D2: 写前配置一致性核验（快照 vs 当前 DB 变化 → 拒绝）
 *   R0-A4 D3 → R0-A5 E5: 升级响应协议（改为执行实际生产模块 resolveUpgradeResponse）
 *   R0-A5 E1: 一致性核验覆盖全部写入事实（资源/功能权益/赠送/名称）
 *   R0-A5 E2: retain/upgrade 最终核验前置到任何业务写入之前（无「先建再删」）
 *   R0-A5 E3: delete 迁移不分来源统一拒绝
 *
 * 隔离说明：与 r0a2/r0a3 相同，mock Prisma/鉴权/支付/赠送/迁移/守卫。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { WorkspacePlanConfig } from "@/constants/workspace-plans";

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

// [R0-A5 E4] 数据库行 fixture 补齐 WorkspacePlanConfig 全部必需字段（区分原始行与服务 DTO），
// 不使用 as any / @ts-ignore。行字段 id/isActive 仅存在于 DB 行，不进入 verifiedPlanConfig。
type PlanRowFixture = WorkspacePlanConfig & { id: string; isActive: boolean };

const FREE_ROW: PlanRowFixture = {
  id: "STANDARD", isActive: true,
  key: "STANDARD", name: "标准空间", description: "",
  priceMonthly: 0, priceYearly: 0, purchasable: true,
  maxComponents: 3, maxMembers: 5, maxStorage: 1024, maxApiCalls: 1000,
  maxConcurrency: 2, maxSingleFileBytes: 10485760,
  maxModelAllocations: 2, maxByoModels: 2, tokenLimit: 0,
  trialGift: { enabled: false, points: 0, expireDays: 0 },
  poolLowThreshold: 0,
  features: [], sortOrder: 10,
};
const PAID_PRO_ROW: PlanRowFixture = { ...FREE_ROW, id: "PRO", key: "PRO", name: "专业空间", priceMonthly: 19900, priceYearly: 199000, sortOrder: 5 };

// route 层已核验的快照：与 route 完全一致，通过真实 getWorkspacePlanStrict 生成
// （dbToConfig 会对 features 做动态派生，快照必须是同源 DTO，不能手拼原始行）
const snapshotViaStrict = async (row: PlanRowFixture): Promise<WorkspacePlanConfig> => {
  planRows = { STANDARD: row };
  const r = await getWorkspacePlanStrict("STANDARD");
  if (!r.ok) throw new Error(r.code);
  return r.config;
};

let planRows: Record<string, any> = {};
let planReadCount = 0;
// [R0-A5 E2] 模拟「route 读取之后、服务核验之前」配置被管理员改动
let planMutateOnRead: { atCount: number; row: any } | null = null;
let authBehavior: { valid: boolean; user: any } = { valid: true, user: { id: "u1", role: "USER" } };
const callLog: Record<string, number> = {};
// 记录 workspacequota 实际写入值
let wsqWrites: Record<string, any>[] = [];

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
              if (planMutateOnRead && planReadCount >= planMutateOnRead.atCount) {
                planRows[k] = planMutateOnRead.row;
              }
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
                if (id.startsWith("ws-ent")) { delete store.workspace[id]; n++; }
              }
              return { count: n };
            }
            case "workspacequota.findUnique":
              return { id: "wsq1", membershipLevelId: "FREE" };
            case "workspacequota.create":
              wsqWrites.push({ kind: "create", ...args.data });
              return { id: "wsq1" };
            case "workspacequota.update":
              wsqWrites.push({ kind: "update", id: args?.where?.id, ...args.data });
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
            case "asset.updateMany":
            case "conversation.updateMany":
            case "document.updateMany":
            case "integration.updateMany":
            case "project.updateMany":
            case "workspacepost.updateMany":
            case "postmember.updateMany":
            case "workspacekickhistory.updateMany":
            case "workspaceinvitation.updateMany":
            case "workspace_byo_model.updateMany":
            case "user_byo_model_assignment.updateMany":
            case "modelapplication.updateMany":
            case "workspace_member_model_preference.updateMany":
            case "quotaapply.updateMany":
            case "componentusage.updateMany":
            case "componenttask.updateMany":
              return { count: 0 };
            default:
              // R0-A4：未知 Prisma 操作显式失败
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
const { provisionEnterpriseUpgrade, upgradePersonalToEnterprise, fulfillEnterpriseUpgradeFromOrder } =
  await import("@/lib/workspace-upgrade-service");
// [R0-A5 E5] 实际生产协议模块（三个升级入口均导入同一实现，测试直接执行真实代码）
const { resolveUpgradeResponse } = await import("@/lib/upgrade-response-protocol");
const { grantNewSpaceTrialQuota } = await import("@/lib/new-space-trial-quota");
const { getWorkspacePlanStrict } = await import("@/lib/workspace-plan-service");

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
  wsqWrites = [];
  planRows = {};
  planReadCount = 0;
  planMutateOnRead = null;
  authBehavior = { valid: true, user: { id: "u1", role: "USER" } };
  (createCharge as any).mockClear();
  (grantNewSpaceTrialQuota as any).mockClear();
});

// ══════════════════════════════════════════════════════
// D1: option=delete 三层阻断
// ══════════════════════════════════════════════════════
describe("R0-A4 D1：delete 迁移方式三层阻断", () => {
  it("route 层：option=delete → 400 MIGRATION_OPTION_UNAVAILABLE，零业务写入", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "delete" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("MIGRATION_OPTION_UNAVAILABLE");
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspacemember.create"] || 0).toBe(0);
    expect(wsqWrites.length).toBe(0);
  });

  it("route 层：免费基础档 delete → 同样 400 拒绝", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "delete", billingCycle: "YEAR" }));
    expect(res.status).toBe(400);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });

  it("route 层：付费目标 delete → 同样 400 拒绝，零订单零支付", async () => {
    planRows = { PRO: PAID_PRO_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "PRO", option: "delete" }));
    expect(res.status).toBe(400);
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("服务层 provisionEnterpriseUpgrade：delete → MIGRATION_OPTION_UNAVAILABLE", async () => {
    planRows = { STANDARD: FREE_ROW };
    await expect(
      provisionEnterpriseUpgrade({
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "delete",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
      }),
    ).rejects.toThrow(/MIGRATION_OPTION_UNAVAILABLE/);
  });

  it("服务层 upgradePersonalToEnterprise：delete → MIGRATION_OPTION_UNAVAILABLE", async () => {
    planRows = { STANDARD: FREE_ROW };
    await expect(
      upgradePersonalToEnterprise({
        workspaceId: "personal-ws",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        option: "delete",
      }),
    ).rejects.toThrow(/MIGRATION_OPTION_UNAVAILABLE/);
  });

  it("fulfillEnterpriseUpgradeFromOrder：delete → MIGRATION_OPTION_UNAVAILABLE（历史订单防绕过）", async () => {
    // 创建一个带 delete option 的 PENDING 订单
    store.billingrecord["UP_test_delete"] = {
      id: "UP_test_delete",
      type: "PLAN_UPGRADE",
      status: "PENDING",
      userId: "u1",
      workspaceId: "personal-ws",
      metadata: {
        workspaceId: "personal-ws",
        option: "delete",
        targetPlan: "STANDARD",
        billingCycle: "MONTH",
        source: "SELF_SERVICE_PURCHASE",
      },
    };
    await expect(
      fulfillEnterpriseUpgradeFromOrder("UP_test_delete"),
    ).rejects.toThrow(/MIGRATION_OPTION_UNAVAILABLE/);
    // 确认没有产生业务写入
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
  });

  it("retain + upgrade 仍正常可用（不被 delete 阻断误伤）", async () => {
    planRows = { STANDARD: FREE_ROW };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(200);
    expect(store.workspace["personal-ws"].plan).toBe("FREE"); // retain 不改个人空间
    const created = Object.values(store.workspace).find((w: any) => w.id !== "personal-ws") as any;
    expect(created).toBeTruthy();
    expect(created.type).toBe("ENTERPRISE");
  });
});

// ══════════════════════════════════════════════════════
// D2: 写前配置一致性核验
// ══════════════════════════════════════════════════════
describe("R0-A4 D2：写前配置一致性核验", () => {
  it("快照 0/0 → 二次读变为正价 → PLAN_CONFIG_CHANGED 拒绝，零写入", async () => {
    // 第一次读取时是免费的
    planRows = { STANDARD: FREE_ROW };
    // 调用服务层直接传快照，但在调用前修改 DB 中的配置（模拟管理员改价）
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, priceMonthly: 19900, priceYearly: 199000 } };
    await expect(
      upgradePersonalToEnterprise({
        workspaceId: "personal-ws",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        billingCycle: "MONTH",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_CONFIG_CHANGED/);
    // 零写入
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
    expect(store.workspace["personal-ws"].type).toBe("PERSONAL");
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("快照 0/0 → 二次读变为停用 → PLAN_INACTIVE 拒绝", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, isActive: false } };
    await expect(
      upgradePersonalToEnterprise({
        workspaceId: "personal-ws",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        billingCycle: "MONTH",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_INACTIVE/);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
  });

  it("快照 0/0 → 二次读变为不可购买 → PLAN_NOT_PURCHASABLE_ONLINE 拒绝", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, purchasable: false } };
    await expect(
      upgradePersonalToEnterprise({
        workspaceId: "personal-ws",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        billingCycle: "MONTH",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_NOT_PURCHASABLE_ONLINE/);
    expect(store.workspace["personal-ws"].plan).toBe("FREE");
  });

  it("快照一致 → 正常免费开通（不误拦稳定配置）", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: FREE_ROW }; // 稳定，未变
    const r = await upgradePersonalToEnterprise({
      workspaceId: "personal-ws",
      targetPlanKey: "STANDARD",
      source: "SELF_SERVICE_PURCHASE",
      billingCycle: "MONTH",
      verifiedPlanConfig: snapshot,
    });
    expect(r.plan).toBe("STANDARD");
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
    // 账单为 0 SUCCESS
    const bills = Object.values(store.billingrecord) as any[];
    expect(bills.length).toBe(1);
    expect(bills[0].amount).toBe(0);
    expect(bills[0].status).toBe("SUCCESS");
  });

  it("workspacequota 实际写入值可断言（maxMembers 来自快照）", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: FREE_ROW };
    await upgradePersonalToEnterprise({
      workspaceId: "personal-ws",
      targetPlanKey: "STANDARD",
      source: "SELF_SERVICE_PURCHASE",
      billingCycle: "MONTH",
      verifiedPlanConfig: snapshot,
    });
    // 断言 workspacequota 实际写入的 enterpriseSlots 来自快照
    expect(wsqWrites.length).toBeGreaterThan(0);
    const lastWrite = wsqWrites[wsqWrites.length - 1];
    expect(lastWrite.enterpriseSlots).toBe(BigInt(FREE_ROW.maxMembers));
  });
});

// ══════════════════════════════════════════════════════
// R0-A5 E5: 升级响应协议（执行实际生产模块 resolveUpgradeResponse，
// 三个升级入口 page/弹窗均导入同一实现；不再手写副本）
// ══════════════════════════════════════════════════════
describe("R0-A5 E5：三入口统一响应协议（实际生产模块）", () => {
  it("success:true + payUrl → 待支付跳转，不当已开通", () => {
    const a = resolveUpgradeResponse({ success: true, payUrl: "https://pay.example/x", orderNo: "UP_1" });
    expect(a.kind).toBe("pay_redirect");
    if (a.kind === "pay_redirect") expect(a.payUrl).toBe("https://pay.example/x");
  });

  it("success:true + free:true + workspaceId → 免费完成（含开通证据）", () => {
    const a = resolveUpgradeResponse({ success: true, free: true, workspaceId: "ws1", message: "OK" });
    expect(a.kind).toBe("free_success");
    if (a.kind === "free_success") expect(a.workspaceId).toBe("ws1");
  });

  it("success:true + free:true 缺 workspaceId → failed，不当已开通", () => {
    const a = resolveUpgradeResponse({ success: true, free: true, message: "OK" });
    expect(a.kind).toBe("failed");
  });

  it("success:false + payUrl → failed，不得跳转收银台/不得显示订单创建成功", () => {
    const a = resolveUpgradeResponse({ success: false, payUrl: "https://pay.example/x", message: "失败" });
    expect(a.kind).toBe("failed");
    expect(a.kind).not.toBe("pay_redirect");
  });

  it("success:false + free:true → failed", () => {
    const a = resolveUpgradeResponse({ success: false, free: true, workspaceId: "ws1" });
    expect(a.kind).toBe("failed");
  });

  it("success:true 缺 payUrl/free → pending，不当已开通", () => {
    const a = resolveUpgradeResponse({ success: true, orderNo: "UP_1" });
    expect(a.kind).toBe("pending");
  });

  it("free + workspaceId + payUrl 同时出现 → 免费完成优先（完成证据优先于支付地址）", () => {
    const a = resolveUpgradeResponse({ success: true, free: true, workspaceId: "ws1", payUrl: "https://pay.example/x" });
    expect(a.kind).toBe("free_success");
  });

  it("HTTP 错误体（调用方传 null）→ failed", () => {
    expect(resolveUpgradeResponse(null).kind).toBe("failed");
  });

  it("网络异常（调用方传 undefined）→ failed", () => {
    expect(resolveUpgradeResponse(undefined).kind).toBe("failed");
  });

  it("非对象响应体 → failed", () => {
    expect(resolveUpgradeResponse("oops" as any).kind).toBe("failed");
  });
});

// ══════════════════════════════════════════════════════
// R0-A5 E1: 一致性核验覆盖全部实际写入事实（不只价格）
// ══════════════════════════════════════════════════════
describe("R0-A5 E1：一致性核验覆盖资源/功能权益/赠送", () => {
  const mutationCases: [string, (row: PlanRowFixture) => PlanRowFixture][] = [
    ["席位 maxMembers（99 席位）", (r) => ({ ...r, maxMembers: 99 })],
    ["存储 maxStorage（900MB）", (r) => ({ ...r, maxStorage: 900 })],
    ["组件上限 maxComponents", (r) => ({ ...r, maxComponents: 777 })],
    ["调用额度 maxApiCalls", (r) => ({ ...r, maxApiCalls: 500 })],
    ["功能权益 features 增项", (r) => ({ ...r, features: ["advanced_export"] })],
    ["赠送开关 trialGift.enabled", (r) => ({ ...r, trialGift: { enabled: true, points: 0, expireDays: 0 } })],
    ["赠送点数 trialGift.points（777 点）", (r) => ({ ...r, trialGift: { enabled: true, points: 777, expireDays: 0 } })],
    ["赠送期限 trialGift.expireDays", (r) => ({ ...r, trialGift: { enabled: true, points: 0, expireDays: 365 } })],
    ["套餐名 name（账单标题）", (r) => ({ ...r, name: "改名空间" })],
  ];

  for (const [label, mutate] of mutationCases) {
    it(`快照后 ${label} → PLAN_CONFIG_CHANGED 拒绝，零业务写/零赠送`, async () => {
      const snapshot = await snapshotViaStrict(FREE_ROW);
      planRows = { STANDARD: mutate(FREE_ROW) };
      await expect(
        upgradePersonalToEnterprise({
          workspaceId: "personal-ws",
          targetPlanKey: "STANDARD",
          source: "SELF_SERVICE_PURCHASE",
          billingCycle: "MONTH",
          verifiedPlanConfig: snapshot,
        }),
      ).rejects.toThrow(/PLAN_CONFIG_CHANGED/);
      // 零业务写入 + 零赠送
      expect(store.workspace["personal-ws"].plan).toBe("FREE");
      expect(store.workspace["personal-ws"].type).toBe("PERSONAL");
      expect(Object.keys(store.billingrecord).length).toBe(0);
      expect(wsqWrites.length).toBe(0);
      expect((grantNewSpaceTrialQuota as any).mock.calls.length).toBe(0);
    });
  }

  it("features 仅顺序变化（集合相同）→ 不误拦，正常开通", async () => {
    const snapshot = await snapshotViaStrict({ ...FREE_ROW, features: ["a", "b", "c"] });
    planRows = { STANDARD: { ...FREE_ROW, features: ["c", "a", "b"] } };
    const r = await upgradePersonalToEnterprise({
      workspaceId: "personal-ws",
      targetPlanKey: "STANDARD",
      source: "SELF_SERVICE_PURCHASE",
      billingCycle: "MONTH",
      verifiedPlanConfig: snapshot,
    });
    expect(r.plan).toBe("STANDARD");
    expect(store.workspace["personal-ws"].type).toBe("ENTERPRISE");
  });

  it("赠送一致（enabled+points+expireDays 全同）→ 不误拦，正常开通", async () => {
    const giftRow = { ...FREE_ROW, trialGift: { enabled: true, points: 300, expireDays: 60 } };
    const snapshot = await snapshotViaStrict(giftRow);
    planRows = { STANDARD: giftRow };
    const r = await upgradePersonalToEnterprise({
      workspaceId: "personal-ws",
      targetPlanKey: "STANDARD",
      source: "SELF_SERVICE_PURCHASE",
      billingCycle: "MONTH",
      verifiedPlanConfig: snapshot,
    });
    expect(r.plan).toBe("STANDARD");
    // 赠送入口按已核验配置调用（mock 赠送入账，真实入账由 grantNewSpaceTrialQuota 实现）
    expect((grantNewSpaceTrialQuota as any).mock.calls.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════
// R0-A5 E2: retain/upgrade 最终核验前置到任何业务写入之前
// ══════════════════════════════════════════════════════
describe("R0-A5 E2：provision 最终核验前置于任何业务写入", () => {
  it("retain：变价后 provision → PLAN_CONFIG_CHANGED，无建空间/成员、无配额/账单/赠送", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, priceMonthly: 19900, priceYearly: 199000 } };
    await expect(
      provisionEnterpriseUpgrade({
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "retain",
        targetPlanKey: "STANDARD",
        billingCycle: "MONTH",
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_CONFIG_CHANGED/);
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspacemember.create"] || 0).toBe(0);
    expect(callLog["workspace.deleteMany"] || 0).toBe(0); // 没有「先建再补偿删除」
    expect(wsqWrites.length).toBe(0);
    expect(Object.keys(store.billingrecord).length).toBe(0);
    expect((grantNewSpaceTrialQuota as any).mock.calls.length).toBe(0);
  });

  it("retain：停用后 provision → PLAN_INACTIVE，零写入", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, isActive: false } };
    await expect(
      provisionEnterpriseUpgrade({
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "retain",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_INACTIVE/);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });

  it("upgrade：变价后 provision → PLAN_CONFIG_CHANGED，零写入（含不改名）", async () => {
    const snapshot = await snapshotViaStrict(FREE_ROW);
    planRows = { STANDARD: { ...FREE_ROW, priceMonthly: 19900 } };
    await expect(
      provisionEnterpriseUpgrade({
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "upgrade",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: snapshot,
      }),
    ).rejects.toThrow(/PLAN_CONFIG_CHANGED/);
    expect(callLog["workspace.update"] || 0).toBe(0);
    expect(wsqWrites.length).toBe(0);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });

  it("retain：配置一致 → 正常创建企业空间（前置核验不误拦）", async () => {
    planRows = { STANDARD: FREE_ROW };
    const r = await provisionEnterpriseUpgrade({
      personalWorkspaceId: "personal-ws",
      userId: "u1",
      option: "retain",
      targetPlanKey: "STANDARD",
      source: "SELF_SERVICE_PURCHASE",
      verifiedPlanConfig: await snapshotViaStrict(FREE_ROW),
    });
    expect(r.newWorkspaceId).toBeTruthy();
    const created = Object.values(store.workspace).find((w: any) => w.id !== "personal-ws") as any;
    expect(created).toBeTruthy();
    expect(created.type).toBe("ENTERPRISE");
  });

  it("route+服务组合：route 读取后、provision 核验前变价 → 409 中文 message，retain 无 create 再 cleanup", async () => {
    planRows = { STANDARD: FREE_ROW };
    // 第 1 次 workspaceplan 读取 = route 严格读取（一致）；第 2 次 = provision 写前核验（变价）
    planMutateOnRead = { atCount: 2, row: { ...FREE_ROW, priceMonthly: 19900, priceYearly: 199000 } };
    const res = await workspaceUpgradePOST(upgradeReq({ targetPlan: "STANDARD", option: "retain" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("PLAN_CONFIG_CHANGED");
    expect(typeof data.message).toBe("string");
    expect(data.message).toContain("套餐配置");
    expect(callLog["workspace.create"] || 0).toBe(0);
    expect(callLog["workspace.deleteMany"] || 0).toBe(0);
    expect(Object.keys(store.billingrecord).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════
// R0-A5 E3: delete 迁移不分来源统一拒绝（含省略 source 的默认来源）
// ══════════════════════════════════════════════════════
describe("R0-A5 E3：provision 对 delete 全来源统一拒绝", () => {
  const sources: ("SELF_SERVICE_PURCHASE" | "ADMIN_MANUAL" | "SALES_SIGNUP" | undefined)[] = [
    "SELF_SERVICE_PURCHASE",
    "ADMIN_MANUAL",
    "SALES_SIGNUP",
    undefined,
  ];

  for (const source of sources) {
    it(`source=${source ?? "省略(默认)"} → MIGRATION_OPTION_UNAVAILABLE，零写入/零迁移/零赠送`, async () => {
      planRows = { STANDARD: FREE_ROW };
      const arg: any = {
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "delete" as const,
        targetPlanKey: "STANDARD",
      };
      if (source) arg.source = source;
      await expect(provisionEnterpriseUpgrade(arg)).rejects.toThrow(/MIGRATION_OPTION_UNAVAILABLE/);
      expect(callLog["workspace.create"] || 0).toBe(0);
      expect(callLog["workspacemember.create"] || 0).toBe(0);
      expect(callLog["workspace.update"] || 0).toBe(0);
      expect(callLog["asset.updateMany"] || 0).toBe(0); // 零资产迁移
      expect(callLog["workspace.deleteMany"] || 0).toBe(0); // 无孤儿补偿删除
      expect(Object.keys(store.billingrecord).length).toBe(0);
      expect(wsqWrites.length).toBe(0);
      expect((grantNewSpaceTrialQuota as any).mock.calls.length).toBe(0);
      expect(store.workspace["personal-ws"].plan).toBe("FREE");
    });
  }

  it("delete 即使携带已核验快照，也在任何核验/写入之前拒绝", async () => {
    planRows = { STANDARD: FREE_ROW };
    await expect(
      provisionEnterpriseUpgrade({
        personalWorkspaceId: "personal-ws",
        userId: "u1",
        option: "delete",
        targetPlanKey: "STANDARD",
        source: "SELF_SERVICE_PURCHASE",
        verifiedPlanConfig: await snapshotViaStrict(FREE_ROW),
      }),
    ).rejects.toThrow(/MIGRATION_OPTION_UNAVAILABLE/);
    expect(callLog["workspace.create"] || 0).toBe(0);
  });
});
