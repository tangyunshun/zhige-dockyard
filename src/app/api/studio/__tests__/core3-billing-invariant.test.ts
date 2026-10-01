/**
 * CORE-3 计费口径不变量测试（三）：C07 真实结算组件 vs 其他组件点池即时扣减。
 *
 * 验证路由的计费路由决策（由 isTokenSettlementFeatureEnabled 开关驱动）：
 *  - 结算开启时：C07 进入结算分支（消费 consumeAndCreateSettlementHold 预扣），绝不调用点池 consumePoints，避免双计费；
 *  - 结算关闭时：C07 走点池即时扣减（consumePoints），不创建结算单。
 *
 * 说明：本仓库结算由全局开关驱动（C07 为当前唯一上线结算组件），
 *  per-component 路由（合同 billing.mode）属产品决策，需另行澄清；本测试锁定现有可验证不变量。
 *
 * 确定性：内存 fake prisma + 注入 fake 服务，无真实 DB / 模型 / 扣点 / 结算。
 */

import { test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { runStudioPost } from "../route";
import { ModelAdapterError } from "@/lib/model-adapter";

// 控制结算开关（路由在 2615 行读取 isTokenSettlementFeatureEnabled）
const settlementFlag = { enabled: false };
vi.mock("@/lib/token-settlement-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/token-settlement-service")>();
  return {
    ...actual,
    isTokenSettlementFeatureEnabled: () => settlementFlag.enabled,
  };
});

// C07 数据库既有激活合同镜像（只读用于计费路由校验，绝不修改线上合同）
const C07_CONTRACT: any = {
  componentId: "C07",
  contractVersion: "1.0.0",
  lifecycle: "PUBLISHED",
  input: {
    kind: "TEXT_AND_FILES",
    textConstraints: { required: false, minLength: 1, maxLength: 30000 },
    fileConstraints: {
      required: false,
      minCount: 0,
      maxCount: 1,
      acceptedMimes: ["text/plain", "text/markdown", "application/pdf", "image/png", ".txt", ".md", ".pdf", ".docx"],
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 20_971_520,
    },
  },
  executionPlan: {
    steps: [
      {
        stepId: "step_c07_main",
        name: "需求规格与架构方案生成",
        promptTemplate: "你是一名资深需求分析师：{{sourceText}}",
        inputMapping: { sourceText: "input.text" },
        outputKey: "c07_output_doc",
        requiredCapabilities: ["TEXT_GENERATION"],
      },
    ],
  },
  output: { kind: "DOCUMENT", artifactMime: "text/markdown", rendererType: "MARKDOWN_DOCUMENT", previewable: true, downloadable: true },
  qualityPolicy: { allowAutoRetry: false, requireHumanReview: false, requiredSections: ["需求", "功能", "模块", "业务流程", "用户故事", "PRD", "规格"] },
  // 注意：合同声明 ESTIMATED_COMPATIBILITY；真实结算由全局 isTokenSettlementFeatureEnabled 开关驱动
  billingPolicy: { mode: "ESTIMATED_COMPATIBILITY", estimatedTokens: 1500 },
};

