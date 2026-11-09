/**
 * R0-J2 正向验收：接通真实入口并完成原 F13 存储闭环
 * 覆盖 §9 表格中 R0-J1 旧测试未覆盖的正向场景：
 * - J-UPLOAD：opId 重放冲突（跨空间/不同载荷/已释放）、并发同 opId（唯一约束+事务回滚）、
 *   提交失败回滚零残留、表未就绪 503 零副作用、附件清理协议、确认失败不吞
 * - J-RELEASE：共享引用保留、事务回滚、alreadyGone、漂移整体回滚
 * - J-CLEAR：失败对象保留记录与计量、认领唯一释放、漂移登记孤儿线索
 * - J-RECONCILE：大小写敏感对象身份、空文档+非零占用说明、独立 listObjects
 * 夹具与 schema 约束一致：storageoperation.opId 唯一约束、$executeRaw 真实条件求值、
 * 事务快照/回滚、提交故障注入、受控交错（§9）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（真实条件求值 + 唯一约束 + 事务语义） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const unlinkFail = new Set<string>(); // 模拟 unlink 非 ENOENT 失败
  const createFail = new Map<string, Error>(); // 模型 create 注入失败
  let rawGate: ((sql: string) => Promise<void>) | null = null;
  let rawGateVal: ((sql: string) => Promise<void>) | null = null;
  const setRawGate = (g: ((sql: string) => Promise<void>) | null) => { rawGateVal = g; };
  let commitFailures = 0;
  return {
    tables, writes, unlinkFail, createFail,
    setRawGate, getRawGate: () => rawGateVal,
    setCommitFailures: (n: number) => { commitFailures = n; },
    takeCommitFailure: () => (commitFailures > 0 ? (commitFailures--, true) : false),
  };
});

function getTable(name: string): Map<string, any> {
  if (!h.tables[name]) h.tables[name] = new Map();
  return h.tables[name];
}

function matchRow(row: any, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      for (const [op, ov] of Object.entries(v)) {
        const rv = row[k];
        if (op === "not") { if (rv === ov) return false; }
        else if (op === "notIn") { if (Array.isArray(ov) && ov.includes(rv)) return false; }
        else if (op === "in") { if (!Array.isArray(ov) || !ov.includes(rv)) return false; }
        else if (op === "gt") { if (!(rv > ov)) return false; }
        else if (op === "lt") { if (!(rv < ov)) return false; }
        else return false;
      }
    } else if (row[k] !== v) return false;
  }
  return true;
}

/** 对已知 raw 语句真实求值（与真实 SQL WHERE 条件一致，含 usage >= 0 写边界） */
function evalRaw(sql: string, values: any[]): number {
  const norm = sql.replace(/\s+/g, " ");
  const wsId = values.find((v) => typeof v === "string");
  const byteVal = (values.find((v) => typeof v === "bigint") ?? BigInt(0)) as bigint;
  const row = [...getTable("workspacequota").values()].find((r) => r.workspaceId === wsId);
  if (!row) return 0;
  const used = row.storageUsed as bigint;
  const limit = row.storageLimit as bigint;
  if (norm.includes("storageUsed` = `storageUsed` +") && norm.includes("`storageLimit` = -1")) {
    if (limit === BigInt(-1) && used >= BigInt(0)) { row.storageUsed = used + byteVal; return 1; }
    return 0;
  }
  if (norm.includes("storageUsed` = `storageUsed` +") && norm.includes("<= `storageLimit`")) {
    if (used >= BigInt(0) && used + byteVal <= limit) { row.storageUsed = used + byteVal; return 1; }
    return 0;
  }
  if (norm.includes("storageUsed` = `storageUsed` -") && norm.includes("storageUsed` >= ")) {
    if (used >= byteVal) { row.storageUsed = used - byteVal; return 1; }
    return 0;
  }
  throw new Error("[r0j2-mock] 未识别的 raw 语句: " + norm.slice(0, 120));
}

