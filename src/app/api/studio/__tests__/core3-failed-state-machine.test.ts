/**
 * CORE-3 失败任务状态机确定性测试（无真实 DB / 无真实模型 / 无真实扣点）。
 *
 * 通过请求级依赖注入边界（StudioExecutionDeps）注入内存 fake prisma 与 fake 服务，
 * 直接调用 runStudioPost，验证批次一的全部失败态闭环：
 *   - 前置无合同：无任务、无扣点、无模型调用；
 *   - 扣点前建立 RUNNING 任务 → 失败原子 RUNNING -> FAILED；
 *   - 模型超时 / 401 / 429 / 5xx：FAILED + CONSUME + REFUND；
 *   - 输出校验失败：FAILED + 原路退款；
 *   - 退款进入恢复队列：FAILED + refundrecovery=PENDING；
 *   - 退款双重失败：FAILED + ACCOUNTING_RECONCILIATION_REQUIRED；
 *   - RUNNING 僵尸恢复；
 *   - task_detail 失败安全 DTO（不泄露输入/Prompt/Key/堆栈）；
 *   - 不依赖任何组件 ID 特判（C01 与 C02 行为一致）。
 *
 * 本文件不证明真实模型、真实数据库、真实扣点、真实退款或生产业务验收。
 */

import { test, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { runStudioPost, markTaskStatusFailed } from "../route";
import { ModelAdapterError } from "@/lib/model-adapter";
import { ComponentContractError } from "@/lib/component-contract/errors";
import type { ConsumeResult } from "@/lib/credit-service";
import { serializeTaskDetailItem } from "@/lib/task-query-helpers";
import { C01_CONTRACT } from "@/lib/component-contract/catalog-contracts-c01-c05";

// ---------- 内存存储 ----------
let tasks: Map<string, any>;
let ledgers: any[];
let recoveries: any[];
// 测试开关：强制 componenttask.update 抛错，用于验证 FAILED 持久化失败不被吞掉（批次规则 6）
let forceUpdateThrow = false;

// ---------- fake prisma ----------
function fakePrisma() {
  const store = tasks;
  const ledgerStore = ledgers;
  const p = new Proxy(
    {},
    {
      get(_t, model: string) {
        switch (model) {
          case "$transaction":
            return async (cb: any) => cb(p);
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
                if (forceUpdateThrow) throw new Error("FORCED_UPDATE_FAILURE");
                const cur = store.get(where.id);
                if (!cur) throw new Error("P2025");
                // 仅允许 RUNNING 终态转换（模拟 where.status 条件）
                if (where.status && cur.status !== where.status) throw new Error("P2025 status guard");
                const merged = deepMerge(cur, data);
                store.set(where.id, merged);
                return deepClone(merged);
              },
              // 原子条件更新（RUNNING -> FAILED/SUCCESS）：命中状态条件才落库并返回 count=1，
              // 已是终态或任务不存在返回 count=0（由生产代码重读状态按幂等处理）。
              updateMany: async ({ where, data }: any) => {
                if (forceUpdateThrow) throw new Error("FORCED_UPDATE_FAILURE");
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
          case "componentstats":
            return { upsert: async () => ({}) };
          case "workspacequota":
            return { update: async ({ data }: any) => data, findUnique: async () => null };
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
          case "componentcatalog":
            return { findUnique: async ({ where }: any) => ({ ...FAKE_COMP, id: where.id }), update: async () => ({}) };
          case "componentusage":
            return { findFirst: async () => null, create: async () => ({}) };
          default:
            return new Proxy({}, { get: () => async () => ({}) });
        }
      },
    },
  );
  return p as any;
}

function deepClone(v: any) {
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}
function deepMerge(base: any, data: any) {
  const out = deepClone(base);
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = deepMerge(out[k] && typeof out[k] === "object" ? out[k] : {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------- fake 依赖 ----------
const FAKE_COMP = {
  id: "C01",
  name: "测试组件C01",
  estimatedModelTokens: 50,
};

type AdapterMode = "success" | "timeout" | "unauthorized" | "ratelimit" | "server" | "invalid-output";
let adapterMode: AdapterMode = "timeout";

function buildConsume(points: number): ConsumeResult {
  return {
    consumed: points,
    skipped: false,
    unlimited: false,
    details: [{ ledgerId: `l_${randomUUID()}`, kind: "WALLET", points, grantId: "g1", scope: "WALLET", sourceType: "WALLET" }],
    ledgerIds: [`l_${randomUUID()}`],
    balanceAfter: 1000 - points,
    monthlyTokenUsedIncremented: 0,
  };
}

function buildDeps(opts: {
  contract: any | null;
  refundThrows?: boolean;
  enqueueThrows?: boolean;
  consumePoints?: number;
  /** per-deps 适配器模式：使「成功 + 失败」等不同模式可并发共存（模块级 adapterMode 无法满足） */
  adapterMode?: AdapterMode;
}) {
  const contract = opts.contract;
  const snapshot = contract
    ? { contract, contractVersion: contract.contractVersion || "1.1.0", lifecycle: "PUBLISHED" }
    : null;
  return {
    prisma: fakePrisma(),
    getUserId: async () => "u_test_1",
    createModelAdapter: async () => ({
      execute: async () => {
        switch (opts.adapterMode ?? adapterMode) {
          case "timeout":
            throw new ModelAdapterError("MODEL_TIMEOUT", "模型调用超时", 504);
          case "unauthorized":
            throw new ModelAdapterError("MODEL_AUTH_ERROR", "401", 401);
          case "ratelimit":
            throw new ModelAdapterError("MODEL_RATE_LIMITED", "429", 429);
          case "server":
            throw new ModelAdapterError("MODEL_UPSTREAM_ERROR", "5xx", 502);
          case "invalid-output":
            // 返回明显非法的输出，触发输出校验失败
            return { output: "not-a-valid-object-shape" } as any;
          case "success":
          default:
            // 必须与当前 ModelAdapter 返回结构一致（text/usage），并满足 C01 合同 requiredSections
            return {
              // 必须满足 C01 合同：requiredSections（招标要求/能力匹配/偏离/风险）
              // + minOutputLength>=200 + disclaimerPolicy.marker「AI 招标分析建议」
              text:
                "# 招标关键要求清单\n" +
                "本节梳理本次招标要求：投标方须具备信息系统集成及涉密信息系统资质，并提供近三年同类项目业绩证明，" +
                "项目工期要求 90 天内完成交付，质保期不少于 12 个月。\n\n" +
                "# 我方能力匹配\n" +
                "我方已取得系统集成二级资质与涉密资质，近三年完成同类项目 6 个，团队规模与工期安排可满足要求，能力匹配度良好。\n\n" +
                "# 偏离表\n" +
                "存在一处轻微偏离：质保期我方标准为 12 个月，与招标要求一致；付款节点存在轻微偏离，需商务确认。\n\n" +
                "# 风险与替代建议\n" +
                "主要风险为工期紧张与关键人员排期冲突，替代建议为提前锁定核心人力并准备备选供应商。\n\n" +
                "> AI 招标分析建议：本结果为 AI 生成的投标响应与偏离分析建议，需由投标或业务负责人复核。",
              usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
              model: "m1",
            } as any;
        }
      },
    }),
    getActiveContractSnapshot: async () => {
      if (!contract) throw new ComponentContractError("NO_ACTIVE_CONTRACT", "无激活合同");
      return {
        snapshot,
        contractId: contract.componentId,
        contractVersion: contract.contractVersion || "1.1.0",
      };
    },
    requireWorkspaceMembership: async () => true,
    requireWorkspacePermission: async () => true,
    getRestrictedComponentIds: async () => [],
    getOrCreateQuota: async () => ({ id: "q1", tokenBalance: 0, membershipLevelId: "FREE" }),
    checkAndResetQuotaCycle: async () => ({ ok: true, quota: { id: "q1" } }),
    resolveDefaultDeployment: async () => ({ providerId: "p1", modelId: "m1" }),
    touchComponentUsage: async () => {},
    writeAuditLog: async () => {},
    creditService: {
      consumePoints: async (args: any) => {
        const c = buildConsume(opts.consumePoints ?? 50);
        ledgers.push({ taskId: args?.taskId, type: "CONSUME", points: c.consumed });
        return c;
      },
      consumeAndCreateSettlementHold: async (args: any) => {
        const c = buildConsume(opts.consumePoints ?? 50);
        ledgers.push({ taskId: args?.taskId, type: "CONSUME", points: c.consumed });
        return c;
      },
      refundConsumedPoints: async (args: any) => {
        if (opts.refundThrows) throw new Error("refund failed");
        ledgers.push({ taskId: args.taskId, type: "REFUND", points: args.consumeResult.consumed });
        return { ok: true };
      },
    },
    refundService: {
      enqueueRefundRecovery: async (args: any) => {
        if (opts.enqueueThrows) return { ok: false, error: "enqueue failed" };
        recoveries.push(args);
        return { ok: true };
      },
    },
    settlementService: {
      releaseSettlementHold: async () => {},
      completeSettlement: async () => {},
      enqueueSettlementRecovery: async () => ({ ok: true }),
    },
  } as any;
}

function req(body: Record<string, unknown>, file?: { name: string; type: string; content: string }) {
  const url = "http://localhost:3000/api/studio";
  if (file) {
    const fd = new FormData();
    fd.append("action", "simulate");
    fd.append("workspaceId", String(body.workspaceId));
    fd.append("componentId", String(body.componentId));
    fd.append("inputSource", JSON.stringify({ sourceType: "file" }));
    fd.append("file", new File([file.content], file.name, { type: file.type }));
    return new NextRequest(url, { method: "POST", body: fd });
  }
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "simulate", ...body }),
  });
}