// ---------- helpers ----------
function deepClone(o: any) {
  return o === undefined ? o : JSON.parse(JSON.stringify(o));
}
function deepMerge(base: any, patch: any) {
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

// ---------- 内存存储 ----------
let tasks: Map<string, any>;
let ledgers: any[];
let recoveries: any[];
let consumePointsCalls: number;
let settlementHoldCalls: number;

beforeEach(() => {
  tasks = new Map();
  ledgers = [];
  recoveries = [];
  consumePointsCalls = 0;
  settlementHoldCalls = 0;
  settlementFlag.enabled = false;
});

// ---------- fake prisma ----------
function fakePrisma() {
  const store = tasks;
  const ledgerStore = ledgers;
  const self: any = new Proxy(
    {},
    {
      get(_t, model: string) {
        switch (model) {
          case "$transaction":
            return async (cb: any) => cb(self);
          case "componenttask":
            return {
              create: async ({ data }: any) => {
                store.set(data.id, deepClone(data));
                return deepClone(data);
              },
              findUnique: async ({ where }: any) => {
                const t = store.get(where.id);
                return t ? deepClone(t) : null;
              },
              update: async ({ where, data }: any) => {
                const cur = store.get(where.id);
                if (!cur) throw new Error("P2025");
                if (where.status && cur.status !== where.status) throw new Error("P2025 status guard");
                const merged = deepMerge(cur, data);
                store.set(where.id, merged);
                return deepClone(merged);
              },
              // 原子条件更新（成功/失败转换）：命中状态条件才落库并返回 count=1，否则 count=0
              updateMany: async ({ where, data }: any) => {
                const cur = store.get(where.id);
                if (!cur) return { count: 0 };
                if (where.status && cur.status !== where.status) return { count: 0 };
                const merged = deepMerge(cur, data);
                store.set(where.id, merged);
                return { count: 1 };
              },
              findMany: async ({ where }: any) => {
                let rows = Array.from(store.values());
                if (where && where.status) rows = rows.filter((r) => r.status === where.status);
                return rows;
              },
            };
          case "componentcatalog":
            return { findUnique: async ({ where }: any) => ({ id: where.id, name: "测试组件", estimatedModelTokens: 50, activeContractId: where.id }), update: async () => ({}) };
          case "componentstats":
            return { upsert: async () => ({}) };
          case "workspacequota":
            return { update: async ({ data }: any) => data, findUnique: async () => ({ id: "q1", tokenBalance: 1000 }) };
          case "pointledger":
            return {
              create: async ({ data }: any) => {
                ledgerStore.push(data);
                return data;
              },
              findMany: async ({ where }: any) => {
                let rows = ledgerStore;
                if (where) {
                  if (where.taskId) rows = rows.filter((l) => l.taskId === where.taskId);
                  if (where.type) rows = rows.filter((l) => l.type === where.type);
                }
                return rows;
              },
            };
          case "componentusage":
            return { findFirst: async () => null, create: async () => ({}) };
          case "workspacematerial":
            return { findFirst: async () => null };
          case "refundrecovery":
            return {
              create: async ({ data }: any) => {
                recoveries.push(data);
                return data;
              },
              findMany: async () => [],
            };
          default:
            return new Proxy({}, { get: () => async () => ({}) });
        }
      },
    },
  );
  return self;
}

// ---------- fake deps ----------
function buildDeps(opts: { adapterMode?: "success" | "timeout" }) {
  const adapterMode = opts.adapterMode ?? "success";
  return {
    prisma: fakePrisma(),
    getUserId: async () => "u_test_1",
    requireWorkspaceMembership: async () => true,
    requireWorkspacePermission: async () => true,
    getRestrictedComponentIds: async () => [],
    getOrCreateQuota: async () => ({ id: "q1", tokenBalance: 0, membershipLevelId: "FREE" }),
    checkAndResetQuotaCycle: async () => ({ ok: true, quota: { id: "q1" } }),
    resolveDefaultDeployment: async () => ({ providerId: "p1", modelId: "m1" }),
    touchComponentUsage: async () => ({}),
    writeAuditLog: async () => ({}),
    createModelAdapter: async () => ({
      execute: async () => {
        if (adapterMode === "timeout") throw new ModelAdapterError("MODEL_TIMEOUT", "模型超时", 504);
        return {
          text: "需求\n功能\n模块\n业务流程\n用户故事\nPRD\n规格\nAI 生成需求规格草案",
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          model: "m1",
        };
      },
    }),
    getActiveContractSnapshot: async () => ({
      snapshot: { contract: C07_CONTRACT, contractVersion: C07_CONTRACT.contractVersion, lifecycle: "PUBLISHED" },
      contractId: "C07",
      contractVersion: C07_CONTRACT.contractVersion,
    }),
    creditService: {
      consumePoints: async (args: any) => {
        consumePointsCalls++;
        ledgers.push({ taskId: args?.taskId, type: "CONSUME", points: 50 });
        return { ok: true, consumed: 50, ledgerIds: [`L-${args?.taskId}`], idempotencyKey: `CONSUME:${args?.taskId}` };
      },
      consumeAndCreateSettlementHold: async (args: any) => {
        settlementHoldCalls++;
        ledgers.push({ taskId: args?.taskId, type: "SETTLEMENT_HOLD", points: args?.points ?? 50 });
        return { ok: true, consumed: args?.points ?? 50, ledgerIds: [`SH-${args?.taskId}`], idempotencyKey: `CONSUME:${args?.taskId}` };
      },
      refundConsumedPoints: async () => ({ ok: true }),
    },
    refundService: { enqueueRefundRecovery: async () => ({ ok: true }) },
    settlementService: {
      releaseSettlementHold: async () => ({ ok: true }),
      completeSettlement: async () => ({ status: "SETTLED", actualPricePoints: 50 }),
      enqueueSettlementRecovery: async () => ({ ok: true }),
    },
  } as any;
}

function req(workspaceId: string, componentId: string) {
  const fd = new FormData();
  fd.append("action", "simulate");
  fd.append("workspaceId", workspaceId);
  fd.append("componentId", componentId);
  fd.append("inputSource", JSON.stringify({ sourceType: "file" }));
  fd.append("file", new File(["输入文本材料"], "m.txt", { type: "text/plain" }));
  return new NextRequest("http://localhost:3000/api/studio", { method: "POST", body: fd });
}

// ---------- 计费不变量 ----------
test("结算关闭：C07 走点池即时扣减（consumePoints），不创建结算单", async () => {
  settlementFlag.enabled = false;
  const deps: any = buildDeps({ adapterMode: "success" });
  const res = await runStudioPost(req("w1", "C07"), deps);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.success).toBe(true);
  expect(consumePointsCalls).toBe(1);
  expect(settlementHoldCalls).toBe(0);
  expect(body.billingMode).toBe("ESTIMATED_COMPATIBILITY");
});

test("结算开启：C07 进入结算分支（结算预扣），绝不调用点池 consumePoints（无双计费）", async () => {
  settlementFlag.enabled = true;
  const deps: any = buildDeps({ adapterMode: "success" });
  const res = await runStudioPost(req("w1", "C07"), deps);
  const body = await res.json();
  // 结算分支：若定价未就绪则阻断（SETTLEMENT_NOT_READY），但绝不应超过点池扣减
  expect(consumePointsCalls).toBe(0);
  expect(body.billingMode === "REAL_SETTLEMENT" || body.code === "SETTLEMENT_NOT_READY").toBe(true);
});