/** [§9] 事务内模型操作：每个写操作记录撤销项（仅本事务的写可回滚，不影响并发事务已提交的写） */
function txModel(name: string, undo: Array<() => void>, baseModel: (n: string) => any) {
  const m: any = baseModel(name);
  return {
    ...m,
    create: async (args: any) => {
      const row = await m.create(args);
      undo.push(() => getTable(name).delete(row.id));
      return row;
    },
    update: async (args: any) => {
      const prev = [...getTable(name).values()].find((r) => matchRow(r, args.where));
      const row = await m.update(args);
      if (prev) undo.push(() => getTable(name).set(prev.id, { ...prev }));
      return row;
    },
    updateMany: async (args: any) => {
      const prevRows = [...getTable(name).values()].filter((r) => matchRow(r, args.where)).map((r) => ({ ...r }));
      const res = await m.updateMany(args);
      if (prevRows.length) undo.push(() => { for (const r of prevRows) getTable(name).set(r.id, { ...r }); });
      return res;
    },
    delete: async (args: any) => {
      const prev = [...getTable(name).values()].find((r) => matchRow(r, args.where));
      const row = await m.delete(args);
      if (prev) undo.push(() => getTable(name).set(prev.id, { ...prev }));
      return row;
    },
    deleteMany: async (args: any) => {
      const prevRows = [...getTable(name).values()].filter((r) => matchRow(r, args.where)).map((r) => ({ ...r }));
      const res = await m.deleteMany(args);
      if (prevRows.length) undo.push(() => { for (const r of prevRows) getTable(name).set(r.id, { ...r }); });
      return res;
    },
    upsert: async (args: any) => {
      const prev = [...getTable(name).values()].find((r) => matchRow(r, args.where));
      const row = await m.upsert(args);
      undo.push(() => {
        if (prev) getTable(name).set(prev.id, { ...prev });
        else getTable(name).delete(row.id);
      });
      return row;
    },
  };
}

function makePrisma() {
  const record = (model: string, method: string) => h.writes.push(`${model}.${method}`);
  const model = (name: string) => {
    const rows = () => [...getTable(name).values()];
    const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
    const applyData = (row: any, data: any) => {
      const next = { ...row };
      for (const [k, v] of Object.entries(data || {})) {
        if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "set" in v) {
          next[k] = (v as any).set;
        } else {
          next[k] = v;
        }
      }
      return next;
    };
    return {
      findUnique: async ({ where, select }: any) => {
        const row = findRow(where);
        if (!row) return null;
        if (!select) return { ...row };
        const out: any = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
        return out;
      },
      findFirst: async ({ where, select }: any) => {
        const row = rows().find((r) => matchRow(r, where)) ?? null;
        if (!row) return null;
        if (!select) return { ...row };
        const out: any = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
        return out;
      },
      findMany: async ({ where, select }: any) =>
        rows().filter((r) => matchRow(r, where)).map((r) => (select ? selectFields(r, select) : { ...r })),
      count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
      create: async ({ data }: any) => {
        record(name, "create");
        const injected = h.createFail.get(name);
        if (injected) throw injected;
        // [§9] 真实唯一约束：storageoperation.opId 冲突 → P2002
        if (name === "storageoperation" && data?.opId) {
          const dup = rows().find((r) => r.opId === data.opId);
          if (dup) { const e: any = new Error("Unique constraint failed"); e.code = "P2002"; throw e; }
        }
        const row = { ...data };
        if (!row.id) row.id = `auto_${Math.random().toString(36).slice(2)}`;
        getTable(name).set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        record(name, "update");
        const row = findRow(where);
        if (!row) { const e: any = new Error(`P2025:${name}`); e.code = "P2025"; throw e; }
        const next = applyData(row, data);
        getTable(name).set(row.id ?? where.id, next);
        return { ...next };
      },
      updateMany: async ({ where, data }: any) => {
        record(name, "updateMany");
        let count = 0;
        for (const row of rows()) {
          if (matchRow(row, where)) { getTable(name).set(row.id, applyData(row, data)); count++; }
        }
        return { count };
      },
      delete: async ({ where }: any) => {
        record(name, "delete");
        const row = findRow(where);
        if (!row) { const e: any = new Error(`P2025:${name}`); e.code = "P2025"; throw e; }
        getTable(name).delete(row.id ?? where.id);
        return { ...row };
      },
      deleteMany: async ({ where }: any) => {
        record(name, "deleteMany");
        let count = 0;
        for (const row of rows()) {
          if (matchRow(row, where)) { getTable(name).delete(row.id); count++; }
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        record(name, "upsert");
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
      },
    };
  };
  const selectFields = (row: any, select: any) => {
    if (!select) return { ...row };
    const out: any = {};
    for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
    return out;
  };
  const clientProxy: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$executeRaw" || prop === "$executeRawUnsafe") {
          return async (query: TemplateStringsArray | { sql?: string }, ...values: any[]) => {
            const sql = typeof query === "string" ? query : (query as TemplateStringsArray).join("?");
            const gate = h.getRawGate();
            if (gate) await gate(sql);
            return evalRaw(sql, values);
          };
        }
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [];
        // [§9] 事务语义：仅回滚本事务自身的写操作（行级隔离模拟），提交可注入失败。
        // 并发另一事务已提交的写不受本事务回滚影响（与真实 MySQL 行为一致）。
        if (prop === "$transaction") {
          return async (fn: (tx: any) => Promise<any>) => {
            const undo: Array<() => void> = [];
            const txProxy: any = new Proxy({}, {
              get: (_t2, p2: string) => {
                if (p2 === "$executeRaw" || p2 === "$executeRawUnsafe") {
                  return async (query: TemplateStringsArray | { sql?: string }, ...values: any[]) => {
                    const sql = typeof query === "string" ? query : (query as TemplateStringsArray).join("?");
                    const gate = h.getRawGate();
                    if (gate) await gate(sql);
                    // raw 目标行（workspacequota，按首个字符串参数定位）：记录前值用于回滚
                    const wsId = values.find((v) => typeof v === "string");
                    const target = [...getTable("workspacequota").values()].find((r) => r.workspaceId === wsId);
                    const prevUsed = target ? target.storageUsed : undefined;
                    const n = evalRaw(sql, values);
                    if (target && target.storageUsed !== prevUsed) {
                      const row = target;
                      undo.push(() => { row.storageUsed = prevUsed; });
                    }
                    return n;
                  };
                }
                if (p2 === "$queryRaw" || p2 === "$queryRawUnsafe") return async () => [];
                return txModel(p2, undo, model);
              },
            });
            let result: any;
            try {
              result = await fn(txProxy);
            } catch (e) {
              for (const u of undo.reverse()) u();
              throw e;
            }
            if (h.takeCommitFailure()) {
              for (const u of undo.reverse()) u();
              throw new Error("COMMIT_FAILED_INJECTED");
            }
            return result;
          };
        }
        return model(prop);
      },
    },
  );
  return clientProxy;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));

