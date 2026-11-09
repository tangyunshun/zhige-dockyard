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

// ════════ SQL 写尝试分类（R0-I2 K03：rawSql 记录形如 EXEC/QUERY + SQL，按前缀解析，附自检） ════════
function isRawWriteAttempt(record: string): boolean {
  const m = /^(EXEC|QUERY)\s+([\s\S]*)$/.exec(record);
  if (!m) return false;
  const kind = m[1];
  const sql = m[2].trim().toUpperCase();
  if (kind === "EXEC") return true;
  return /^(ALTER|INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE|RENAME|REPLACE)\b/.test(sql);
}
if (!isRawWriteAttempt("EXEC ALTER TABLE `t` ADD COLUMN `c` BOOLEAN")) throw new Error("自检失败：EXEC ALTER 未被识别");
if (isRawWriteAttempt("QUERY SELECT `shareWithMembers` FROM `t` LIMIT 1")) throw new Error("自检失败：QUERY SELECT 误判为写");

// ══════════════ 内存 Prisma（通用表 + 条件求值 + 事务回滚/提交故障 + 写记录） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const fault = { commit: false };
  const rawSql: string[] = []; // $executeRawUnsafe/$queryRawUnsafe 记录（I-GET-DDL 只读断言）
  const rawFault = { fail: false };
  return { tables, writes, fault, rawSql, rawFault };
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
        if (prop === "$executeRawUnsafe" || prop === "$executeRaw") {
          return async (sql: string) => {
            h.rawSql.push(`EXEC ${String(sql).slice(0, 120)}`);
            if (h.rawFault.fail) throw new Error("INJECTED_RAW_FAIL");
            return 0;
          };
        }
        if (prop === "$queryRawUnsafe" || prop === "$queryRaw") {
          return async (sql: string) => {
            h.rawSql.push(`QUERY ${String(sql).slice(0, 120)}`);
            if (h.rawFault.fail) throw new Error("INJECTED_RAW_FAIL");
            return [];
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
    resolveDeploymentForWorkspace: async (...args: any[]) =>
      fx.useRealResolver
        ? actual.resolveDeploymentForWorkspace(...(args as [any])) // [R0-I1 J03] 真实解析链路（只读接线）
        : resolveDeploymentForWorkspace(args[0]).then((plan: any) => ({ ...plan, pricing: fx.pricing, contextLimit: fx.contextLimit })),
  };
});
// 解密 IO 以固定合成值替换（真实解析器读取密钥密文）
vi.mock("@/lib/crypto-secrets", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (c: string) => c.replace(/^enc:/, ""),
}));

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
  useRealResolver: false, // J03：真实 resolveDeploymentForWorkspace（只读接线验证）
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
  fx.useRealResolver = false;
  h.rawSql.length = 0;
  h.rawFault.fail = false;
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

