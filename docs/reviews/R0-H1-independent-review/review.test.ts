/**
 * R0-H/R0-H1 隔离回归：平台模型执行前成本准入止损（原方案 F11）+ 可信边界与模式隔离（H1）。
 *
 * 覆盖 IDE-R0-H-PROMPT.md L01—L08 与 IDE-R0-H1-PROMPT.md M01—M06：
 *  - 纯准入函数 decidePlatformModelCostAdmission：阈值（M04 100/101/150/200/201 精确边界）、
 *    未知与免费（M02）、UTF-8 字节上界（M01，字符粗估不再充当成本上界）、
 *    未知费用规则/缓存类别拒绝（M02）、金额独立复算（M04）；
 *  - 真实 runStudioPost：拒绝零副作用（L05）、最终请求一致（L03）、正常闭环与失败退款（L06）、
 *    三分支模式隔离（M03：固定兼容受准入 / BYOK 不套固定预算 / 合成已启用结算不套固定预算）；
 *  - 冻结边界源码级证据（L07）。
 *
 * 隔离说明：真实 runStudioPost + StudioExecutionDeps 注入（身份/合同/配额/扣点/退款全 fake 并计数）；
 * @/lib/prisma 为通用内存表（条件真实求值、$transaction 事务内写前快照回滚、提交故障注入、写操作全记录）；
 * 准入计算与业务流程不 mock；限频器（studio-rate-limit）属 IO 边界以 spy 替换为放行并计数；
 * BYOK 估算（estimatePoints）为账务 IO 以 mock 替换并断言结果透传。内存模型不证明 MySQL 行锁/隔离级别。
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
  let currentUndo: (() => void)[] | null = null;
  const record = (kind: string, model: string, method: string) => h.writes.push(`${kind} ${model}.${method}`);

  const makeClient = (kind: "ROOT" | "TX") => {
    const model = (name: string) => {
      const rows = () => [...getTable(name).values()];
      const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
      const doWrite = (method: string, mutate: () => any): any => {
        record(kind, name, method);
        if (kind === "ROOT" && txDepth > 0) throw new Error("ROOT_WRITE_DURING_TX");
        // [R0-H1 更正] 事务内写前采集快照（旧夹具写后采集，无法证明回滚）
        const undo = kind === "TX" ? currentUndo : null;
        const snapshotRows = undo ? new Map(getTable(name)) : null;
        const result = mutate();
        if (undo && snapshotRows) {
          const snap = snapshotRows;
          undo.push(() => {
            h.tables[name] = snap;
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
          }),
        update: async ({ where, data }: any) =>
          doWrite("update", () => {
            const row = findRow(where);
            if (!row) throw new Error(`P2025:${name}`);
            const next = applyData(row, data);
            getTable(name).set(row.id ?? where.id, next);
            return { ...next };
          }),
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
          }),
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
          }),
      };
    };
    return new Proxy({}, { get: (_t, prop: string) => model(prop) });
  };

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
// BYOK 账务估算为账务 IO：mock 并断言结果透传（resolvePricingSource/splitTokenEstimate 用真实实现）
const estimatePoints = vi.fn(async () => ({
  basis: "CONVERTED_PRICE",
  points: 7,
  snapshot: { source: "BYOK_OFFICIAL", note: "fixture" },
  blockedReason: null,
}));
vi.mock("@/lib/billing/pricing-center", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/pricing-center")>();
  return { ...actual, estimatePoints };
});
// BYOK 指定部署解析为注册表 IO：mock 为返回 fx 夹具计划（resolveDefaultDeployment 走 deps fake）
const resolveDeploymentForWorkspace = vi.fn(async (args: any) => ({
  source: "BYO" as const,
  deploymentId: args?.targetDeploymentId ?? "byo:w1",
  providerId: "prov-1",
  modelId: "model-1",
  upstreamModelId: "model-1",
  protocol: "openai",
  baseUrl: "http://fixture.invalid",
  apiKey: "fixture-key",
  contextLimit: 128000,
  pricing: null as any, // 运行时从 fx.pricing 取（见下方实现）
}));
vi.mock("@/lib/model-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/model-registry")>();
  return {
    ...actual,
    resolveDeploymentForWorkspace: (...args: any[]) =>
      resolveDeploymentForWorkspace(args[0]).then((plan: any) => ({ ...plan, pricing: fx.pricing })),
  };
});

// ══════════════ 依赖注入与夹具 ══════════════

import type { StudioExecutionDeps } from "@/app/api/studio/handler";

const fx = {
  consumeCalls: [] as any[],
  refundCalls: [] as any[],
  holdCalls: [] as any[],
  releaseCalls: [] as any[],
  completeCalls: [] as any[],
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
    requiredCapabilities: ["TEXT_GENERATION"],
    executionPlan: {
      steps: [{ promptTemplate: "你是一名专业分析师。请基于材料输出报告。{{COST_BASELINE}}", requiredCapabilities: ["TEXT_GENERATION"] }],
    },
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
    rules: null,
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
  h.tables.workspacequota = new Map([["q1", { id: "q1", workspaceId: "w1", tokenBalance: 10000, tokenUsed: 0 }]]);
  h.tables.systemconfig = new Map();
  h.tables.operationlog = new Map();
  h.tables.pointgrant = new Map();
  h.tables.user = new Map([["u1", { id: "u1", membershipLevel: "FREE" }]]);
  h.tables.membershiplevel = new Map();
  fx.consumeCalls = [];
  fx.refundCalls = [];
  fx.holdCalls = [];
  fx.releaseCalls = [];
  fx.completeCalls = [];
  fx.adapterExecuteCalls = [];
  fx.adapterBehavior = "ok";
  fx.pricing = trustedPricing();
  fx.contract = baseContract();
  h.writes.length = 0;
  h.fault.commit = false;
  checkStudioExecutionAllowed.mockClear();
  recordStudioCircuitBreak.mockClear();
  estimatePoints.mockClear();
  delete process.env.TEST_TOKEN_SETTLEMENT_ENABLED;
}

function makeDeps(): StudioExecutionDeps {
  // 夹具只实现本批路径用到的依赖面；类型经 unknown 断言（不削弱生产类型）
  return {
    prisma: makePrisma() as any,
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
        return {
          consumeResult: {
            consumed: args.points, details: [], ledgerIds: ["led-hold"], skipped: false,
            unlimited: false, balanceAfter: 0, monthlyTokenUsedIncremented: 0,
          },
        } as any;
      }),
      refundConsumedPoints: vi.fn(async (args: any) => {
        fx.refundCalls.push(args);
        return { ok: true } as any;
      }),
    },
    refundService: { enqueueRefundRecovery: vi.fn(async () => ({ ok: true })) },
    settlementService: {
      releaseSettlementHold: vi.fn(async () => {
        fx.releaseCalls.push(1);
        return { ok: true };
      }),
      completeSettlement: vi.fn(async () => {
        fx.completeCalls.push(1);
        return { ok: true };
      }),
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

const call = async (body: Record<string, unknown> = {}, deps?: StudioExecutionDeps) => {
  const { runStudioPost } = await import("@/app/api/studio/handler");
  const res = await runStudioPost(makeReq(body), deps ?? makeDeps());
  return { status: res.status, body: await (res as any).json() };
};

beforeEach(seed);

// ══════════════ 纯准入函数（M01/M02/M04） ══════════════

// Expected residual-finding assertions are reproduction evidence, not acceptance.
import { afterEach, afterAll } from "vitest";
import fsReview from "node:fs";
import cryptoReview from "node:crypto";
const evidence: Array<Record<string,unknown>>=[];
beforeEach(()=>{vi.stubEnv("NODE_ENV","test");vi.stubEnv("TEST_TOKEN_SETTLEMENT_ENABLED","false");vi.stubEnv("MODEL_MAX_OUTPUT_TOKENS","2000");});
afterEach(()=>vi.unstubAllEnvs());
describe("independent bounded R0-H1 review",()=>{
  it("arithmetic: exact 100/101/150/200/201 under current byte formula",async()=>{
    const {decidePlatformModelCostAdmission:decide}=await import("@/lib/model-cost-admission");
    const results=[];
    for(const points of [100,101,150,200,201]){
      const d=decide({pricing:trustedPricing({costInputMicrosPerMillion:points*10000,costOutputMicrosPerMillion:0}),systemPrompt:"x".repeat(1000000-128),userPrompt:"",maxOutputTokens:0,budgetPoints:100,markupRateBps:0});
      expect(d.allowed).toBe(points===100);if(d.allowed){expect(d.inputTokenUpperBound).toBe(1000000);expect(d.conservativeCostPoints).toBe(100);}results.push({points,decision:d});
    }
    evidence.push({scenario:"arithmetic_only",results,limitation:"Arithmetic correctness does not certify the protocol allowance or tokenizer applicability."});
  });
  it("H-BOUND remains: no model/protocol-specific bound evidence, yet all protocols are admitted",async()=>{
    const {decidePlatformModelCostAdmission:decide}=await import("@/lib/model-cost-admission");
    const rows=[];
    for(const protocol of ["OPENAI_COMPATIBLE","ANTHROPIC","GEMINI"]){
      seed();fx.pricing=trustedPricing({costInputMicrosPerMillion:1000000,costOutputMicrosPerMillion:1000});
      const deps=makeDeps();
      (deps.resolveDefaultDeployment as any).mockResolvedValue({deploymentId:"dep-1",providerId:"prov-1",modelId:"model-1",upstreamModelId:"model-1",protocol,contextLimit:0,pricing:fx.pricing});
      const r=await call({},deps);expect(r.status).toBe(200);expect(fx.adapterExecuteCalls).toHaveLength(1);expect(fx.consumeCalls).toHaveLength(1);
      const request=fx.adapterExecuteCalls[0],d=decide({pricing:fx.pricing,systemPrompt:request.systemPrompt,userPrompt:request.userPrompt,maxOutputTokens:request.maxOutputTokens,budgetPoints:100,markupRateBps:0});
      expect(d.allowed).toBe(true);const bytes=Buffer.byteLength(request.systemPrompt,"utf8")+Buffer.byteLength(request.userPrompt,"utf8");
      if(d.allowed){expect(d.inputTokenUpperBound).toBe(bytes+128);expect(d.inputBoundSource).toBe("UTF8_BYTES_PLUS_FRAMING");}
      rows.push({protocol,contextLimit:0,httpStatus:r.status,consumeCalls:fx.consumeCalls.length,executeCalls:fx.adapterExecuteCalls.length,promptBytes:bytes,decision:d});
    }
    evidence.push({id:"H-BOUND-REMAINDER",scenario:"protocol_and_verified_bound_not_required",rows,limitation:"Adapter creation/execution and registry are isolated IO. No real provider token counts or financial loss claimed. Shows handler cannot reject a missing/unsupported applicability proof because the formula is unconditional."});
  });
  it("unknown rules/cache costs now reject, empty rules and explicit free retain positive controls",async()=>{
    const rows=[];
    for(const patch of [{rules:{unexplainedCost:{amountMicros:2000000}}},{costCacheWriteMicrosPerMillion:1000}]){
      seed();fx.pricing=trustedPricing(patch);const r=await call();expect(r.status).toBe(422);expect(r.body.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");expect(fx.consumeCalls).toHaveLength(0);expect(fx.holdCalls).toHaveLength(0);expect(fx.adapterExecuteCalls).toHaveLength(0);expect(h.tables.componenttask.size).toBe(0);rows.push({patch,status:r.status,code:r.body.code});
    }
    seed();fx.pricing=trustedPricing({priceStatus:"FREE",costInputMicrosPerMillion:0,costOutputMicrosPerMillion:0,rules:{}});const free=await call();expect(free.status).toBe(200);expect(fx.consumeCalls[0].points).toBe(100);
    evidence.push({scenario:"rules_cache_and_free",rows,freeStatus:free.status});
  });
  it("actual modes: compatibility is guarded; synthetic ready settlement and BYOK avoid that fixed guard",async()=>{
    fx.pricing=trustedPricing({costInputMicrosPerMillion:2000000000,costOutputMicrosPerMillion:0,priceSource:"VERIFIED"});
    const compat=await call({inputMaterial:"Ж".repeat(5000)});expect(compat.status).toBe(400);expect(fx.adapterExecuteCalls).toHaveLength(0);
    seed();vi.stubEnv("TEST_TOKEN_SETTLEMENT_ENABLED","true");h.tables.systemconfig.set("mode",{key:"billing.settlementMode",value:"ALL"});
    fx.pricing=trustedPricing({costInputMicrosPerMillion:2000000000,costOutputMicrosPerMillion:0,priceSource:"VERIFIED",priceInputMicrosPerMillion:null,priceOutputMicrosPerMillion:null});
    const {evaluateSettlementReadiness}=await import("@/lib/model-pricing");expect(evaluateSettlementReadiness(fx.pricing,{settlementFeatureEnabled:true})).toBe(true);
    const settlement=await call({inputMaterial:"Ж".repeat(5000)});expect([200,202]).toContain(settlement.status);expect(fx.holdCalls).toHaveLength(1);expect(fx.consumeCalls).toHaveLength(0);expect(fx.adapterExecuteCalls).toHaveLength(1);
    const settlementCounters={hold:fx.holdCalls.length,execute:fx.adapterExecuteCalls.length};
    seed();vi.stubEnv("TEST_TOKEN_SETTLEMENT_ENABLED","false");estimatePoints.mockResolvedValue({basis:"CONVERTED_PRICE",points:7,snapshot:{fixture:true},blockedReason:null} as any);fx.pricing=trustedPricing({costInputMicrosPerMillion:2000000000});
    const byo=await call({deploymentId:"byo:w1"});expect(byo.status).toBe(200);expect(fx.consumeCalls[0].points).toBe(7);
    evidence.push({scenario:"mode_matrix",compatStatus:compat.status,settlementStatus:settlement.status,settlementCounters,byoStatus:byo.status,byoPoints:fx.consumeCalls[0].points,limitation:"Only synthetic test-only flag and in-memory config; no production switch/actual hold/provider."});
  });
  it("normal request and upstream failure keep task and refund invocation behavior",async()=>{
    const success=await call();expect(success.status).toBe(200);expect(fx.consumeCalls[0].points).toBe(100);expect([...h.tables.componenttask.values()][0].status).toBe("SUCCESS");
    seed();fx.adapterBehavior="throw";const failure=await call();expect(failure.status).toBe(502);expect(fx.refundCalls).toHaveLength(1);expect([...h.tables.componenttask.values()][0].status).toBe("FAILED");
    evidence.push({scenario:"task_and_refund_calls",successStatus:success.status,failureStatus:failure.status,refundCalls:fx.refundCalls.length,limitation:"Accounting functions are IO spies, not real source-ledger verification."});
  });
});
afterAll(()=>{
  if(evidence.length!==5)return;
  const files=["src/app/api/studio/handler.ts","src/lib/model-cost-admission.ts","src/app/api/__tests__/r0h-cost-admission.test.ts","src/lib/model-adapter.ts","src/lib/model-pricing.ts","src/lib/token-settlement-service.ts","src/components/WorkspaceInternalLayoutV3.tsx","tsconfig.json"];
  const sha256=Object.fromEntries(files.map(p=>[p,cryptoReview.createHash("sha256").update(fsReview.readFileSync(p)).digest("hex")]));
  fsReview.writeFileSync("docs/reviews/R0-H1-independent-review/handler-verification.json",JSON.stringify({capturedAt:new Date().toISOString(),verdict:"NOT ACCEPTED: one original H-BOUND remainder (unconditional UTF8 + unverified 128 framing for every model/protocol)",evidence,sha256,isolation:"Actual handler/helper; copied closed-IO fixtures, no business-source edits/DB/network/paid calls. Passing expected-defect assertions means reproduction, not acceptance."},(_k,v)=>typeof v==="bigint"?v.toString():v,2));
});