function findTask() {
  const all = Array.from(tasks.values());
  return all.length ? all[all.length - 1] : null;
}
function consumeSum() {
  return ledgers.filter((l) => l.type === "CONSUME").reduce((s, l) => s + Number(l.points), 0);
}
function refundSum() {
  return ledgers.filter((l) => l.type === "REFUND").reduce((s, l) => s + Number(l.points), 0);
}

beforeEach(() => {
  tasks = new Map();
  ledgers = [];
  recoveries = [];
  forceUpdateThrow = false;
  adapterMode = "timeout";
});

// 1. 前置无合同：无任务、无扣点、无模型调用
test("无激活合同：不创建任务、不扣点、不调用模型", async () => {
  let modelCalled = false;
  const deps = buildDeps({ contract: null });
  deps.createModelAdapter = async () => ({ invoke: async () => { modelCalled = true; return { output: {} }; } }) as any;
  const res = await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "x" }), deps);
  const body = await res.json();
  expect(res.status).toBe(409);
  expect(body.code).toBe("COMPONENT_CONTRACT_NOT_READY");
  expect(body.success).toBe(false);
  expect(tasks.size).toBe(0);
  expect(consumeSum()).toBe(0);
  expect(modelCalled).toBe(false);
});

// 2/3. 模型失败（超时/401/429/5xx）：必有 RUNNING 任务 → 原子 FAILED，且 CONSUME+REFUND
for (const mode of ["timeout", "unauthorized", "ratelimit", "server"] as AdapterMode[]) {
  test(`模型失败(${mode})：RUNNING→FAILED 持久化 + CONSUME + REFUND`, async () => {
    adapterMode = mode;
    const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
    const res = await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入文本材料" }), deps);
    const body = await res.json();
    const t = findTask();
    expect(t).not.toBeNull();
    expect(t.status).toBe("FAILED");
    expect(t.config.executionMode).toBe("REAL_MODEL");
    expect(t.config.contractId).toBe("C01");
    expect(t.config.chargeAttempted).toBe(true);
    // 失败任务不保存原文输入 / Prompt / 响应 / 堆栈
    expect(JSON.stringify(t.config)).not.toMatch(/输入文本/);
    expect(JSON.stringify(t.result)).not.toMatch(/输入文本/);
    expect(t.result.outputData).toBeNull();
    expect(t.result.artifacts).toEqual([]);
    expect(t.result.hasArtifact).toBe(false);
    expect(t.result.errorCode).toBeTruthy();
    expect(consumeSum()).toBe(50);
    expect(refundSum()).toBe(50);
    expect(body.success).toBe(false);
    expect(body.taskId).toBe(t.id);
  });
}