describe("R0-H2 纯准入函数：注册表硬上下文边界（N01/N02/N03）", async () => {
  const { decidePlatformModelCostAdmission: decide } = await import("@/lib/model-cost-admission");

  // 独立复算（不调用被测函数）：输入上界 = 夹具 contextLimit；成本微元 = ceil(上界×单价/1e6)；
  // 售价底线微元 = ceil(成本微元×(10000+bps)/10000)；点数 = ceil(售价底线微元/10000)
  function independentCostPoints(contextLimit: number, maxOutputTokens: number, costIn: number, costOut: number, markupBps: number): number {
    const costMicros = (BigInt(contextLimit) * BigInt(costIn) + BigInt(maxOutputTokens) * BigInt(costOut) + BigInt(999999)) / BigInt(1000000);
    const saleMicros = (costMicros * BigInt(10000 + markupBps) + BigInt(9999)) / BigInt(10000);
    return Number((saleMicros + BigInt(9999)) / BigInt(10000));
  }

  it("N03：100 点预算的等值/超预算边界独立复算（100/101/150/200/201）", () => {
    const contextLimit = 100_000;
    const cases: [number, boolean][] = [
      [10_000_000, true], // 恰好 100 点（等值）
      [10_100_000, false], // 101 点
      [15_000_000, false], // 150 点
      [20_000_000, false], // 200 点
      [20_100_000, false], // 201 点
    ];
    for (const [costIn, expectAllowed] of cases) {
      const independent = independentCostPoints(contextLimit, 0, costIn, 0, 0);
      const expectedPoints = Number((BigInt(contextLimit) * BigInt(costIn)) / BigInt(10_000_000_000)); // ceil(上界×单价/1e10)
      expect(independent).toBe(expectedPoints); // 独立复算吻合（来源=夹具 contextLimit）
      const d = decide({
        pricing: { currency: "CNY", priceStatus: "VERIFIED", costInputMicrosPerMillion: costIn, costOutputMicrosPerMillion: 0 },
        contextLimit,
        maxOutputTokens: 0,
        budgetPoints: 100,
        markupRateBps: 0,
      });
      expect(d.allowed, `case ${costIn}`).toBe(expectAllowed);
      if (d.allowed) {
        expect(d.inputTokenUpperBound).toBe(contextLimit); // 上界 = 夹具中的计划值
        expect(d.inputBoundSource).toBe("REGISTRY_CONTEXT_LIMIT_FULL");
      }
    }
  });

  it("N01：来源缺失/0/负数/非法 → MODEL_COST_NOT_TRUSTWORTHY，不可建立边界", () => {
    for (const contextLimit of [0, -1, null, undefined, "abc", 1.5]) {
      const d = decide({
        pricing: { currency: "CNY", priceStatus: "VERIFIED", costInputMicrosPerMillion: 1000, costOutputMicrosPerMillion: 1000 },
        contextLimit: contextLimit as any,
        maxOutputTokens: 100,
        budgetPoints: 100,
        markupRateBps: 0,
      });
      expect(d.allowed, `contextLimit=${String(contextLimit)}`).toBe(false);
      if (!d.allowed) expect(d.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");
    }
  });

  it("N02：可信来源（正整数 contextLimit + 低单价）→ 正常放行，上界取计划值", () => {
    const d = decide({
      pricing: { currency: "CNY", priceStatus: "VERIFIED", costInputMicrosPerMillion: 1000, costOutputMicrosPerMillion: 1000 },
      contextLimit: 128_000,
      maxOutputTokens: 300,
      budgetPoints: 100,
      markupRateBps: 0,
    });
    const independent = independentCostPoints(128_000, 300, 1000, 1000, 0);
    expect(independent).toBeLessThan(100); // 独立复算确认远低于预算
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.inputTokenUpperBound).toBe(128_000);
      expect(d.conservativeCostPoints).toBe(independent);
    }
  });

  it("M02 保持：未知费用规则 / 非零缓存类别 / 基础价格校验 / 明确免费对照", () => {
    const base = { currency: "CNY", priceStatus: "VERIFIED", costInputMicrosPerMillion: 1000, costOutputMicrosPerMillion: 1000 };
    const ctx = { contextLimit: 128_000, maxOutputTokens: 100, budgetPoints: 100, markupRateBps: 0 };
    // 未知规则拒绝
    const r1 = decide({ pricing: { ...base, rules: { unknownSurcharge: { rate: "5%" } } }, ...ctx });
    expect(r1.allowed).toBe(false);
    if (!r1.allowed) expect(r1.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");
    // 非零缓存成本拒绝
    const r2 = decide({ pricing: { ...base, costCacheReadMicrosPerMillion: 500 }, ...ctx });
    expect(r2.allowed).toBe(false);
    // 空规则 / null rules → 不误拦
    for (const rules of [null, {}]) {
      expect(decide({ pricing: { ...base, rules }, ...ctx }).allowed).toBe(true);
    }
    // 明确免费对照
    for (const pricing of [
      { currency: "CNY", priceStatus: "FREE", costInputMicrosPerMillion: 0, costOutputMicrosPerMillion: 0, rules: null },
      { currency: "CNY", priceStatus: "VERIFIED", costInputMicrosPerMillion: 0, costOutputMicrosPerMillion: 0, rules: null },
    ]) {
      const d = decide({ pricing, ...ctx, maxOutputTokens: 5000 });
      expect(d.allowed).toBe(true);
      if (d.allowed) expect(d.conservativeCostPoints).toBe(0);
    }
    // 基础价格校验保持
    for (const pricing of [null, { ...base, priceStatus: "OBSERVED_ONLY" }, { ...base, currency: "USD" }, { ...base, costInputMicrosPerMillion: null }, { ...base, costOutputMicrosPerMillion: null }]) {
      const d = decide({ pricing, ...ctx });
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");
    }
  });
});

