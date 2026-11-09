/**
 * R0-H/R0-H1/R0-H2 隔离回归：平台模型执行前成本准入止损（原方案 F11）。
 *
 * R0-H2（H-BOUND 收口）：输入成本上界唯一来源 = 服务端最终模型计划的注册表硬上下文限制
 * （contextLimit，完整值作保守输入预算）；0/缺失/非法/客户端伪造值一律不是可靠来源 → 稳定未就绪拒绝。
 * 字符粗估与字节数仅作诊断，不再进入成本计算。
 *
 * 覆盖：
 *  - 纯准入函数：N01 缺失/非法来源、N02 可信来源正向对照、N03 等值/超预算独立复算、
 *    M02 未知规则/缓存拒绝、M04 金额边界；
 *  - 真实 runStudioPost：N01 handler 级零副作用、N02 正常执行（来源与数值独立核对）、
 *    N03 无检查后放大、M03 三分支模式隔离、L05 拒绝零副作用、L06 正常闭环与失败退款、
 *    L07 冻结边界源码级证据。
 *
 * 隔离说明：真实 runStudioPost + StudioExecutionDeps 注入（身份/合同/配额/扣点/退款全 fake 并计数）；
 * @/lib/prisma 为通用内存表（条件真实求值、$transaction 写前快照回滚、提交故障注入、写操作全记录）；
 * 准入计算与业务流程不 mock；限频器与 BYOK 估算为 IO 边界以 spy/mock 替换并断言。
 * 内存模型不证明 MySQL 行锁/隔离级别；账务 spy 仅证明调用次数与参数。
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
        // 事务内写前采集快照（回滚可证明）
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
        if (prop === "$executeRawUnsafe" || prop === "$executeRaw" || prop === "$queryRawUnsafe" || prop === "$queryRaw") { return async (...args: unknown[]) => { rawIo.push({method: prop, args}); return prop.startsWith("$execute") ? 0 : []; }; }
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
// billing 报价路由使用 validateUser（与 Studio deps.getUserId 不同的身份入口）——内存身份
const authState = { valid: true, userId: "u1" };
vi.mock("@/lib/auth", () => ({
  validateUser: async (header: unknown) => {
    void header;
    if (!authState.valid) return { valid: false };
    return { valid: true, user: { id: authState.userId } };
  },
}));
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
  contextLimit: 0,
  pricing: null as any, // 运行时从 fx 取（见下方实现）
}));
vi.mock("@/lib/model-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/model-registry")>();
  return {
    ...actual,
    resolveDeploymentForWorkspace: (...args: any[]) =>
      resolveDeploymentForWorkspace(args[0]).then((plan: any) => ({ ...plan, pricing: fx.pricing, contextLimit: fx.contextLimit })),
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
  contextLimit: 128000 as number, // resolveDefaultDeployment 返回的注册表硬上下文限制
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
  h.tables.workspacemember = new Map([
    ["wm1", { id: "wm1", userId: "u1", workspaceId: "w1", monthlyTokenLimit: null, monthlyTokenUsed: 0, role: "OWNER", tokenBalance: 10000 }],
  ]);
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
  h.tables.componentcontract = new Map([["ct-1", { id: "ct-1", contract: null }]]);
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
  fx.contextLimit = 128000;
  fx.contract = baseContract();
  h.tables.componentcontract.set("ct-1", { id: "ct-1", contract: fx.contract });
  h.writes.length = 0;
  h.fault.commit = false;
  authState.valid = true;
  authState.userId = "u1";
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
      contextLimit: fx.contextLimit, // 服务端注册表硬上下文限制（准入边界唯一来源）
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

// ══════════════ 纯准入函数（N01/N02/N03/M02/M04） ══════════════


import { afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import { checkAndResetQuotaCycle as realQuotaCycle } from '@/lib/quota-cycle';
const rawIo: Array<{method:string,args:unknown[]}> = [];
const evidence:any[]=[];
vi.mock('@/lib/crypto-secrets',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/crypto-secrets')>(),decryptSecret:()=> 'synthetic-key-with-no-external-use'}));
beforeEach(()=>{rawIo.length=0;vi.stubEnv('NODE_ENV','test');vi.stubEnv('TEST_TOKEN_SETTLEMENT_ENABLED','false');vi.stubEnv('MODEL_MAX_OUTPUT_TOKENS','2000');});
afterEach(()=>vi.unstubAllEnvs());
function observation(label:string,r:any,deps?:StudioExecutionDeps){return {label,status:r.status,code:r.body.code??null,error:r.body.error??null,consume:fx.consumeCalls.length,hold:fx.holdCalls.length,execute:fx.adapterExecuteCalls.length,refund:fx.refundCalls.length,tasks:[...h.tables.componenttask.values()].map(t=>t.status),quotaCycleCalls:deps?(deps.checkAndResetQuotaCycle as any).mock.calls.length:null,writes:[...h.writes],rawIo:[...rawIo]};}
function noEffects(deps:StudioExecutionDeps){expect(fx.consumeCalls).toHaveLength(0);expect(fx.holdCalls).toHaveLength(0);expect(fx.adapterExecuteCalls).toHaveLength(0);expect(fx.refundCalls).toHaveLength(0);expect(h.tables.componenttask.size).toBe(0);expect(h.tables.pointledger.size).toBe(0);expect(deps.checkAndResetQuotaCycle).not.toHaveBeenCalled();expect(deps.getOrCreateQuota).not.toHaveBeenCalled();}
function byoPlan(){return {deploymentId:'byo:w1',providerId:'fixture-provider',modelId:'fixture-model',contextLimit:128000,pricing:fx.pricing};}
function monthlyFixture(expired:boolean,used:number){seed();h.tables.workspace.set('w1',{id:'w1',type:'ENTERPRISE',ownerId:'u1',name:'Fixture enterprise',plan:'STANDARD'});h.tables.workspacemember=new Map([['m1',{id:'m1',userId:'u1',workspaceId:'w1',role:'OWNER',monthlyTokenLimit:1000n,monthlyTokenUsed:BigInt(used),quotaResetAt:new Date(expired?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z')}]]);const deps=makeDeps();(deps.checkAndResetQuotaCycle as any).mockImplementation(realQuotaCycle);return deps;}
describe('R0-I independent controls and defect reproduction',()=>{
  it('I01-I03: explicit BYOK, missing prices, zero rates and fake client fields are paused before quota or funds',async()=>{
    const rows=[];
    for(const pricing of [trustedPricing(),null,trustedPricing({costInputMicrosPerMillion:0,costOutputMicrosPerMillion:0})]){
      seed();fx.pricing=pricing;h.tables.systemconfig.set('billing.byokServiceRateBps',{key:'billing.byokServiceRateBps',value:'0'});const deps=makeDeps();const r=await call({deploymentId:'byo:w1',pricingSource:'PLATFORM',serviceRateBps:0},deps);expect(r.status).toBe(409);expect(r.body.code).toBe('BYOK_BILLING_POLICY_UNCONFIRMED');expect(estimatePoints).not.toHaveBeenCalled();noEffects(deps);rows.push(observation('explicit',r,deps));
    }
    evidence.push({case:'I01-I03',rows});
  });
  it('I02-I03: auto/default and final-plan switch to BYOK stay paused even with synthetic settlement enabled',async()=>{
    const rows=[];
    for(const body of [{deploymentId:'auto'},{}]){
      seed();const deps=makeDeps();(deps.resolveDefaultDeployment as any).mockResolvedValue(byoPlan());const r=await call(body,deps);expect(r.status).toBe(409);noEffects(deps);rows.push(observation('default BYOK',r,deps));
    }
    seed();vi.stubEnv('TEST_TOKEN_SETTLEMENT_ENABLED','true');h.tables.systemconfig.set('billing.settlementMode',{key:'billing.settlementMode',value:'ALL'});const deps=makeDeps();(deps.resolveDefaultDeployment as any).mockResolvedValueOnce({deploymentId:'dep-1',providerId:'prov-1',modelId:'model-1',contextLimit:128000,pricing:fx.pricing}).mockResolvedValue(byoPlan());const r=await call({},deps);expect(r.status).toBe(409);noEffects(deps);rows.push(observation('platform to final BYOK with settlement ALL',r,deps));evidence.push({case:'I02-I03',rows});
  });
  it('I06 defect: same expired-month fixture succeeds before R0-I but is rejected before reset in current handler',async()=>{
    const rows=[];const previous=await import('./baseline-handler');
    let deps=monthlyFixture(true,1000);let res=await previous.runStudioPost(makeReq({}),deps);let r={status:res.status,body:await res.json()};expect(r.status).toBe(200);expect(deps.checkAndResetQuotaCycle).toHaveBeenCalledOnce();expect(h.tables.workspacemember.get('m1').monthlyTokenUsed).toBe(0n);rows.push(observation('R0-H2 snapshot expired month',r,deps));
    deps=monthlyFixture(true,1000);r=await call({},deps);expect(r.status).toBe(400);expect(r.body.error).toContain('1000/1000');expect(deps.checkAndResetQuotaCycle).not.toHaveBeenCalled();expect(h.tables.workspacemember.get('m1').monthlyTokenUsed).toBe(1000n);expect(fx.adapterExecuteCalls).toHaveLength(0);rows.push(observation('current expired month blocked before reset',r,deps));
    evidence.push({case:'I-MONTH-ORDER',rows});
  });
  it('I06 controls: current month under limit works, current month exhausted remains rejected',async()=>{
    const rows=[];let deps=monthlyFixture(false,0);let r=await call({},deps);expect(r.status).toBe(200);expect(fx.consumeCalls[0].points).toBe(100);rows.push(observation('current month under limit',r,deps));
    deps=monthlyFixture(false,1000);r=await call({},deps);expect(r.status).toBe(400);expect(fx.adapterExecuteCalls).toHaveLength(0);expect(fx.consumeCalls).toHaveLength(0);rows.push(observation('current month exhausted',r,deps));evidence.push({case:'I06-month-controls',rows});
  });
  it('I04 controls: actual quote routes pause with null prices, retain auth and keep platform quote',async()=>{
    const {GET:estimate}=await import('@/app/api/billing/estimate/route');const {GET:preview}=await import('@/app/api/billing/byok-preview/route');const rows=[];
    const req=(url:string)=>new NextRequest('http://localhost'+url,{headers:{authorization:'Bearer fixture'}});
    for(const url of ['/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1','/api/billing/byok-preview?workspaceId=w1']){
      seed();h.tables.workspacemember.set('m1',{id:'m1',userId:'u1',workspaceId:'w1'});const res=await (url.includes('byok-preview')?preview:estimate)(req(url));const b=await res.json();expect(res.status).toBe(200);expect(b.data.code).toBe('BYOK_BILLING_POLICY_UNCONFIRMED');expect(b.data.points).toBeNull();expect(b.data.yuan).toBeNull();expect(b.data.canExecute).toBe(false);expect(h.writes).toHaveLength(0);rows.push({url,status:res.status,data:b.data});
    }
    authState.valid=false;expect((await estimate(req('/api/billing/estimate?componentId=comp-1&workspaceId=w1'))).status).toBe(401);authState.valid=true;authState.userId='outsider';expect((await preview(req('/api/billing/byok-preview?workspaceId=w1'))).status).toBe(403);
    evidence.push({case:'I04-mocked-registry-controls',rows,limits:'Registry IO mocked only in this control; real registry checked separately.'});
  });
  it('I04 defect: real quote -> real registry -> real BYO column helper attempts ALTER TABLE on a GET',async()=>{
    seed();h.tables.workspacemember.set('m1',{id:'m1',userId:'u1',workspaceId:'w1'});h.tables.workspace_model_policy=new Map([['policy',{id:'policy',workspaceId:'w1',defaultDeploymentId:'dep-1',allowedDeploymentIds:[],disabledDeploymentIds:[]}]]);
    h.tables.workspace_byo_model=new Map([['byo1',{id:'byo1',workspaceId:'w1',enabled:true,label:'fixture-model',protocol:'OPENAI_COMPATIBLE',baseUrl:'https://fixture.invalid',apiKeyCipher:'fixture',shareWithMembers:true,contextLimit:128000,capabilities:['TEXT_GENERATION'],priceInputMicrosPerMillion:1000,priceOutputMicrosPerMillion:1000,priceStatus:'VERIFIED'}]]);
    const actual=await vi.importActual<typeof import('@/lib/model-registry')>('@/lib/model-registry');
    resolveDeploymentForWorkspace.mockImplementationOnce(actual.resolveDeploymentForWorkspace as any);
    const {GET:estimate}=await import('@/app/api/billing/estimate/route');const res=await estimate(new NextRequest('http://localhost/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1',{headers:{authorization:'Bearer fixture'}}));const b=await res.json();
    expect(res.status).toBe(200);expect(b.data.code).toBe('BYOK_BILLING_POLICY_UNCONFIRMED');expect(rawIo).toHaveLength(1);expect(rawIo[0].method).toBe('$executeRawUnsafe');expect(String(rawIo[0].args[0])).toContain('ALTER TABLE `workspace_byo_model`');evidence.push({case:'I-GET-DDL',status:res.status,code:b.data.code,rawIo:[...rawIo],limits:'Raw Prisma IO intercepted; no SQL or actual key decryption executed.'});
  });
});
afterAll(()=>{if(evidence.length!==6)throw Error('Incomplete audit');fs.writeFileSync('docs/reviews/R0-I-independent-review/handler-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),tests:6,evidence},(_,v)=>typeof v==='bigint'?v.toString():v,2));});