// 文件 IO：内存文件表
const memFiles = new Map<string, Buffer>();
vi.mock("fs/promises", () => {
  const impl = {
    mkdir: async () => {},
    writeFile: async (p: string, data: Buffer) => { memFiles.set(p, data); },
    readFile: async (p: string) => {
      const d = memFiles.get(p);
      if (!d) { const e: any = new Error("ENOENT: no such file"); e.code = "ENOENT"; throw e; }
      return d;
    },
    unlink: async (p: string) => {
      if (h.unlinkFail.has(p)) { const e: any = new Error("EACCES: permission denied"); e.code = "EACCES"; throw e; }
      if (!memFiles.has(p)) { const e: any = new Error("ENOENT: no such file"); e.code = "ENOENT"; throw e; }
      memFiles.delete(p);
    },
    stat: async (p: string) => {
      const d = memFiles.get(p);
      if (!d) { const e: any = new Error("ENOENT: no such file"); e.code = "ENOENT"; throw e; }
      return { size: d.length, isFile: () => true };
    },
    rm: async () => {},
  };
  return { ...impl, default: impl };
});

vi.mock("@/lib/text-extract", () => ({
  extractTextFromBufferWithTimeout: vi.fn(async () => "提取的文本内容"),
}));
vi.mock("@/lib/smart-summary", () => ({ generateSmartSummary: vi.fn(() => ({ overview: "智能摘要" })) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications-store", () => ({ addNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/credit-service", () => ({
  grantNewUserGift: vi.fn(async () => ({})),
  consumePoints: vi.fn(async () => ({})),
  refundConsumedPoints: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth", () => ({
  validateUser: vi.fn(async () => ({ valid: true, user: { id: "u1" } })),
}));
vi.mock("@/lib/workspace-readonly-guard", () => ({
  assertWorkspaceWritable: vi.fn(async () => {}),
}));
vi.mock("@/lib/workspaceInit", () => ({
  ensureDefaultComponents: vi.fn(async () => {}),
}));
vi.mock("@/lib/serverCache", () => ({ clearServerCache: vi.fn(() => {}) }));

import type { StudioExecutionDeps } from "@/app/api/studio/handler";
import { prisma as mockedPrisma } from "@/lib/prisma";

function makeDeps(): StudioExecutionDeps {
  return {
    prisma: mockedPrisma as any,
    getUserId: vi.fn(async () => "u1"),
    createModelAdapter: vi.fn(async () => ({} as any)),
    getActiveContractSnapshot: vi.fn(async () => ({} as any)),
    requireWorkspaceMembership: vi.fn(async () => true),
    requireWorkspacePermission: vi.fn(async () => true),
    getRestrictedComponentIds: vi.fn(async () => [] as string[]),
    getOrCreateQuota: vi.fn(async () => ({ id: "q1", workspaceId: "w1" })),
    checkAndResetQuotaCycle: vi.fn(async () => {}),
    resolveDefaultDeployment: vi.fn(async () => ({} as any)),
    touchComponentUsage: vi.fn(async () => {}),
    writeAuditLog: vi.fn(async () => {}),
    creditService: {
      consumePoints: vi.fn(async () => ({} as any)),
      consumeAndCreateSettlementHold: vi.fn(async () => ({} as any)),
      refundConsumedPoints: vi.fn(async () => ({ ok: true })),
    },
    refundService: { enqueueRefundRecovery: vi.fn(async () => ({ ok: true })) },
    settlementService: {
      releaseSettlementHold: vi.fn(async () => ({ ok: true })),
      completeSettlement: vi.fn(async () => ({ ok: true })),
      enqueueSettlementRecovery: vi.fn(async () => ({ ok: true })),
    },
  } as unknown as StudioExecutionDeps;
}

function multipartReq(body: Record<string, string>, file: { name: string; type: string; content: string } | null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.append(k, v);
  if (file) fd.append("file", new Blob([file.content], { type: file.type }), file.name);
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: fd,
  });
}