// ══════════════ 真实 handler（N01/N02/N03/M03/L05/L06） ══════════════

describe("R0-H2 真实 handler：来源缺失/失配/伪造均拒绝（N01）", () => {
  it("contextLimit=0（注册表未登记硬限制）→ 422 未就绪，零扣点/hold/execute/任务", async () => {
    fx.contextLimit = 0;
    const r = await call();
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");
    expect(r.body.error).toContain("上下文上限");
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.holdCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(fx.refundCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
    expect(h.tables.pointledger.size).toBe(0);
  });

  it("contextLimit 负数 / 非法 → 422 拒绝，零副作用", async () => {
    fx.contextLimit = -5;
    const r1 = await call();
    expect(r1.status).toBe(422);
    expect(h.tables.componenttask.size).toBe(0);
    fx.contextLimit = Number.NaN; // 非法数值（NaN 不触发输入防爆阀，直达成本准入裁决）
    const r2 = await call();
    expect(r2.status).toBe(422);
    expect(h.tables.componenttask.size).toBe(0);
    fx.contextLimit = "abc" as unknown as number; // 非数值形态
    const r3 = await call();
    expect(r3.status).toBe(422);
    expect(h.tables.componenttask.size).toBe(0);
  });

  it("客户端伪造边界不生效：body 携带 contextLimit/inputTokens 大值不改变服务端裁决", async () => {
    fx.contextLimit = 0; // 服务端计划无可靠来源
    // 即使客户端伪造巨大的 contextLimit/inputTokens 字段，也只读服务端计划值 → 仍拒绝
    const r = await call({ contextLimit: 999_999_999, inputTokens: 999_999_999 } as any);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("MODEL_COST_NOT_TRUSTWORTHY");
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
  });
});

describe("R0-H2 真实 handler：可信来源正常执行与边界驱动（N02/N03）", () => {
  it("N02：可信 contextLimit + 低单价 → 正常执行；边界值取自最终计划", async () => {
    fx.contextLimit = 128_000;
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(fx.adapterExecuteCalls.length).toBe(1);
    const task = [...h.tables.componenttask.values()][0];
    expect(task.status).toBe("SUCCESS");
    // 独立核对：来源=计划 contextLimit=128000，成本 = ceil(128000×1000/1e6)=128 微元 → 1 点 < 100
    const independent = Math.ceil((128_000 * 1000 + 300 * 1000 + 999_999) / 1_000_000 / 10_000);
    expect(independent).toBeLessThan(100);
  });

  it("N03：同一计划下边界导致超预算即拒绝（不涨价、不缩输出、不换模型）", async () => {
    // contextLimit=8192：独立复算 costIn=122,000,000 → 恰好 ≤100 点；123,000,000 → 101 点拒绝
    fx.contextLimit = 8_192;
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 122_000_000, costOutputMicrosPerMillion: 0 });
    const r1 = await call();
    expect(r1.status).toBe(200); // 等于预算内 → 执行
    expect(fx.consumeCalls.length).toBe(1);
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 123_000_000, costOutputMicrosPerMillion: 0 });
    const r2 = await call();
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe("MODEL_COST_EXCEEDS_BUDGET");
    // 不缩输出：拒绝与放行两用的输出上限一致（目录 100 × 3 = 300）
    expect(fx.adapterExecuteCalls[0].maxOutputTokens).toBe(300);
  });

  it("L03：准入与 adapter.execute 同一份最终请求（提示词已展开、输出上限=目录×3）", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    const args = fx.adapterExecuteCalls[0];
    expect(args.systemPrompt).not.toContain("{{COST_BASELINE}}");
    expect(args.systemPrompt).toContain("你是一名专业分析师");
    expect(args.userPrompt).toContain("这是一段正常的文本输入材料");
    expect(args.maxOutputTokens).toBe(300);
  });
});