// 4. 输出校验失败：FAILED + 原路退款（CONSUME + REFUND）
test("输出校验失败：RUNNING→FAILED + CONSUME + REFUND", async () => {
  adapterMode = "invalid-output";
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
  const res = await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入文本材料" }), deps);
  const body = await res.json();
  const t = findTask();
  expect(t.status).toBe("FAILED");
  expect(["MODEL_OUTPUT_INVALID", "RESULT_BUILD_FAILED", "MODEL_UPSTREAM_ERROR"]).toContain(t.result.errorCode);
  expect(consumeSum()).toBe(50);
  expect(refundSum()).toBe(50);
  expect(body.success).toBe(false);
});

// 5. 退款进入恢复队列：FAILED + refundrecovery=PENDING
test("退款失败但恢复登记成功：FAILED + REFUND_PENDING", async () => {
  adapterMode = "timeout";
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50, refundThrows: true });
  const res = await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "x" }), deps);
  const body = await res.json();
  const t = findTask();
  expect(t.status).toBe("FAILED");
  expect(recoveries.length).toBe(1);
  expect(recoveries[0].consumeIdempotencyKey).toBe(`CONSUME:${t.id}`);
  expect(refundSum()).toBe(0);
  expect(body.code).toBe("REFUND_PENDING");
  expect(body.success).toBe(false);
});