function seedWorkspace() {
  h.tables.workspace = new Map([
    ["w1", { id: "w1", type: "PERSONAL", ownerId: "u1", name: "空间", plan: "STANDARD" }],
    ["w2", { id: "w2", type: "PERSONAL", ownerId: "u2", name: "空间2", plan: "STANDARD" }],
  ]);
  h.tables.workspacemember = new Map([
    ["wm1", { id: "wm1", userId: "u1", workspaceId: "w1", role: "OWNER", monthlyTokenLimit: null, monthlyTokenUsed: 0, tokenBalance: 10000 }],
  ]);
  h.tables.user = new Map([
    ["u1", { id: "u1", name: "用户", membershipLevel: "FREE" }],
    ["u2", { id: "u2", name: "用户2", membershipLevel: "FREE" }],
  ]);
  h.tables.postmember = new Map();
  h.tables.operationlog = new Map();
  h.tables.componenttask = new Map();
  h.tables.componentusage = new Map();
  h.tables.tenant = new Map();
  h.tables.document = new Map();
  h.tables.documentremoval = new Map();
  h.tables.workspacequota = new Map();
  h.tables.storageoperation = new Map();
}

function seedQuota(wsId: string, used: bigint, limit: bigint) {
  h.tables.workspacequota.set(`q-${wsId}`, { id: `q-${wsId}`, workspaceId: wsId, storageUsed: used, storageLimit: limit });
}

beforeEach(() => {
  h.tables = {};
  h.writes.length = 0;
  h.setRawGate(null);
  h.unlinkFail.clear();
  h.createFail.clear();
  h.setCommitFailures(0);
  memFiles.clear();
  seedWorkspace();
});

// ══════════════ A. opId 幂等/冲突/并发（J-UPLOAD §2.1/§2.2） ══════════════

describe("R0-J2 A：opId 重放按事实分类（§2.1）", () => {
  it("同 opId 重放（同空间/操作者/字节/活动状态）→ deduped，占用只一次", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    const r1 = await reserveStorageBytes("w1", 100, "op-x", "u1");
    expect(r1.deduped).toBe(false);
    const r2 = await reserveStorageBytes("w1", 100, "op-x", "u1");
    expect(r2.deduped).toBe(true);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100)); // 不重复占用
    expect([...h.tables.storageoperation.values()].filter((o) => o.opId === "op-x").length).toBe(1);
  });

  it("同 opId 不同载荷（字节不同）→ OP_CONFLICT 409，零新占用", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 100, "op-y", "u1");
    await expect(reserveStorageBytes("w1", 200, "op-y", "u1")).rejects.toMatchObject({
      code: "STORAGE_OP_CONFLICT", status: 409,
    });
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100));
  });

  it("同 opId 跨空间重放 → OP_CONFLICT 409，不共享去重", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    seedQuota("w2", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 100, "op-z", "u1");
    await expect(reserveStorageBytes("w2", 100, "op-z", "u1")).rejects.toMatchObject({
      code: "STORAGE_OP_CONFLICT", status: 409,
    });
    expect(h.tables.workspacequota.get("q-w2").storageUsed).toBe(BigInt(0)); // 第二空间零占用
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100));
  });

  it("同 opId 已释放状态重放 → OP_CONFLICT（不得 dedup 后继续创建新对象）", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 100, "op-r", "u1");
    const op = [...h.tables.storageoperation.values()].find((o) => o.opId === "op-r");
    op.status = "RELEASED"; // 已释放终态
    await expect(reserveStorageBytes("w1", 100, "op-r", "u1")).rejects.toMatchObject({
      code: "STORAGE_OP_CONFLICT", status: 409,
    });
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100)); // 未新增占用
  });

  it("记录 userId 使用服务端身份（不写空字符串）", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 10, "op-u", "u1");
    const op = [...h.tables.storageoperation.values()].find((o) => o.opId === "op-u");
    expect(op.userId).toBe("u1");
    expect(op.workspaceId).toBe("w1");
    expect(op.bytes).toBe(10);
  });
});