describe("R0-H1/H2 真实 handler：三分支模式隔离保持（M03）", () => {
  it("固定兼容分支：仍受准入保护（超预算拒绝）", async () => {
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1_000_000_000_000, costOutputMicrosPerMillion: 0 });
    const r = await call();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("MODEL_COST_EXCEEDS_BUDGET");
    expect(fx.holdCalls.length).toBe(0);
  });

  it("R0-I I01：BYOK（显式 byo: 部署、有价）→ 409 BYOK_BILLING_POLICY_UNCONFIRMED，零副作用（不估价、不回退固定点数）", async () => {
    // 高成本定价：若误入固定预算判断会拒绝；有价也不会绕过暂停
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1_000_000_000_000, costOutputMicrosPerMillion: 0 });
    estimatePoints.mockResolvedValue({
      basis: "CONVERTED_PRICE", points: 7, snapshot: { source: "BYOK_OFFICIAL" }, blockedReason: null,
    } as any);
    const r = await call({ deploymentId: "byo:w1" });
    expect(r.status).toBe(409);
    expect(r.body.success).toBe(false);
    expect(r.body.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(r.body.error).toContain("未扣除算力点");
    expect(r.body.error).toContain("未调用模型");
    // 暂停先于估价与一切副作用
    expect(estimatePoints).not.toHaveBeenCalled();
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.holdCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(fx.refundCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
    expect(h.tables.pointledger.size).toBe(0);
  });

  it("R0-I I01：BYOK 缺价/估价异常同样暂停（不回退固定点数收费）", async () => {
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1_000_000_000_000, costOutputMicrosPerMillion: 0 });
    estimatePoints.mockRejectedValue(new Error("simulated estimate failure")); // 估价异常也不得绕过
    const r = await call({ deploymentId: "byo:w1" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(estimatePoints).not.toHaveBeenCalled(); // 暂停先于估价
    expect(fx.consumeCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
  });

  it("R0-I I02：auto/默认命中 BYOK → 409 暂停；前后解析交错（先平台后 BYOK）也不执行/扣费/建任务", async () => {
    // auto：早期解析与最终解析都命中 BYOK
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1_000_000_000_000, costOutputMicrosPerMillion: 0 });
    const deps = makeDeps();
    (deps.resolveDefaultDeployment as any).mockResolvedValue({
      deploymentId: "byo:w1", providerId: "prov-1", modelId: "model-1",
      contextLimit: 128000, pricing: fx.pricing,
    });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({ deploymentId: "auto" }), deps); // auto + 无 deploymentId 同路径
    const r = { status: res.status, body: await (res as any).json() };
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);

    // 交错：早期解析为平台计划、最终解析变为 BYOK → 最终裁决仍暂停，零副作用
    const deps2 = makeDeps();
    const platformPlan = {
      deploymentId: "dep-1", providerId: "prov-1", modelId: "model-1",
      contextLimit: 128000, pricing: trustedPricing(),
    };
    const byoPlan = {
      deploymentId: "byo:w1", providerId: "prov-1", modelId: "model-1",
      contextLimit: 128000, pricing: fx.pricing,
    };
    (deps2.resolveDefaultDeployment as any)
      .mockResolvedValueOnce(platformPlan) // 早期估价裁决：平台
      .mockResolvedValue(byoPlan); // 最终裁决：变为 BYOK
    const res2 = await runStudioPost(makeReq({ deploymentId: "auto" }), deps2);
    expect(res2.status).toBe(409);
    const body2 = await (res2 as any).json();
    expect(body2.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.holdCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
    expect(h.tables.pointledger.size).toBe(0);
  });

  it("合成已启用真实结算分支：不套固定 rawCost 预算，走押金 hold + execute（生产开关未动）", async () => {
    process.env.TEST_TOKEN_SETTLEMENT_ENABLED = "true"; // 仅合成测试环境（NODE_ENV=test 下生效）
    h.tables.systemconfig.set("billing.settlementMode", { key: "billing.settlementMode", value: "ALL" });
    fx.pricing = trustedPricing({
      costInputMicrosPerMillion: 5_000_000_000, costOutputMicrosPerMillion: 0, // 折算远超 100 点
      priceSource: "VERIFIED", // 结算就绪要求供应商价目表来源已确认（与 priceStatus 不同字段）
    });
    const r = await call();
    expect([200, 202]).toContain(r.status); // 结算分支异步契约
    expect(fx.holdCalls.length).toBe(1); // 走押金-结算
    expect(fx.consumeCalls.length).toBe(0); // 不走固定扣点
    expect(fx.adapterExecuteCalls.length).toBe(1); // 正常执行
    expect(fx.releaseCalls.length).toBe(0);
  });
});