// 6. 退款双重失败：FAILED + ACCOUNTING_RECONCILIATION_REQUIRED
test("退款与恢复均失败：FAILED + ACCOUNTING_RECONCILIATION_REQUIRED", async () => {
  adapterMode = "timeout";
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50, refundThrows: true, enqueueThrows: true });
  const res = await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "x" }), deps);
  const body = await res.json();
  const t = findTask();
  expect(t.status).toBe("FAILED");
  expect(body.code).toBe("ACCOUNTING_RECONCILIATION_REQUIRED");
  expect(body.success).toBe(false);
});

// 7. FAILED 持久化失败：必须返回 ACCOUNTING_RECONCILIATION_REQUIRED，严禁吞错（批次规则 6）
test("FAILED 写库失败：返回对账错误码并记录 taskId，不吞错、不声称已退款", async () => {
  adapterMode = "timeout";
  forceUpdateThrow = true; // 模拟 componenttask.update 持久化异常
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
  const res = await runStudioPost(
    req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入文本材料" }),
    deps,
  );
  const body = await res.json();
  expect(res.status).toBe(500);
  expect(body.code).toBe("ACCOUNTING_RECONCILIATION_REQUIRED");
  expect(typeof body.taskId).toBe("string");
  // 失败写库先于退款返回，不得声称已退款或任务已闭环
  expect(refundSum()).toBe(0);
  const t = findTask();
  expect(t).not.toBeNull();
  forceUpdateThrow = false;
});