describe("R0-J2 B：并发同 opId 与提交回滚（§2.2/§9）", () => {
  it("两个相同 opId 并发 → 只产生一次占用；P2002 回滚不留孤立增量", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    // 受控交错：A 的 UPDATE 等待 B 的 UPDATE 到达后再继续（两读旧值并发窗口）
    let releaseBarrier: (() => void) | null = null;
    const barrierPromise = new Promise<void>((r) => { releaseBarrier = r; });
    let rawCalls = 0;
    h.setRawGate(async () => {
      rawCalls++;
      if (rawCalls === 1) await barrierPromise; // A 等待 B 进入
      else releaseBarrier!(); // B 到达 → 放行 A
    });
    const results = await Promise.allSettled([
      reserveStorageBytes("w1", 60, "op-c", "u1"),
      reserveStorageBytes("w1", 60, "op-c", "u1"),
    ]);
    h.setRawGate(null);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(2); // A 成功；B 经 P2002 → 按事实 dedup
    // -1 不限分支：两次 UPDATE 都命中 +60 → 但 B 的事务因 opId 唯一约束整体回滚 → 最终一次占用
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(60));
    const ops = [...h.tables.storageoperation.values()].filter((o) => o.opId === "op-c");
    expect(ops.length).toBe(1); // 唯一约束保证一个已定义状态
    expect(ops[0].status).toBe("RESERVED");
  });

  it("提交故障注入 → 预留与操作记录整体回滚，零孤立增量", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    h.setCommitFailures(1);
    await expect(reserveStorageBytes("w1", 50, "op-f", "u1")).rejects.toThrow(/COMMIT_FAILED_INJECTED/);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 回滚零残留
    expect([...h.tables.storageoperation.values()].filter((o) => o.opId === "op-f").length).toBe(0);
  });

  it("表未就绪（P2021）→ 503 STORAGE_QUOTA_NOT_READY，任何额度增量之前稳定拒绝", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    h.setRawGate(async () => {
      const e: any = new Error("Table `db.workspacequota` does not exist");
      e.code = "P2021";
      throw e;
    });
    await expect(reserveStorageBytes("w1", 10, "op-n", "u1")).rejects.toMatchObject({
      code: "STORAGE_QUOTA_NOT_READY", status: 503,
    });
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0));
  });
});

// ══════════════ C. handler 上传协议（§2.3） ══════════════