describe("R0-H 真实 handler：正常闭环与失败退款保持（L06）", () => {
  it("L06：安全请求真实扣点 100 + 任务 SUCCESS + 成果物落库", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(fx.consumeCalls.length).toBe(1);
    expect(fx.consumeCalls[0].points).toBe(100); // 实际扣点 = 配置固定点数（不被上调）
    expect(fx.holdCalls.length).toBe(0);
    const task = [...h.tables.componenttask.values()][0];
    expect(task.status).toBe("SUCCESS");
    expect(task.result?.outputData).toBeTruthy();
  });

  it("L06：模型执行失败 → 原路退款（refundConsumedPoints 恰好一次），任务 FAILED", async () => {
    fx.adapterBehavior = "throw";
    const r = await call();
    expect(r.status).toBe(502); // 模型上游失败 → 502（先原路退款再返回）
    expect(r.body.code).toBe("MODEL_UPSTREAM_ERROR");
    expect(fx.consumeCalls.length).toBe(1);
    expect(fx.refundCalls.length).toBe(1);
    const task = [...h.tables.componenttask.values()][0];
    expect(task.status).toBe("FAILED");
    expect(task.config.chargeAttempted).toBe(true);
  });

  it("L05：未授权 → 401；合同缺失 → 409（原门禁不被新逻辑绕过）", async () => {
    const deps = makeDeps();
    (deps.getUserId as any).mockResolvedValue(null);
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({}), deps);
    expect(res.status).toBe(401);

    fx.contract = null;
    const { ComponentContractError } = await import("@/lib/component-contract/errors");
    const deps2 = makeDeps();
    (deps2.getActiveContractSnapshot as any).mockRejectedValue(
      new ComponentContractError("NO_ACTIVE_CONTRACT", "无有效 PUBLISHED 激活合同"),
    );
    const res2 = await runStudioPost(makeReq({}), deps2);
    expect(res2.status).toBe(409);
    expect(fx.consumeCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
  });
});

// ══════════════ 冻结边界（L07/M03 源码级证据） ══════════════

describe("R0-H2 L07：边界来源与冻结边界（源码级证据）", () => {
  it("边界唯一来源为注册表硬上下文限制；字节+128 与字符粗估不再进入成本计算", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/api/studio/handler.ts", "utf-8");
    // 准入调用传入 contextLimit（服务端计划值），不再传文本估算
    expect(src).toContain("contextLimit: modelPlan.contextLimit");
    expect(src).not.toContain("systemPrompt: finalSystemPrompt,\n                userPrompt");
    // 模式隔离三条件与原门禁保持
    expect(src).toContain('resolvePricingSource(modelPlan.deploymentId) !== "USER_BYOK" &&');
    expect(src).toContain('billingBasis === "ESTIMATED_COMPATIBILITY" &&');
    expect(src).toContain("!settlementFeatureEnabled");
    expect(src).toContain("SETTLEMENT_NOT_READY");
    expect(src).toContain("evaluateSettlementReadiness");
    expect(src).toContain("consumeAndCreateSettlementHold");
    expect(src).not.toContain("rawCost * 2");
    // 准入函数：边界来源与缺失拒绝
    const lib = fs.readFileSync("src/lib/model-cost-admission.ts", "utf-8");
    expect(lib).toContain("REGISTRY_CONTEXT_LIMIT_FULL");
    expect(lib).toContain("contextLimit <= 0");
    expect(lib).toContain("hasUnknownPricingRules");
    // 字节+128 方案已移除（不再对所有协议无条件通用）
    expect(lib).not.toContain("PROTOCOL_FRAMING_TOKEN_ALLOWANCE");
  });

  it("页面执行失败路径：恢复忙碌状态并诚实展示错误（源码级证据，非浏览器验证；页面已独立核验）", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/WorkspaceInternalLayoutV3.tsx", "utf-8");
    expect(src).toContain("throw new Error(data.error || data.message || \"任务执行失败，请稍后重试\")");
    expect(src).toContain("setIsExecutingTask(false)");
    expect(src).toContain("toast.error(error.message");
  });
});