// 8. RUNNING 僵尸恢复：超租约 RUNNING 任务进入 FAILED + 退款恢复
test("RUNNING 僵尸恢复：超租约 RUNNING → FAILED + 退款恢复", async () => {
  // 预置一个超租约的 RUNNING 任务（带 CONSUME 流水）
  const zombieId = randomUUID();
  tasks.set(zombieId, {
    id: zombieId,
    name: "zombie",
    type: "C01",
    status: "RUNNING",
    progress: 10,
    config: { executionMode: "REAL_MODEL", contractId: "C01", contractVersion: "1.1.0", executionLeaseUntil: new Date(Date.now() - 60000).toISOString() },
    result: { executionMode: "REAL_MODEL" },
    userId: "u_test_1",
    tenantId: "w1",
  });
  ledgers.push({ taskId: zombieId, type: "CONSUME", points: 50 });
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
  // 触发 simulate 入口的僵尸恢复扫描
  await runStudioPost(req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "x" }), deps);
  const z = tasks.get(zombieId);
  expect(z.status).toBe("FAILED");
  expect(z.result.errorCode).toBe("EXECUTION_LEASE_EXPIRED");
  expect(recoveries.some((r) => r.taskId === zombieId)).toBe(true);
});

// 9. task_detail 失败安全 DTO：不泄露输入/Prompt/Key/堆栈
test("serializeTaskDetailItem 对 FAILED 返回安全 DTO", async () => {
  const failedTask = {
    id: randomUUID(),
    type: "C01",
    status: "FAILED",
    config: { executionMode: "REAL_MODEL", contractId: "C01", contractVersion: "1.1.0", contractSnapshot: { input: {} }, chargeAttempted: true, secretPrompt: "MUST_NOT_LEAK" },
    result: { executionMode: "REAL_MODEL", errorCode: "MODEL_TIMEOUT", errorMessage: "超时", outputData: null, artifacts: [], artifact: null, hasArtifact: false },
    createdAt: new Date(),
    completedAt: new Date(),
  };
  const dto: any = serializeTaskDetailItem(failedTask as any, "测试组件", {
    refundStatus: "REFUNDED",
    refundedPoints: null,
    chargeAttempted: true,
  });
  expect(dto.status).toBe("FAILED");
  expect(dto.errorCode).toBe("MODEL_TIMEOUT");
  expect(dto.hasArtifact).toBe(false);
  expect(JSON.stringify(dto)).not.toMatch(/MUST_NOT_LEAK/);
  expect(JSON.stringify(dto.result ?? dto)).not.toMatch(/secretPrompt/);
});

// 12. 不依赖任何组件 ID 特判：C01 与 C02 行为一致（均产生 FAILED + 退款）
for (const cid of ["C01", "C02"]) {
  test(`组件 ${cid} 失败路径行为一致（无特判）`, async () => {
    adapterMode = "timeout";
    const deps = buildDeps({ contract: cid === "C01" ? C01_CONTRACT : { ...C01_CONTRACT, componentId: "C02" }, consumePoints: 50 });
    const res = await runStudioPost(req({ workspaceId: "w1", componentId: cid }, { name: "m.txt", type: "text/plain", content: "x" }), deps);
    const body = await res.json();
    const t = findTask();
    expect(t.status).toBe("FAILED");
    expect(consumeSum()).toBe(50);
    expect(refundSum()).toBe(50);
    expect(body.success).toBe(false);
  });
}

// ===== §三.4 并发幂等（成功/失败并发不得重复退款、不得重复写终态） =====
test("并发：两个成功请求同时完成，均落 SUCCESS 且绝不产生退款", async () => {
  adapterMode = "success";
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
  const reqA = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料A" });
  const reqB = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料B" });
  const [ra, rb] = await Promise.all([runStudioPost(reqA, deps), runStudioPost(reqB, deps)]);
  expect(ra.status).toBe(200);
  expect(rb.status).toBe(200);
  // 并发成功：严禁出现任何退款
  expect(ledgers.filter((l: any) => l.type === "REFUND").length).toBe(0);
  // 两个任务各自一条 CONSUME
  expect(ledgers.filter((l: any) => l.type === "CONSUME").length).toBe(2);
  const all = Array.from(tasks.values());
  expect(all.length).toBe(2);
  expect(all.every((t: any) => t.status === "SUCCESS")).toBe(true);
});