describe("R0-J2 C：两条上传链路清理协议", () => {
  it("upload_doc 超限（其他空间限额 0 语义同源：有限上限不足）→ 副作用前 403 拒绝", async () => {
    seedQuota("w1", BigInt(100), BigInt(100)); // 无余量
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "x", visibility: "PRIVATE", workspaceId: "w1" }, { name: "a.pdf", type: "application/pdf", content: "x" }),
      makeDeps(),
    );
    expect(res.status).toBe(403);
    const body = await (res as any).json();
    expect(body.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(memFiles.size).toBe(0); // 零文件副作用
    expect(h.tables.document.size).toBe(0);
    expect([...h.tables.storageoperation.values()].length).toBe(0); // 零操作记录残留
  });

  it("0 字节物理文件 → 操作记录 bytes=0，不产生容量增量，元信息保留 0", async () => {
    seedQuota("w1", BigInt(0), BigInt(-1));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "空文件", visibility: "PRIVATE", workspaceId: "w1" }, { name: "empty.txt", type: "text/plain", content: "" }),
      makeDeps(),
    );
    expect(res.status).toBe(200);
    const doc = [...h.tables.document.values()][0];
    expect(doc.fileSize).toBe(0); // 元信息保留 0（不归一为 null）
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 不增加容量
    const ops = [...h.tables.storageoperation.values()];
    expect(ops.length).toBe(1);
    expect(ops[0].bytes).toBe(0);
    expect(ops[0].status).toBe("CONFIRMED"); // 确认分支不因空 ID 跳过
    expect(ops[0].documentId).toBe(doc.id);
  });

  it("upload_knowledge_attachment doc.create 失败 → 清理文件 + 释放预留，无假成功无残留文档行", async () => {
    seedQuota("w1", BigInt(0), BigInt(-1));
    h.tables.document.set("kn-1", { id: "kn-1", workspaceId: "w1", type: "knowledge", status: "APPROVED", uploaderId: "u1" });
    h.createFail.set("document", new Error("doc create injected failure"));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_knowledge_attachment", knowledgeId: "kn-1", workspaceId: "w1" }, { name: "附件.pdf", type: "application/pdf", content: "附件内容" }),
      makeDeps(),
    );
    expect(res.status).toBe(500);
    const body = await (res as any).json();
    expect(body.success).toBe(false);
    expect(h.tables.document.size).toBe(1); // 只有父条目，附件行未残留
    expect(memFiles.size).toBe(0); // 物理文件已清理
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 预留已释放
  });

  it("upload_knowledge_attachment 成功 → 确认记录回填 filePath 与 documentId", async () => {
    seedQuota("w1", BigInt(0), BigInt(-1));
    h.tables.document.set("kn-2", { id: "kn-2", workspaceId: "w1", type: "knowledge", status: "APPROVED", uploaderId: "u1" });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_knowledge_attachment", knowledgeId: "kn-2", workspaceId: "w1" }, { name: "附件.pdf", type: "application/pdf", content: "附件内容" }),
      makeDeps(),
    );
    expect(res.status).toBe(200);
    const attDoc = [...h.tables.document.values()].find((d) => d.parentId === "kn-2");
    expect(attDoc).toBeTruthy();
    const op = [...h.tables.storageoperation.values()][0];
    expect(op.status).toBe("CONFIRMED");
    expect(op.filePath).toBe(attDoc.filePath);
    expect(op.documentId).toBe(attDoc.id);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(attDoc.fileSize));
  });
});

// ══════════════ D. 释放原子绑定（J-RELEASE §3） ══════════════

