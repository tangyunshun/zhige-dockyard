/**
 * R0-H 隔离回归：平台模型执行前成本准入止损（原方案 F11）。
 *
 * 覆盖 IDE-R0-H-PROMPT.md L01—L08：
 *  - L01/L02/L04：纯准入函数 decidePlatformModelCostAdmission（阈值/未知与免费/金额复算）；
 *  - L03：准入与 adapter.execute 使用同一份最终请求（提示词展开/输出上限一致，无检查后放大）；
 *  - L05：真实 runStudioPost 拒绝时零扣点/零流水/零 hold/零供应商 execute/无 RUNNING 任务；
 *  - L06：安全请求真实扣点 + 任务创建 + 失败原路退款；
 *  - L07：BYOK/真实结算分支未被改动的源码级证据；页面错误处理接线证据。
 *
 * 隔离说明：真实 runStudioPost + StudioExecutionDeps 注入（身份/合同/配额/扣点/退款全 fake 并计数）；
 * @/lib/prisma 为通用内存表（条件真实求值、$transaction 快照回滚、提交故障注入、写操作全记录）；
 * 准入计算与业务流程不 mock；限频器（studio-rate-limit）属 IO 边界以 spy 替换为放行并计数。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（通用表 + 条件求值 + 事务回滚/提交故障 + 写记录） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const fault = { commit: false };
  return { tables, writes, fault };
});

function getTable(name: string): Map<string, any> {
  if (!h.tables[name]) h.tables[name] = new Map();
  return h.tables[name];
}

function matchRow(row: any, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    // 复合键（userId_workspaceId 等）→ AND 子字段
    if (k.includes("_") && v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (row[k2] !== v2) return false;
      }
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      for (const [op, ov] of Object.entries(v)) {
        const rv = row[k];
        if (op === "not") {
          if (rv === ov) return false;
        } else if (op === "gt") {
          if (!(rv > ov)) return false;
        } else if (op === "lt") {
          if (!(rv < ov)) return false;
        } else if (op === "in") {
          if (!Array.isArray(ov) || !ov.includes(rv)) return false;
        } else if (op === "increment") {
          // 递增不是条件
        } else {
          return false; // 未实现操作符显式失败
        }
        continue;
      }
      continue;
    }
    const rv = row[k];
    if (v instanceof Date || rv instanceof Date) {
      const a = rv instanceof Date ? rv.getTime() : rv;
      const b = v instanceof Date ? v.getTime() : v;
      if (a !== b) return false;
    } else if (rv !== v) return false;
  }
  return true;
}

function applyData(row: any, data: any): any {
  const next = { ...row };
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "increment" in v) {
      next[k] = Number(next[k] ?? 0) + Number((v as any).increment);
    } else {
      next[k] = v;
    }
  }
  return next;
}

function selectFields(row: any, select: any) {
  if (!row) return null;
  if (!select) return { ...row };
  const out: any = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
}

function makePrisma() {
  let txDepth = 0;
  let txQueue: Promise<any> = Promise.resolve();
  const record = (kind: string, model: string, method: string) => h.writes.push(`${kind} ${model}.${method}`);

  const makeClient = (kind: "ROOT" | "TX") => {
    const model = (name: string) => {
      const rows = () => [...getTable(name).values()];
      const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
      const doWrite = (method: string, run: () => any, undoStore: (() => void)[] | null) => {
        record(kind, name, method);
        if (kind === "ROOT" && txDepth > 0) throw new Error("ROOT_WRITE_DURING_TX");
        const result = run();
        if (undoStore) {
          const snapshotRows = new Map(getTable(name));
          const afterRows = new Map(getTable(name));
          undoStore.push(() => {
            h.tables[name] = snapshotRows;
            void afterRows;
          });
        }
        return result;
      };
      return {
        findUnique: async ({ where, select }: any) => selectFields(findRow(where) ?? (null as any), select),
        findFirst: async ({ where, select }: any) => selectFields(findRow(where) ?? (null as any), select),
        findMany: async ({ where, select }: any) =>
          rows()
            .filter((r) => matchRow(r, where))
            .map((r) => selectFields(r, select)),
        count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
        create: async ({ data }: any) =>
          doWrite("create", () => {
            const row = { ...data };
            if (!row.id) row.id = `auto_${Math.random().toString(36).slice(2)}`;
            getTable(name).set(row.id, row);
            return { ...row };
          }, kind === "TX" ? currentUndo : null),
        update: async ({ where, data }: any) =>
          doWrite("update", () => {
            const row = findRow(where);
            if (!row) throw new Error(`P2025:${name}`);
            const next = applyData(row, data);
            getTable(name).set(row.id ?? where.id, next);
            return { ...next };
          }, kind === "TX" ? currentUndo : null),
        updateMany: async ({ where, data }: any) =>
          doWrite("updateMany", () => {
            let count = 0;
            for (const row of rows()) {
              if (matchRow(row, where)) {
                getTable(name).set(row.id, applyData(row, data));
                count++;
              }
            }
            return { count };
          }, kind === "TX" ? currentUndo : null),
        upsert: async ({ where, create, update }: any) =>
          doWrite("upsert", () => {
            const row = findRow(where);
            if (row) {
              const next = applyData(row, update);
              getTable(name).set(row.id, next);
              return { ...next };
            }
            const created = { ...create };
            if (!created.id) created.id = `auto_${Math.random().toString(36).slice(2)}`;
            getTable(name).set(created.id, created);
            return { ...created };
          }, kind === "TX" ? currentUndo : null),
      };
    };
    return new Proxy(
      {},
      { get: (_t, prop: string) => model(prop) },
    );
  };

  let currentUndo: (() => void)[] | null = null;
  const prismaProxy: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          return (fn: any) => {
            const run = async () => {
              txDepth++;
              const undo: (() => void)[] = [];
              const saved = currentUndo;
              currentUndo = undo;
              try {
                const r = await fn(makeClient("TX"));
                if (h.fault.commit) {
                  h.fault.commit = false;
                  throw new Error("INJECTED_COMMIT_FAIL");
                }
                return r;
              } catch (e) {
                for (let i = undo.length - 1; i >= 0; i--) undo[i]();
                throw e;
              } finally {
                currentUndo = saved;
                txDepth--;
              }
            };
            const p = txQueue.then(run, run);
            txQueue = p.catch(() => {});
            return p;
          };
        }
        return (makeClient("ROOT") as any)[prop];
      },
    },
  );
  return prismaProxy;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
// 限频/熔断为持久化 IO 边界：spy 放行并计数（准入计算与业务流程不 mock）
const checkStudioExecutionAllowed = vi.fn(async () => ({ ok: true as const }));
const recordStudioCircuitBreak = vi.fn(async () => {});
vi.mock("@/lib/studio-rate-limit", () => ({
  checkStudioExecutionAllowed,
  recordStudioCircuitBreak,
}));

// ══════════════ 依赖注入与夹具 ══════════════

import type { StudioExecutionDeps } from "@/app/api/studio/handler";

const fx = {
  consumeCalls: [] as any[],
  refundCalls: [] as any[],
  holdCalls: [] as any[],
  adapterExecuteCalls: [] as any[],
  adapterBehavior: "ok" as "ok" | "throw",
  pricing: null as any, // resolveDefaultDeployment 返回的 modelPlan.pricing
  contract: null as any,
};

function baseContract() {
  return {
    componentId: "comp-1",
    contractVersion: "v1",
    input: { kind: "TEXT" },
    output: { kind: "DOCUMENT", artifactMime: "text/markdown" },
    executionPlan: { steps: [{ promptTemplate: "你是一名专业分析师。请基于材料输出报告。{{COST_BASELINE}}" }] },
  };
}

// 默认可信成本：VERIFIED + CNY + 两侧已登记（成本远低于 100 点预算 → 安全请求可执行）
function trustedPricing(over: Record<string, unknown> = {}) {
  return {
    currency: "CNY",
    priceStatus: "VERIFIED",
    costInputMicrosPerMillion: 1000, // 1 微元/百万 Token → 极低
    costOutputMicrosPerMillion: 1000,
    markupRateBps: 0,
    ...over,
  };
}

function seed() {
  h.tables.workspace = new Map([["w1", { id: "w1", type: "PERSONAL", ownerId: "u1", name: "个人空间", plan: "STANDARD" }]]);
  h.tables.workspacemember = new Map();
  h.tables.componentcatalog = new Map([
    [
      "comp-1",
      {
        id: "comp-1", name: "测试组件", category: "ANALYSIS", description: "",
        contract: null, previewData: null, inputMode: "TEXT",
        estimatedModelTokens: 100, estimatedInputTokens: 500, estimatedOutputTokens: 100,
        activeContractId: "ct-1", detail: null, usageCount: 0,
      },
    ],
  ]);
  h.tables.componentusage = new Map();
  h.tables.componenttask = new Map();
  h.tables.tenant = new Map();
  h.tables.pointledger = new Map();
  h.tables.workspacequota = new Map([["q1", { id: "q1", workspaceId: "w1", tokenBalance: BigInt(10000), tokenUsed: 0 }]]);
  h.tables.systemconfig = new Map();
  h.tables.operationlog = new Map();
  h.tables.pointgrant = new Map();
  h.tables.user = new Map([["u1", { id: "u1", membershipLevel: "FREE" }]]);
  h.tables.membershiplevel = new Map();
  fx.consumeCalls = [];
  fx.refundCalls = [];
  fx.holdCalls = [];
  fx.adapterExecuteCalls = [];
  fx.adapterBehavior = "ok";
  fx.pricing = trustedPricing();
  fx.contract = baseContract();
  h.writes.length = 0;
  h.fault.commit = false;
  checkStudioExecutionAllowed.mockClear();
  recordStudioCircuitBreak.mockClear();
}

function makeDeps(): StudioExecutionDeps {
  // 夹具只实现本批路径用到的依赖面；类型经 unknown 断言（不削弱生产类型）
  return {
    prisma: (makePrisma() as any),
    getUserId: vi.fn(async () => "u1"),
    createModelAdapter: vi.fn(async (plan: any) => ({
      providerId: plan.providerId ?? "prov-1",
      modelId: plan.modelId ?? "model-1",
      execute: vi.fn(async (args: any) => {
        fx.adapterExecuteCalls.push(args);
        if (fx.adapterBehavior === "throw") {
          throw new Error("simulated model upstream failure");
        }
        return {
          text: "# 分析报告\n\n这是真实的模型输出成果物内容。",
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          latencyMs: 5,
        } as any;
      }),
    })),
    getActiveContractSnapshot: vi.fn(async () => ({
      snapshot: { snapshotId: "snap-1", snapshotCreatedAt: new Date().toISOString(), contract: fx.contract },
      contractId: "ct-1",
      contractVersion: "v1",
    })),
    requireWorkspaceMembership: vi.fn(async () => true),
    requireWorkspacePermission: vi.fn(async () => true),
    getRestrictedComponentIds: vi.fn(async () => [] as string[]),
    getOrCreateQuota: vi.fn(async () => ({ id: "q1", workspaceId: "w1", tokenBalance: BigInt(10000) })),
    checkAndResetQuotaCycle: vi.fn(async () => {}),
    resolveDefaultDeployment: vi.fn(async () => ({
      deploymentId: "dep-1",
      providerId: "prov-1",
      modelId: "model-1",
      contextLimit: 128000,
      pricing: fx.pricing,
    })),
    touchComponentUsage: vi.fn(async () => {}),
    writeAuditLog: vi.fn(async () => {}),
    creditService: {
      consumePoints: vi.fn(async (args: any) => {
        fx.consumeCalls.push(args);
        return {
          consumed: args.points,
          details: [],
          ledgerIds: ["led-1"],
          skipped: false,
          unlimited: false,
          balanceAfter: 10000 - args.points,
          monthlyTokenUsedIncremented: args.points,
        } as any;
      }),
      consumeAndCreateSettlementHold: vi.fn(async (args: any) => {
        fx.holdCalls.push(args);
        return { consumeResult: { consumed: args.points, details: [], ledgerIds: [], skipped: false, unlimited: false, balanceAfter: 0, monthlyTokenUsedIncremented: 0 } } as any;
      }),
      refundConsumedPoints: vi.fn(async (args: any) => {
        fx.refundCalls.push(args);
        return { ok: true } as any;
      }),
    },
    refundService: { enqueueRefundRecovery: vi.fn(async () => ({ ok: true })) },
    settlementService: {
      releaseSettlementHold: vi.fn(async () => ({ ok: true })),
      completeSettlement: vi.fn(async () => ({ ok: true })),
      enqueueSettlementRecovery: vi.fn(async () => ({ ok: true })),
    },
  } as unknown as StudioExecutionDeps;
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify({ action: "simulate", workspaceId: "w1", componentId: "comp-1", inputMaterial: "这是一段正常的文本输入材料。", ...body }),
  });
}

const call = async (body: Record<string, unknown> = {}) => {
  const { runStudioPost } = await import("@/app/api/studio/handler");
  const res = await runStudioPost(makeReq(body), makeDeps());
  return { status: res.status, body: await (res as any).json() };
};

beforeEach(seed);

// ══════════════ 纯准入函数（L01/L02/L04） ══════════════

// Independent review cases. Expected-defect assertions are not acceptance assertions.
import { afterAll, afterEach } from "vitest";
import fsReview from "node:fs";
import cryptoReview from "node:crypto";
const reviewEvidence: Array<Record<string, unknown>> = [];
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("TEST_TOKEN_SETTLEMENT_ENABLED", "false");
  vi.stubEnv("MODEL_MAX_OUTPUT_TOKENS", "2000");
});
afterEach(() => vi.unstubAllEnvs());

describe("independent R0-H evidence (expected findings remain)", () => {
  it("pure gate: exact 100-point boundary, rejects 101/150/200/201 without invoking any model", async () => {
    const { decidePlatformModelCostAdmission: decide } = await import("@/lib/model-cost-admission");
    const results = [];
    for (const points of [80, 100, 101, 150, 200, 201]) {
      const d = decide({ pricing: trustedPricing({ costInputMicrosPerMillion: points * 200000, costOutputMicrosPerMillion: 0 }), inputTokens: 50000, maxOutputTokens: 300, budgetPoints: 100, markupRateBps: 0 });
      expect(d.allowed).toBe(points <= 100);
      if (d.allowed) expect(d.conservativeCostPoints).toBe(points);
      results.push({ nominalBudget: 100, independentCostPoints: points, decision: d });
    }
    reviewEvidence.push({ scenario: "exact_boundaries", results });
  });

  it("H-BOUND: accepts non-CJK input using heuristic despite no verified token bound", async () => {
    const { estimateCombinedTokenCount, estimateTokenCount } = await import("@/lib/token-estimate");
    const material = "Ж".repeat(1000);
    expect(estimateTokenCount(material)).toBe(250);
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1000000000, costOutputMicrosPerMillion: 0, priceSource: "VERIFIED" });
    const r = await call({ inputMaterial: material });
    expect(r.status).toBe(200);
    expect(fx.adapterExecuteCalls).toHaveLength(1);
    const actual = fx.adapterExecuteCalls[0];
    const heuristicTokens = estimateCombinedTokenCount(actual.systemPrompt, actual.userPrompt);
    const nominalBudget = fx.consumeCalls[0].points;
    // Byte count is a diagnostic, not a claim about any real provider tokenizer.
    const utf8Bytes = Buffer.byteLength(actual.systemPrompt + actual.userPrompt, "utf8");
    expect(heuristicTokens).toBeLessThan(utf8Bytes);
    reviewEvidence.push({ id: "H-BOUND", scenario: "heuristic_only_handler_admission", httpStatus: r.status, materialCharacters: material.length, heuristicTokens, utf8Bytes, nominalBudget, consumeCalls: fx.consumeCalls.length, executeCalls: fx.adapterExecuteCalls.length, outputCap: actual.maxOutputTokens,
      limitation: "No real provider token count or loss asserted. This proves actual handler admits using only the unproven character heuristic, without a reliable-bound rejection path." });
  });

  it("H-BOUND: unrecognized supplemental pricing rule is ignored by both helper and handler", async () => {
    const { decidePlatformModelCostAdmission: decide } = await import("@/lib/model-cost-admission");
    const pricing = trustedPricing({ priceSource: "VERIFIED", rules: { reviewFixtureUnknownSurchargeMicrosPerRequest: 2000000 } });
    const d = decide({ pricing, inputTokens: 500, maxOutputTokens: 300, budgetPoints: 100, markupRateBps: 0 });
    expect(d.allowed).toBe(true);
    fx.pricing = pricing;
    const r = await call();
    expect(r.status).toBe(200);
    expect(fx.adapterExecuteCalls).toHaveLength(1);
    reviewEvidence.push({ id: "H-BOUND", scenario: "unknown_cost_rule_ignored", httpStatus: r.status, rule: Reflect.get(pricing, "rules"), decision: d, executeCalls: fx.adapterExecuteCalls.length,
      limitation: "Rule is deliberately synthetic and unsupported, not a claim about a real provider fee. Original policy requires rejecting unexplained monetary rules rather than silently ignoring them." });
  });

  it("H-MODE: fixed-compatibility guard also runs in an enabled settlement branch", async () => {
    vi.stubEnv("TEST_TOKEN_SETTLEMENT_ENABLED", "true");
    h.tables.systemconfig.set("settlement-mode", { id: "settlement-mode", key: "billing.settlementMode", value: "ALL" });
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1000000000, costOutputMicrosPerMillion: 1000, priceSource: "VERIFIED", priceVersion: 1, markupRateBps: 0, priceInputMicrosPerMillion: null, priceOutputMicrosPerMillion: null });
    const { isTokenSettlementFeatureEnabled } = await import("@/lib/token-settlement-service");
    const { isComponentSettlementEnabled, loadBillingConfig } = await import("@/lib/billing/billing-config");
    const { evaluateSettlementReadiness } = await import("@/lib/model-pricing");
    const cfg = await loadBillingConfig();
    const settlement = isComponentSettlementEnabled("comp-1", { globalFlag: isTokenSettlementFeatureEnabled(), whitelist: cfg.settlementComponentWhitelist, mode: cfg.settlementMode });
    expect(settlement).toBe(true);
    expect(evaluateSettlementReadiness(fx.pricing, { settlementFeatureEnabled: true })).toBe(true);
    const r = await call({ inputMaterial: "Ж".repeat(5000) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("MODEL_COST_EXCEEDS_BUDGET");
    expect(fx.holdCalls).toHaveLength(0);
    reviewEvidence.push({ id: "H-MODE", scenario: "settlement_true_intercepted_by_new_compatibility_guard", settlementEnabled: settlement, settlementReady: true, httpStatus: r.status, responseCode: r.body.code, holdCalls: fx.holdCalls.length, executeCalls: fx.adapterExecuteCalls.length,
      limitation: "Synthetic test-only flag/config, no production enablement, DB or actual hold. Demonstrates scope interception, not a requirement to enable or relax settlement." });
  });

  it("controls: oversized budget cost and missing pricing block before task/charge; valid low cost retains success", async () => {
    fx.pricing = null;
    const bad = await call();
    expect(bad.status).toBe(422);
    expect(fx.consumeCalls).toHaveLength(0);
    expect(fx.adapterExecuteCalls).toHaveLength(0);
    expect(h.tables.componenttask.size).toBe(0);
    seed();
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(fx.consumeCalls[0].points).toBe(100);
    expect([...h.tables.componenttask.values()][0].status).toBe("SUCCESS");
    reviewEvidence.push({ scenario: "positive_and_negative_controls", rejectedStatus: bad.status, successStatus: ok.status, chargedPoints: fx.consumeCalls[0].points });
  });
});

afterAll(() => {
  // Later fixes should fail the frozen expected-defect assertions without overwriting this evidence.
  if (reviewEvidence.length !== 5) return;
  const files = ["src/app/api/studio/handler.ts", "src/lib/model-cost-admission.ts", "src/lib/token-estimate.ts", "src/lib/model-pricing.ts", "src/lib/model-registry.ts", "src/lib/billing/billing-config.ts", "src/lib/token-settlement-service.ts", "src/app/api/__tests__/r0h-cost-admission.test.ts", "src/components/WorkspaceInternalLayoutV3.tsx"];
  const sha256 = Object.fromEntries(files.map(p => [p, cryptoReview.createHash("sha256").update(fsReview.readFileSync(p)).digest("hex")]));
  fsReview.writeFileSync("docs/reviews/R0-H-independent-review/handler-verification.json", JSON.stringify({ capturedAt: new Date().toISOString(), verdict: "NOT ACCEPTED: unproven cost-bound admission and settlement scope interception", reviewEvidence, sha256,
    isolation: "Actual runStudioPost and admission helper; copied closed-IO IDE fixtures, no business-source edits or network/DB. Expected-defect assertions passing is successful reproduction, not acceptance. Debit/refund functions are IO spies, not real ledger verification." }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
});