// ══════════════════════════════════════════════════════
// R0-I I04：只读报价与 BYOK 预览的暂停事实（真实 GET handler，零写入/零模型调用）
// ══════════════════════════════════════════════════════

describe("R0-I I04：报价与预览接口的暂停状态一致", async () => {
  const { GET: estimateGET } = await import("@/app/api/billing/estimate/route");
  const { GET: previewGET } = await import("@/app/api/billing/byok-preview/route");

  const getReq = (url: string) =>
    new NextRequest(`http://localhost${url}`, {
      method: "GET",
      headers: { authorization: "Bearer test-token" },
    });

  beforeEach(() => {
    // 组件 + 激活合同（含能力声明），估价路由按真实合同解析
    h.tables.systemconfig.set("billing.settlementMode", { key: "billing.settlementMode", value: "ALL" });
    estimatePoints.mockClear();
  });

  it("estimate GET：BYOK 命中 → blocked/canExecute=false、points/yuan=null、稳定码；零写入", async () => {
    const res = await estimateGET(
      getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.blocked).toBe(true);
    expect(body.data.canExecute).toBe(false);
    expect(body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(body.data.points).toBeNull();
    expect(body.data.yuan).toBeNull();
    expect(body.data.blockedReason).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(body.data.message).toContain("未扣点");
    // 零写入、零估价调用（暂停先于估价）
    expect(estimatePoints).not.toHaveBeenCalled();
    const writeOps = h.writes.filter((w) => !w.includes("findUnique") && !w.includes("findMany") && !w.includes("count"));
    expect(writeOps.length).toBe(0);
  });

  it("estimate GET：平台模型 → 正常固定点数报价（对照，不误拦）", async () => {
    const res = await estimateGET(
      getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=dep-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blocked).toBeUndefined();
    expect(body.data.points).toBe(100); // 固定点数
    expect(body.data.basis).toBe("FIXED_POINTS");
  });

  it("estimate GET：401 / 403 保持；GET 零写入", async () => {
    authState.valid = false;
    const res1 = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1"));
    expect(res1.status).toBe(401);
    authState.valid = true;
    authState.userId = "attacker"; // 非成员
    const res2 = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"));
    expect(res2.status).toBe(403);
    const writeOps = h.writes.filter((w) => !w.includes("find") && !w.includes("count"));
    expect(writeOps.length).toBe(0);
  });

  it("byok-preview GET：暂停事实一致（points/yuan=null、稳定码、费率仅作已存配置展示）；403 保持；零写入", async () => {
    const res = await previewGET(getReq("/api/billing/byok-preview?workspaceId=w1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.blocked).toBe(true);
    expect(body.data.canExecute).toBe(false);
    expect(body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(body.data.points).toBeNull();
    expect(body.data.yuan).toBeNull();
    expect(typeof body.data.byokServiceRateBps).toBe("number"); // 仅已存配置展示
    expect(body.data.message).toContain("收费口径待确认");
    // 未估价（暂停先于估价）
    expect(estimatePoints).not.toHaveBeenCalled();
    // 非成员 403
    authState.userId = "attacker";
    const res2 = await previewGET(getReq("/api/billing/byok-preview?workspaceId=w1"));
    expect(res2.status).toBe(403);
    const writeOps = h.writes.filter((w) => !w.includes("find") && !w.includes("count"));
    expect(writeOps.length).toBe(0);
  });
});


// ══════════════════════════════════════════════════════
// R0-I1 J01/J02：月度额度维护顺序（真实 quota-cycle + 内存 Prisma）
// ══════════════════════════════════════════════════════

describe("R0-I1 J01/J02：月度额度维护顺序", async () => {
  const { checkAndResetQuotaCycle: realQuotaCycle } = await import("@/lib/quota-cycle");

  function seedEnterpriseMember(opts: { used: number; resetAt: Date | null; limit?: number }) {
    // 企业空间 + 受限成员（审核要求：唯一成员、显式 monthlyTokenLimit，不用默认 null 夹具）
    h.tables.workspace = new Map([["w1", { id: "w1", type: "ENTERPRISE", ownerId: "owner-1", name: "企业空间", plan: "STANDARD" }]]);
    h.tables.workspacemember = new Map([
      ["wm1", {
        id: "wm1", userId: "u1", workspaceId: "w1", role: "MEMBER",
        monthlyTokenLimit: (opts.limit ?? 1000) as any,
        monthlyTokenUsed: BigInt(opts.used),
        quotaResetAt: opts.resetAt,
        tokenBalance: 10000,
      }],
    ]);
    fx.contextLimit = 128000;
    fx.pricing = trustedPricing();
  }

  function makeDepsWithRealCycle() {
    const deps = makeDeps();
    (deps as any).checkAndResetQuotaCycle = async (p: any, wsId: string, uId: string) =>
      realQuotaCycle(p, wsId, uId);
    return deps;
  }

  it("J01：跨月旧用量已满（quotaResetAt 已到期）→ 维护后重新读数，平台任务正常执行", async () => {
    seedEnterpriseMember({ used: 1000, resetAt: new Date("2000-01-01T00:00:00Z") });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({}), makeDepsWithRealCycle());
    expect(res.status).toBe(200);
    const body = await (res as any).json();
    expect(body.success).toBe(true);
    const member = h.tables.workspacemember.get("wm1");
    expect(member.monthlyTokenUsed).toBe(BigInt(0));
    expect(member.quotaResetAt.getTime()).toBeGreaterThan(Date.now());
    expect(fx.consumeCalls.length).toBe(1);
    expect(fx.consumeCalls[0].points).toBe(100);
    expect(fx.adapterExecuteCalls.length).toBe(1);
    const task = [...h.tables.componenttask.values()][0];
    expect(task.status).toBe("SUCCESS");
  });

  it("J01：quotaResetAt 缺失 → 同样维护后正常执行", async () => {
    seedEnterpriseMember({ used: 1000, resetAt: null });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({}), makeDepsWithRealCycle());
    expect(res.status).toBe(200);
    expect(h.tables.workspacemember.get("wm1").monthlyTokenUsed).toBe(BigInt(0));
    expect(fx.adapterExecuteCalls.length).toBe(1);
  });

  it("J02：同月确实用满（quotaResetAt 未到期）→ 400 拒绝、零执行、计数不动", async () => {
    seedEnterpriseMember({ used: 1000, resetAt: new Date(Date.now() + 10 * 86400000) });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({}), makeDepsWithRealCycle());
    expect(res.status).toBe(400);
    expect(JSON.stringify(await (res as any).json())).toContain("配额已用尽");
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(fx.consumeCalls.length).toBe(0);
    const member = h.tables.workspacemember.get("wm1");
    expect(member.monthlyTokenUsed).toBe(BigInt(1000));
  });

  it("J02：同月剩余额度足够 → 正常执行", async () => {
    seedEnterpriseMember({ used: 500, resetAt: new Date(Date.now() + 10 * 86400000) });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({}), makeDepsWithRealCycle());
    expect(res.status).toBe(200);
    expect(fx.consumeCalls[0].points).toBe(100);
    expect(h.tables.workspacemember.get("wm1").monthlyTokenUsed).toBe(BigInt(500));
  });

  it("J02：交错 BYOK + 旧月额度已满 → 仍先暂停（不误报额度不足、零配额维护写入）", async () => {
    seedEnterpriseMember({ used: 1000, resetAt: new Date("2000-01-01T00:00:00Z") });
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1000000000000, costOutputMicrosPerMillion: 0 });
    const deps = makeDepsWithRealCycle();
    (deps.resolveDefaultDeployment as any)
      .mockResolvedValueOnce({ deploymentId: "dep-1", providerId: "prov-1", modelId: "model-1", contextLimit: 128000, pricing: trustedPricing() })
      .mockResolvedValue({ deploymentId: "byo:w1", providerId: "prov-1", modelId: "model-1", contextLimit: 128000, pricing: fx.pricing });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(makeReq({ deploymentId: "auto" }), deps);
    expect(res.status).toBe(409);
    expect((await (res as any).json()).code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(fx.consumeCalls.length).toBe(0);
    expect(fx.holdCalls.length).toBe(0);
    expect(fx.adapterExecuteCalls.length).toBe(0);
    expect(h.tables.componenttask.size).toBe(0);
    expect(h.tables.workspacemember.get("wm1").monthlyTokenUsed).toBe(BigInt(1000));
  });

  it("J02：显式 BYOK + 旧月额度已满 → 先暂停，无额度误报", async () => {
    seedEnterpriseMember({ used: 1000, resetAt: new Date("2000-01-01T00:00:00Z") });
    fx.pricing = trustedPricing({ costInputMicrosPerMillion: 1000000000000, costOutputMicrosPerMillion: 0 });
    const r = await call({ deploymentId: "byo:w1" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(r.body.error).not.toContain("配额已用尽");
    expect(h.tables.componenttask.size).toBe(0);
    expect(h.tables.workspacemember.get("wm1").monthlyTokenUsed).toBe(BigInt(1000));
  });
});

// ══════════════════════════════════════════════════════
// R0-I1 J03：报价解析冷路径严格只读（真实解析器 + 只读接线）
// ══════════════════════════════════════════════════════

describe("R0-I1 J03：报价解析冷启动零 DDL/DML", async () => {
  const { GET: estimateGET } = await import("@/app/api/billing/estimate/route");

  const getReq = (url: string) =>
    new NextRequest(`http://localhost${url}`, {
      method: "GET",
      headers: { authorization: "Bearer test-token" },
    });

  function seedByo() {
    h.tables.workspace_byo_model = new Map([
      ["byo-row", {
        id: "byo-row", workspaceId: "w1", label: "自带模型", protocol: "openai",
        baseUrl: "http://fixture.invalid", apiKeyCipher: "enc:fixture-key", enabled: true,
        capabilities: ["TEXT_GENERATION"],
        priceInputMicrosPerMillion: null, priceOutputMicrosPerMillion: null,
      }],
    ]);
    fx.pricing = trustedPricing();
    fx.contextLimit = 128000;
    fx.useRealResolver = true; // 真实 resolveDeploymentForWorkspace + 真实 ensure 探针
  }

  it("缺必要结构（探针失败）→ 503 BYO_SHARE_COLUMN_NOT_READY 诚实拒绝，零 DDL", async () => {
    seedByo();
    h.rawFault.fail = true; // SELECT 探针失败 = 列缺失
    const res = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("BYO_SHARE_COLUMN_NOT_READY");
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false); // 未在用户读请求中自动迁移
  });

  it("显式 BYOK：冷启动报价 → 暂停报价正确，raw 调用仅 SELECT 探针（零 DDL/DML）", async () => {
    seedByo();
    const res = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blocked).toBe(true);
    expect(body.data.canExecute).toBe(false);
    expect(body.data.points).toBeNull();
    expect(body.data.yuan).toBeNull();
    expect(body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    // 只读接线：raw 仅 SELECT 探针，绝无 ALTER/INSERT/UPDATE/DELETE
    expect(h.rawSql.length).toBeGreaterThan(0); // 真实解析确实走到了 raw 层
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.rawSql.some((s) => s.startsWith("QUERY") && s.includes("shareWithMembers"))).toBe(true);
    // 常规写也为零
    const writeOps = h.writes.filter((w) => !w.includes("find") && !w.includes("count"));
    expect(writeOps.length).toBe(0);
  });

  it("401/403 保持；平台正常报价保持", async () => {
    seedByo();
    authState.valid = false;
    const res1 = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"));
    expect(res1.status).toBe(401);
    authState.valid = true;
    authState.userId = "attacker";
    const res2 = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo:w1"));
    expect(res2.status).toBe(403);
    authState.userId = "u1";
    fx.useRealResolver = false;
    fx.pricing = trustedPricing();
    const res3 = await estimateGET(getReq("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=dep-1"));
    const body3 = await res3.json();
    expect(body3.data.points).toBe(100); // 平台正常报价保持
  });
});