describe("R0-J3 D：认领/终结释放协议（替代 deleteDocumentsAndReleaseStorage）", () => {
  it("共享引用（别名一致身份）→ 记录删除但字节不释放、对象保留；最后引用删除才释放", async () => {
    const { claimObjectCleanup, finalizeObjectCleanup, closeClaimWithoutRelease, countOtherReferences, objectPathAliases } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(100), BigInt(-1));
    // 已知别名：assets/w1/shared.pdf 与 w1/shared.pdf 指向同一对象
    h.tables.document.set("d1", { id: "d1", workspaceId: "w1", filePath: "assets/w1/shared.pdf", fileSize: 100, uploaderId: "u1" });
    h.tables.document.set("d2", { id: "d2", workspaceId: "w1", filePath: "w1/shared.pdf", fileSize: 100, uploaderId: "u2" });
    expect(objectPathAliases("assets/w1/shared.pdf")).toContain("w1/shared.pdf");
    const refs = await countOtherReferences("w1", "assets/w1/shared.pdf", ["d1"]);
    expect(refs).toBe(1); // 别名身份识别（原始字符串相等查询会漏）
    const claim = await claimObjectCleanup("w1", "assets/w1/shared.pdf", 100, { userId: "u1", documentId: "d1" });
    expect(claim.state).toBe("claimed");
    // 共享保留路径：删行 + 认领关闭（不释放）
    h.tables.document.delete("d1");
    await closeClaimWithoutRelease(claim.claimOpId!, "共享引用保留");
    const claimOp = [...h.tables.storageoperation.values()].find((o) => o.opId === claim.claimOpId);
    expect(claimOp.status).toBe("CANCELLED"); // 终态：对账不再当在途
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100)); // 占用未变
    // 最后引用删除 → 认领重开（CANCELLED → PENDING_CLEANUP）→ 终结释放
    const refs2 = await countOtherReferences("w1", "w1/shared.pdf", ["d2"]);
    expect(refs2).toBe(0);
    const claim2 = await claimObjectCleanup("w1", "w1/shared.pdf", 100, { userId: "u2", documentId: "d2" });
    expect(claim2.state).toBe("claimed"); // 重开成功
    const fin = await finalizeObjectCleanup("w1", claim2.claimOpId!, 100);
    expect(fin.released).toBe(true);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0));
  });

  it("终结幂等：事务内先识别已释放终态，重放幂等不重复扣减、不报新漂移", async () => {
    const { claimObjectCleanup, finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(100), BigInt(-1));
    const c1 = await claimObjectCleanup("w1", "w1/once.pdf", 100, { userId: "u1" });
    const fin1 = await finalizeObjectCleanup("w1", c1.claimOpId!, 100);
    expect(fin1.released).toBe(true);
    // [R0-J5 J3-02] 重复终结：事务内先识别 RELEASED 终态 → 幂等事实，不再扣量、不误判为新漂移
    const fin2 = await finalizeObjectCleanup("w1", c1.claimOpId!, 100);
    expect(fin2.released).toBe(false);
    expect(fin2.finalized).toBe(true);
    expect(fin2.alreadyReleased).toBe(true);
    expect(fin2.drift).toBe(false);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 只释放一次
    // 重放认领 → already-released（不得再破坏性操作）
    const c2 = await claimObjectCleanup("w1", "w1/once.pdf", 100, { userId: "u1" });
    expect(c2.state).toBe("already-released");
  });

  it("终结提交故障 → 整体回滚：占用不变、认领保持待清理（可重试）", async () => {
    const { claimObjectCleanup, finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(100), BigInt(-1));
    const c = await claimObjectCleanup("w1", "w1/commit-fail.pdf", 100, { userId: "u1" });
    h.setCommitFailures(1);
    await expect(finalizeObjectCleanup("w1", c.claimOpId!, 100)).rejects.toThrow(/COMMIT_FAILED_INJECTED/);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100)); // 回滚：占用不变
    const op = [...h.tables.storageoperation.values()].find((o) => o.opId === c.claimOpId);
    expect(op.status).toBe("PENDING_CLEANUP"); // 保持待清理（可重试完成）
  });

  it("终结漂移（used < 待释放）→ 不清零、认领保持待清理", async () => {
    const { claimObjectCleanup, finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(50), BigInt(-1)); // 历史漂移：占用 50 但对象 100
    const c = await claimObjectCleanup("w1", "w1/drift.pdf", 100, { userId: "u1" });
    const fin = await finalizeObjectCleanup("w1", c.claimOpId!, 100);
    expect(fin.drift).toBe(true);
    expect(fin.released).toBe(false);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(50)); // 不清零
    const op = [...h.tables.storageoperation.values()].find((o) => o.opId === c.claimOpId);
    expect(op.status).toBe("PENDING_CLEANUP");
  });

  it("认领持久化失败（非约束类写错误）→ 抛 CLAIM_FAILED，调用方中止破坏性步骤", async () => {
    // 模拟 storageoperation create 注入失败
    const { claimObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(100), BigInt(-1));
    h.createFail.set("storageoperation", new Error("db write failure"));
    await expect(claimObjectCleanup("w1", "w1/claim-fail.pdf", 100, { userId: "u1" })).rejects.toMatchObject({
      code: "STORAGE_CLAIM_FAILED", status: 500,
    });
    h.createFail.delete("storageoperation");
  });
});

// ══════════════ E. clear-data 认领协议（J-CLEAR §4） ══════════════