test("并发：两个失败请求同时完成，每个任务只产生一组退款事实（不重复退款、不建恢复）", async () => {
  adapterMode = "timeout";
  const deps = buildDeps({ contract: C01_CONTRACT, consumePoints: 50 });
  const reqA = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料A" });
  const reqB = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料B" });
  await Promise.all([runStudioPost(reqA, deps), runStudioPost(reqB, deps)]);
  const all = Array.from(tasks.values());
  expect(all.length).toBe(2);
  expect(all.every((t: any) => t.status === "FAILED")).toBe(true);
  // 每个任务一组 CONSUME + 一组 REFUND，绝不重复退款
  expect(ledgers.filter((l: any) => l.type === "CONSUME").length).toBe(2);
  expect(ledgers.filter((l: any) => l.type === "REFUND").length).toBe(2);
  // 退款成功：不创建 refundrecovery
  expect(recoveries.length).toBe(0);
});

test("并发：成功与失败请求同时完成，严禁出现 SUCCESS 后退款", async () => {
  const depsSuccess = buildDeps({ contract: C01_CONTRACT, consumePoints: 50, adapterMode: "success" });
  const depsFail = buildDeps({ contract: C01_CONTRACT, consumePoints: 50, adapterMode: "timeout" });
  const reqA = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料A" });
  const reqB = req({ workspaceId: "w1", componentId: "C01" }, { name: "m.txt", type: "text/plain", content: "输入材料B" });
  await Promise.all([runStudioPost(reqA, depsSuccess), runStudioPost(reqB, depsFail)]);

  const all = Array.from(tasks.values());
  expect(all.filter((t: any) => t.status === "SUCCESS").length).toBe(1);
  expect(all.filter((t: any) => t.status === "FAILED").length).toBe(1);
  // 关键红线：只允许失败任务一组退款，成功任务绝无退款
  expect(ledgers.filter((l: any) => l.type === "REFUND").length).toBe(1);
  expect(ledgers.filter((l: any) => l.type === "CONSUME").length).toBe(2);
});

test("终态不得被覆盖：已 FAILED / 已 SUCCESS 任务不允许再被写为 FAILED", async () => {
  const prismaStub: any = fakePrisma();

  // 1) RUNNING -> FAILED 首次转换成功
  await prismaStub.componenttask.create({
    data: { id: "t-terminal", name: "n", type: "C01", status: "RUNNING", progress: 0, config: { executionMode: "REAL_MODEL" }, result: {} },
  });
  const first = await markTaskStatusFailed(prismaStub, "t-terminal", { errorCode: "MODEL_TIMEOUT", errorMessage: "x", chargeAttempted: false });
  expect(first).toBe("FAILED_TRANSITIONED");

  // 2) 重复失败必须幂等：ALREADY_TERMINAL，且 errorCode 不被覆盖
  const second = await markTaskStatusFailed(prismaStub, "t-terminal", { errorCode: "MODEL_UPSTREAM_ERROR", errorMessage: "y", chargeAttempted: true });
  expect(second).toBe("ALREADY_TERMINAL");
  const after = await prismaStub.componenttask.findUnique({ where: { id: "t-terminal" } });
  expect(after.status).toBe("FAILED");
  expect((after.result as any).errorCode).toBe("MODEL_TIMEOUT");

  // 3) 已 SUCCESS 的终态绝不能被失败转换覆盖
  await prismaStub.componenttask.create({
    data: { id: "t-success-terminal", name: "n", type: "C01", status: "SUCCESS", progress: 100, config: { executionMode: "REAL_MODEL" }, result: {} },
  });
  const onSuccess = await markTaskStatusFailed(prismaStub, "t-success-terminal", { errorCode: "MODEL_TIMEOUT", errorMessage: "z", chargeAttempted: true });
  expect(onSuccess).toBe("ALREADY_TERMINAL");
  const still = await prismaStub.componenttask.findUnique({ where: { id: "t-success-terminal" } });
  expect(still.status).toBe("SUCCESS");

  // 4) 任务不存在：TASK_NOT_FOUND
  expect(await markTaskStatusFailed(prismaStub, "not-exist", { errorCode: "X", errorMessage: "y" })).toBe("TASK_NOT_FOUND");
});