describe("R0-J2 E：clear-data 安全认领", () => {
  function clearReq() {
    return new NextRequest("http://localhost/api/workspace/clear-data", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({ workspaceId: "w1", confirmText: "确认删除" }),
    });
  }

  it("失败对象保留记录、文件关联与计量；成功对象认领释放；如实返回部分明细", async () => {
    seedQuota("w1", BigInt(70), BigInt(-1));
    h.tables.document.set("ok1", { id: "ok1", workspaceId: "w1", title: "可清资料", filePath: "w1/ok1.bin", fileSize: 30, uploaderId: "u1", type: "doc" });
    h.tables.document.set("fail1", { id: "fail1", workspaceId: "w1", title: "失败资料", filePath: "w1/fail1.bin", fileSize: 40, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    memFiles.set(pathMod.join(process.cwd(), "uploads", "assets", "w1", "ok1.bin"), Buffer.from("A"));
    const absFail = pathMod.join(process.cwd(), "uploads", "assets", "w1", "fail1.bin");
    memFiles.set(absFail, Buffer.from("B"));
    h.unlinkFail.add(absFail); // 注入物理删除失败（EACCES）

    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    expect(res.status).toBe(200);
    const body = await (res as any).json();
    expect(body.success).toBe(true);
    expect(body.storage.clearedCount).toBe(1);
    expect(body.storage.failedCount).toBe(1);
    expect(body.storage.failedObjects[0].id).toBe("fail1");
    // 失败对象：记录保留（不是全空间 deleteMany）、计量保留
    expect(h.tables.document.has("fail1")).toBe(true);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(40)); // 70-30 仅成功对象释放
    // 成功对象：记录已删、文件已清
    expect(h.tables.document.has("ok1")).toBe(false);
    expect([...memFiles.values()].length).toBe(1); // 仅失败对象文件保留
  });

  it("释放漂移 → 文件已删但占用不扣减，登记孤儿恢复线索（PENDING_CLEANUP）", async () => {
    seedQuota("w1", BigInt(10), BigInt(-1)); // 漂移：占用 10 但对象 50
    h.tables.document.set("drift1", { id: "drift1", workspaceId: "w1", title: "漂移资料", filePath: "w1/drift1.bin", fileSize: 50, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    memFiles.set(pathMod.join(process.cwd(), "uploads", "assets", "w1", "drift1.bin"), Buffer.from("D"));

    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    const body = await (res as any).json();
    expect(body.storage.driftSkipped).toBe(1);
    expect(h.tables.document.has("drift1")).toBe(false); // 认领删除已提交
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(10)); // 不盲目扣减/清零
    const leads = [...h.tables.storageoperation.values()].filter((o) => o.status === "PENDING_CLEANUP" && o.filePath === "w1/drift1.bin");
    expect(leads.length).toBe(1); // 孤儿恢复线索已登记
  });
});

// ══════════════ F. 对账边界（J-RECONCILE §8） ══════════════

describe("R0-J2 F：对账对象身份与覆盖", () => {
  it("大小写不同对象（A.txt / a.txt）→ 两个唯一身份，不 toLowerCase 合并", async () => {
    const { reconcileWorkspaceStorage } = await import("@/lib/storage-quota");
    h.tables.document.set("c1", { id: "c1", workspaceId: "w1", filePath: "w1/A.txt", fileSize: 10, uploaderId: "u1" });
    h.tables.document.set("c2", { id: "c2", workspaceId: "w1", filePath: "w1/a.txt", fileSize: 20, uploaderId: "u1" });
    const report = await reconcileWorkspaceStorage("w1");
    expect(report.docs.uniqueObjects).toBe(2); // 不合并
    expect(report.docs.physicalBytesSum).toBe("30");
    expect(report.docs.duplicateRefs.length).toBe(0);
  });

  it("空文档集合 + 非零占用 → diff 如实呈现且可由在途预留解释", async () => {
    const { reconcileWorkspaceStorage, reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 70, "op-inflight", "u1"); // 在途预留 70
    const report = await reconcileWorkspaceStorage("w1");
    expect(report.docs.uniqueObjects).toBe(0);
    expect(report.usageDrift).not.toBeNull();
    expect(report.usageDrift!.quotaUsed).toBe("70");
    expect(report.usageDrift!.inFlightBytes).toBe("70");
    expect(report.usageDrift!.diff).toBe("70");
    // note 明确「可由在途预留解释」，不留未解释差异
    expect(report.notes.some((n) => n.includes("可由在途预留/待清理认领解释"))).toBe(true);
  });

  it("独立 listObjects（无 fileExists）→ 被使用且 coverage 如实区分", async () => {
    const { reconcileWorkspaceStorage } = await import("@/lib/storage-quota");
    h.tables.document.set("c3", { id: "c3", workspaceId: "w1", filePath: "w1/only.txt", fileSize: 10, uploaderId: "u1" });
    let listCalls = 0;
    const report = await reconcileWorkspaceStorage("w1", {
      listObjects: async () => { listCalls++; return [{ key: "w1/only.txt", size: 10 }, { key: "w1/orphan.bin", size: 5 }]; },
    });
    expect(listCalls).toBe(1); // 独立调用，不要求 fileExists
    expect(report.physical.orphanObjects.some((o) => o.key.includes("orphan.bin"))).toBe(true);
  });
});

vi.mock("@/lib/parse-admission",()=>({acquireParseLease:vi.fn(async(input:any)=>({leaseId:"isolated-parse",claimToken:"isolated-token",instanceId:"offline",userId:input.userId,workUnits:input.workUnits})),releaseParseLease:vi.fn(async()=>true),quarantineParseLease:vi.fn(async()=>{}),sweepParseLeases:vi.fn(async()=>0)}));
