/**
 * R0-J6 定向正向验收：只闭合原 J3-02（并发终结完成误报）与 J3-04（待处理数量漏计）。
 * 其余 J3-01/03/05/06/07、J-KEYS 与 F01–F12 冻结，本文件不重做其验收。
 *
 * 断言全部是「修复后的正确结果」，不把旧缺陷被复现的绿灯当作修复通过：
 *  - overlapping-finalizers  → 两个实际请求都成功/幂等完成
 *  - shared-pending-count    → pendingCount = 1
 *  - drift-pending-count     → pendingCount = 1
 *
 * 隔离：内存 Prisma + 内存 fs + 真实 handler/service/route；DB/文件/模型/计费全部替换。
 * 并发用显式屏障控制「两个终结事务都已读到旧 PENDING，最终写入依次执行」；不代表真实 MySQL 锁验收。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（条件求值 + 唯一约束 + 事务回滚 + 显式屏障） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const unlinkFail = new Set<string>();
  const createFail = new Map<string, Error>();
  const updateFail = new Map<string, Error>();
  const findManyFail = new Set<string>();
  let currentUserId = "u1";
  let hideOpDelegate = false;
  let commitFailures = 0;
  let rawGate: ((sql: string) => Promise<void>) | null = null;
  let beforeOpMany: ((name: string, where: any) => Promise<void>) | null = null;
  let opManyCalls = 0;
  return {
    tables, unlinkFail, createFail, updateFail, findManyFail,
    get currentUserId() { return currentUserId; }, set currentUserId(v: string) { currentUserId = v; },
    get rawGate() { return rawGate; }, set rawGate(v) { rawGate = v; },
    get beforeOpMany() { return beforeOpMany; }, set beforeOpMany(v) { beforeOpMany = v; },
    get opManyCalls() { return opManyCalls; }, set opManyCalls(v) { opManyCalls = v; },
    setHideOpDelegate: (v: boolean) => { hideOpDelegate = v; },
    isOpDelegateHidden: () => hideOpDelegate,
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
    if (k === "userId_workspaceId" && v && typeof v === "object") {
      for (const [f, fv] of Object.entries(v)) if (row[f] !== fv) return false;
      continue;
    }
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
  throw new Error("[r0j6-mock] 未识别的 raw 语句: " + norm.slice(0, 120));
}

const applyData = (row: any, data: any) => {
  const next = { ...row };
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "set" in v) next[k] = (v as any).set;
    else next[k] = v;
  }
  return next;
};
const selectFields = (row: any, select: any) => {
  if (!select) return { ...row };
  const out: any = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
};

/** raw 写前的显式屏障（两处 $executeRaw 都会经过），用于让两个终结事务都先读到旧 PENDING */
async function awaitRawGate(sql: string) {
  const gate = h.rawGate;
  if (gate) await gate(sql);
}

function baseModel(name: string) {
  const rows = () => [...getTable(name).values()];
  const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
  return {
    findUnique: async ({ where, select }: any) => {
      const row = findRow(where);
      return row ? { ...selectFields(row, select) } : null;
    },
    findFirst: async ({ where, select }: any) => {
      const row = findRow(where);
      return row ? { ...selectFields(row, select) } : null;
    },
    findMany: async ({ where, select }: any) => {
      if (name === "storageoperation" && h.beforeOpMany) await h.beforeOpMany(name, where);
      if (name === "storageoperation") h.opManyCalls++;
      if (h.findManyFail.has(name)) throw new Error("injected findMany failure for " + name);
      return rows().filter((r) => matchRow(r, where)).map((r) => selectFields(r, select));
    },
    count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
    create: async ({ data }: any) => {
      const injected = h.createFail.get(name);
      if (injected) throw injected;
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
      const injected = h.updateFail.get(name);
      if (injected) throw injected;
      const row = findRow(where);
      if (!row) { const e: any = new Error(`P2025:${name}`); e.code = "P2025"; throw e; }
      const next = applyData(row, data);
      getTable(name).set(row.id ?? where.id, next);
      return { ...next };
    },
    updateMany: async ({ where, data }: any) => {
      const injected = h.updateFail.get(name);
      if (injected) throw injected;
      let count = 0;
      for (const row of rows()) if (matchRow(row, where)) { getTable(name).set(row.id, applyData(row, data)); count++; }
      return { count };
    },
    delete: async ({ where }: any) => {
      const row = findRow(where);
      if (!row) { const e: any = new Error(`P2025:${name}`); e.code = "P2025"; throw e; }
      getTable(name).delete(row.id ?? where.id);
      return { ...row };
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (const row of rows()) if (matchRow(row, where)) { getTable(name).delete(row.id); count++; }
      return { count };
    },
    upsert: async ({ where, create, update }: any) => {
      const row = findRow(where);
      if (row) { const next = applyData(row, update); getTable(name).set(row.id, next); return { ...next }; }
      const created = { ...create };
      if (!created.id) created.id = `auto_${Math.random().toString(36).slice(2)}`;
      getTable(name).set(created.id, created);
      return { ...created };
    },
  };
}

function txModel(name: string, undo: Array<() => void>) {
  const m: any = baseModel(name);
  return {
    ...m,
    create: async (args: any) => { const row = await m.create(args); undo.push(() => getTable(name).delete(row.id)); return row; },
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
      undo.push(() => { if (prev) getTable(name).set(prev.id, { ...prev }); else getTable(name).delete(row.id); });
      return row;
    },
  };
}

function makePrisma() {
  return new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "storageoperation" && h.isOpDelegateHidden()) return undefined;
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") {
        return async (query: any, ...values: any[]) => {
          const sql = typeof query === "string" ? query : query.join("?");
          await awaitRawGate(sql);
          return evalRaw(sql, values);
        };
      }
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [];
      if (prop === "$transaction") {
        return async (fn: (tx: any) => Promise<any>) => {
          const undo: Array<() => void> = [];
          const txProxy: any = new Proxy({}, {
            get: (_t2, p2: string) => {
              if (p2 === "storageoperation" && h.isOpDelegateHidden()) return undefined;
              if (p2 === "$executeRaw" || p2 === "$executeRawUnsafe") {
                return async (query: any, ...values: any[]) => {
                  const sql = typeof query === "string" ? query : query.join("?");
                  await awaitRawGate(sql);
                  const wsId = values.find((v) => typeof v === "string");
                  const target = [...getTable("workspacequota").values()].find((r) => r.workspaceId === wsId);
                  const prevUsed = target ? target.storageUsed : undefined;
                  const n = evalRaw(sql, values);
                  if (target && target.storageUsed !== prevUsed) undo.push(() => { target.storageUsed = prevUsed; });
                  return n;
                };
              }
              if (p2 === "$queryRaw" || p2 === "$queryRawUnsafe") return async () => [];
              return txModel(p2, undo);
            },
          });
          let result: any;
          try { result = await fn(txProxy); }
          catch (e) { for (const u of undo.reverse()) u(); throw e; }
          if (h.takeCommitFailure()) { for (const u of undo.reverse()) u(); throw new Error("COMMIT_FAILED_INJECTED"); }
          return result;
        };
      }
      return baseModel(prop);
    },
  });
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));

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

vi.mock("@/lib/text-extract", () => ({ extractTextFromBufferWithTimeout: vi.fn(async () => "文本") }));
vi.mock("@/lib/smart-summary", () => ({ generateSmartSummary: vi.fn(() => ({ overview: "摘要" })) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications-store", () => ({ addNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/credit-service", () => ({
  grantNewUserGift: vi.fn(async () => ({})), consumePoints: vi.fn(async () => ({})), refundConsumedPoints: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth", () => ({ validateUser: vi.fn(async () => ({ valid: true, user: { id: h.currentUserId } })) }));
vi.mock("@/lib/workspace-readonly-guard", () => ({ assertWorkspaceWritable: vi.fn(async () => {}) }));
vi.mock("@/lib/workspaceInit", () => ({ ensureDefaultComponents: vi.fn(async () => {}) }));
vi.mock("@/lib/serverCache", () => ({ clearServerCache: vi.fn(() => {}) }));

import type { StudioExecutionDeps } from "@/app/api/studio/handler";
import { prisma as mockedPrisma } from "@/lib/prisma";

function makeDeps(): StudioExecutionDeps {
  return {
    prisma: mockedPrisma as any,
    getUserId: vi.fn(async () => h.currentUserId),
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
      consumePoints: vi.fn(async () => ({} as any)), consumeAndCreateSettlementHold: vi.fn(async () => ({} as any)), refundConsumedPoints: vi.fn(async () => ({ ok: true })),
    },
    refundService: { enqueueRefundRecovery: vi.fn(async () => ({ ok: true })) },
    settlementService: {
      releaseSettlementHold: vi.fn(async () => ({ ok: true })), completeSettlement: vi.fn(async () => ({ ok: true })), enqueueSettlementRecovery: vi.fn(async () => ({ ok: true })),
    },
  } as unknown as StudioExecutionDeps;
}

// ══════════════ 数据辅助 ══════════════

function seedWorkspace() {
  h.tables.workspace = new Map([
    ["w1", { id: "w1", type: "PERSONAL", ownerId: "u1", name: "空间", plan: "STANDARD" }],
    ["w2", { id: "w2", type: "PERSONAL", ownerId: "u2", name: "空间2", plan: "STANDARD" }],
  ]);
  h.tables.workspacemember = new Map([["wm1", { id: "wm1", userId: "u1", workspaceId: "w1", role: "OWNER" }]]);
  h.tables.user = new Map([["u1", { id: "u1", name: "用户1" }], ["u2", { id: "u2", name: "用户2" }]]);
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
function seedQuota(wsId: string, used: bigint, limit = BigInt(-1)) {
  h.tables.workspacequota.set(`q-${wsId}`, { id: `q-${wsId}`, workspaceId: wsId, storageUsed: used, storageLimit: limit });
}
function doc(id: string, filePath: string | null, fileSize: number | null, opts: { ws?: string; uploader?: string } = {}) {
  const row = { id, workspaceId: opts.ws ?? "w1", title: id, status: "APPROVED", visibility: "PRIVATE", filePath, fileSize, uploaderId: opts.uploader ?? "u1", type: "doc" };
  h.tables.document.set(id, row);
  return row;
}
function seedClaim(opts: { opId?: string; ws?: string; userId?: string; filePath?: string; bytes?: number; documentId?: string; status?: string } = {}) {
  const opId = opts.opId ?? "del-w1-w1/x.bin";
  const id = `op_${opId}`;
  h.tables.storageoperation.set(id, {
    id, opId, workspaceId: opts.ws ?? "w1", userId: opts.userId ?? "u1", opType: "RELEASE",
    status: opts.status ?? "PENDING_CLEANUP", filePath: opts.filePath ?? "w1/x.bin",
    bytes: opts.bytes ?? 30, documentId: opts.documentId ?? "d1", note: "seed", updatedAt: new Date(),
  });
  return opId;
}
function absFile(rel: string): string {
  const pathMod = require("path");
  const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const key = norm.startsWith("assets/") ? norm : `assets/${norm}`;
  return pathMod.join(process.cwd(), "uploads", key);
}
function removeReq(assetId = "d1", workspaceId = "w1") {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify({ action: "remove_asset", assetId, workspaceId, reasonCode: "VIOLATION" }),
  });
}
function clearReq(workspaceId = "w1") {
  return new NextRequest("http://localhost/api/workspace/clear-data", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify({ workspaceId, confirmText: "确认删除" }),
  });
}
function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
const used = (ws = "w1") => h.tables.workspacequota.get(`q-${ws}`).storageUsed as bigint;
const claims = () => [...h.tables.storageoperation.values()];
const pendingClaims = () => claims().filter((o) => o.status === "PENDING_CLEANUP");

beforeEach(() => {
  h.tables = {};
  h.currentUserId = "u1";
  h.rawGate = null;
  h.beforeOpMany = null;
  h.opManyCalls = 0;
  h.unlinkFail.clear();
  h.createFail.clear();
  h.updateFail.clear();
  h.findManyFail.clear();
  h.setHideOpDelegate(false);
  h.setCommitFailures(0);
  memFiles.clear();
  seedWorkspace();
});

// ══════════════ J3-02：两个终结事务都读到旧 PENDING 时，后到者识别已提交完成 ══════════════

describe("R0-J6 J3-02：并发终结按已提交终态返回幂等完成，真实漂移仍阻断", () => {
  it("显式屏障：两个实际删除恢复请求均读到旧 PENDING，A 先提交、B 再继续 → 两者成功/幂等完成，仅扣减一次", async () => {
    seedQuota("w1", BigInt(30));
    seedQuota("w2", BigInt(10));
    doc("other", "w1/other.bin", 20); // 另一对象，应保持
    doc("w2doc", "w2/y.bin", 10, { ws: "w2", uploader: "u2" }); // 另一空间，应保持
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    memFiles.set(absFile("w1/other.bin"), Buffer.alloc(20));
    memFiles.set(absFile("w2/y.bin"), Buffer.alloc(10));
    seedClaim({ bytes: 30, documentId: "d1" }); // d1 文档已无，30 字节认领在途

    const firstReached = latch(), bothRead = latch(), finishSecond = latch();
    let arrivals = 0;
    // 屏障放在 quota 条件扣减（首次受保护写）之前：A/B 的终结事务都已读到旧 PENDING，写入依次执行
    h.rawGate = async (sql: string) => {
      if (sql.includes("storageUsed` = `storageUsed` -")) {
        arrivals++;
        if (arrivals === 1) { firstReached.resolve(); await bothRead.promise; }
        else if (arrivals === 2) { bothRead.resolve(); await finishSecond.promise; }
      }
    };

    const { runStudioPost } = await import("@/app/api/studio/handler");
    const a = runStudioPost(removeReq("d1"), makeDeps());
    await firstReached.promise;              // A 已读到旧 PENDING，停在扣减前
    const b = runStudioPost(removeReq("d1"), makeDeps()); // B 同样读到旧 PENDING
    const ra = await a;
    const ba = await (ra as any).json();
    finishSecond.resolve();                  // A 已提交 RELEASED，B 才继续扣减
    const rb = await b;
    const bb = await (rb as any).json();

    // 两个实际请求都得到成功/幂等完成，不再有 500/STORAGE_RELEASE_DRIFT
    expect(ra.status).toBe(200);
    expect(ba.data.pendingCleared).toBe(true);
    expect(rb.status).toBe(200);
    expect(bb.data.pendingCleared).toBe(true);
    expect(bb.code).not.toBe("STORAGE_RELEASE_DRIFT");
    expect(bb.error ?? "").not.toContain("人工核对");
    // 认领唯一且为 RELEASED；用量为 0 且只扣减 30 一次（arrivals=2 但仅一次条件命中）
    expect(claims().length).toBe(1);
    expect(claims()[0].status).toBe("RELEASED");
    expect(arrivals).toBe(2);
    expect(used("w1")).toBe(BigInt(0));
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(false);
    // 另一对象、另一空间不受影响
    expect(h.tables.document.has("other")).toBe(true);
    expect(memFiles.has(absFile("w1/other.bin"))).toBe(true);
    expect(h.tables.document.has("w2doc")).toBe(true);
    expect(used("w2")).toBe(BigInt(10));
  });

  it("第一次完成后再开始第二次请求 → 顺序幂等保持，不重复扣减", async () => {
    seedQuota("w1", BigInt(30));
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    seedClaim({ bytes: 30, documentId: "d1" });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const first = await runStudioPost(removeReq("d1"), makeDeps());
    expect(first.status).toBe(200);
    expect(used("w1")).toBe(BigInt(0));
    expect(claims()[0].status).toBe("RELEASED");
    const second = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (second as any).json();
    expect(second.status).toBe(200);
    expect(body.data.pendingCleared).not.toBe(true); // 无可恢复认领的幂等成功
    expect(used("w1")).toBe(BigInt(0));
    expect(claims().length).toBe(1);
  });

  it("真实 PENDING、bytes30、used10 → 实际恢复入口仍漂移阻断，used10 不清零、不伪装成功", async () => {
    seedQuota("w1", BigInt(10));
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    seedClaim({ bytes: 30, documentId: "d1" });
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(500);
    expect(body.code).toBe("STORAGE_RELEASE_DRIFT");
    expect(used("w1")).toBe(BigInt(10));
    expect(claims()[0].status).toBe("PENDING_CLEANUP");
    expect(memFiles.size).toBe(0); // 文件已在确认阶段清理，但不释放不足的用量
  });

  it("终结提交失败后重试 → 保留恢复依据，故障解除后仅释放一次", async () => {
    const { finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(30));
    const opId = seedClaim({ bytes: 30 });
    h.setCommitFailures(1);
    await expect(finalizeObjectCleanup("w1", opId, 30)).rejects.toThrow(/COMMIT_FAILED_INJECTED/);
    expect(used("w1")).toBe(BigInt(30));
    expect(claims()[0].status).toBe("PENDING_CLEANUP");
    const retry = await finalizeObjectCleanup("w1", opId, 30);
    expect(retry.finalized).toBe(true);
    expect(retry.drift).toBe(false);
    expect(used("w1")).toBe(BigInt(0));
    expect(claims()[0].status).toBe("RELEASED");
  });
});

// ══════════════ J3-04：pendingCount 按最终持久事实唯一计数 ══════════════

describe("R0-J6 J3-04：待清理数量与仍存在的认领一致，计量/对象保留不变", () => {
  it("两资料别名引用同对象 + 1 条 pending 认领；清空保留 → pendingCount=1（不再是 known/0）", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "assets/w1/x.bin", 30);
    doc("d2", "w1/x.bin", 30);
    seedClaim({ bytes: 30, documentId: "d1" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    const body = await (res as any).json();
    expect(body.storage.pendingCountKnown).toBe(true);
    expect(body.storage.pendingCount).toBe(1);
    expect(body.storage.pendingStillScope).toContain("非全部尚存认领");
    expect(pendingClaims().length).toBe(1);
    // 共享对象与计量完整保留
    expect(h.tables.document.size).toBe(2);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used("w1")).toBe(BigInt(30));
    expect(body.message).not.toContain("纯净出厂状态");
  });

  it("无文档、认领 bytes30 / used10 的真实漂移 → pendingCount=1，used10 保持", async () => {
    seedQuota("w1", BigInt(10));
    seedClaim({ bytes: 30, documentId: "d1" });
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    const body = await (res as any).json();
    expect(body.storage.driftSkipped).toBe(1);
    expect(body.storage.pendingCountKnown).toBe(true);
    expect(body.storage.pendingCount).toBe(1);
    expect(pendingClaims().length).toBe(1);
    expect(used("w1")).toBe(BigInt(10)); // 漂移不清零
    expect(body.message).not.toContain("纯净出厂状态");
  });

  it("一条恢复成功、一条共享保留 → 只计仍存在的唯一 pending 认领，完成数按事实", async () => {
    seedQuota("w1", BigInt(50));
    // c1：无引用、文件已不存在 → 恢复成功
    seedClaim({ opId: "del-w1-w1/a.bin", filePath: "w1/a.bin", bytes: 30, documentId: "a" });
    // c2：两资料别名引用同对象 → 共享保留
    seedClaim({ opId: "del-w1-w1/b.bin", filePath: "w1/b.bin", bytes: 20, documentId: "b" });
    doc("b1", "assets/w1/b.bin", 20);
    doc("b2", "w1/b.bin", 20);
    memFiles.set(absFile("w1/b.bin"), Buffer.alloc(20));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    const body = await (res as any).json();
    expect(body.storage.pendingRecovered).toBe(1);
    expect(body.storage.pendingCountKnown).toBe(true);
    expect(body.storage.pendingCount).toBe(1); // 唯一仍 PENDING 的 c2，不被两个循环重复计数
    expect(pendingClaims().map((o) => o.opId)).toEqual(["del-w1-w1/b.bin"]);
    expect(claims().find((o) => o.opId === "del-w1-w1/a.bin").status).toBe("RELEASED");
    expect(used("w1")).toBe(BigInt(20)); // 50 - 30，共享对象 20 保持计量
    expect(memFiles.has(absFile("w1/b.bin"))).toBe(true);
    expect(body.message).not.toContain("纯净出厂状态");
  });

  it("正常空集合 / 全部完成 → known=true、count=0，与持久终态一致", async () => {
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    seedQuota("w1", BigInt(0));
    const empty = await ((await POST(clearReq())) as any).json();
    expect(empty.storage.pendingCountKnown).toBe(true);
    expect(empty.storage.pendingCount).toBe(0);
    expect(empty.message).toContain("纯净出厂状态");

    // 一条正常资料全部完成：认领 RELEASED，未终结数为 0
    seedQuota("w1", BigInt(10));
    doc("d1", "w1/full.bin", 10);
    memFiles.set(absFile("w1/full.bin"), Buffer.alloc(10));
    const done = await ((await POST(clearReq())) as any).json();
    expect(done.storage.clearedCount).toBe(1);
    expect(pendingClaims().length).toBe(0);
    expect(done.storage.pendingCountKnown).toBe(true);
    expect(done.storage.pendingCount).toBe(0);
    expect(done.message).toContain("纯净出厂状态");
  });

  it("初始恢复查询失败（实际 0 条 / 2 条）→ unknown/null，不报完全成功", async () => {
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    for (const n of [0, 2]) {
      h.tables.storageoperation = new Map();
      if (n === 2) {
        seedClaim({ opId: "del-w1-w1/a.bin", filePath: "w1/a.bin", bytes: 15, documentId: "a" });
        seedClaim({ opId: "del-w1-w1/b.bin", filePath: "w1/b.bin", bytes: 15, documentId: "b" });
      }
      h.findManyFail.add("storageoperation");
      const body = await ((await POST(clearReq())) as any).json();
      expect(body.storage.pendingCountKnown).toBe(false);
      expect(body.storage.pendingCount).toBeNull();
      expect(body.storage.pendingStill).toBe(0);
      expect(body.storage.recoveryCheckFailed).toBe(true);
      expect(body.message).toContain("恢复检查失败，待清理数量未知");
      expect(body.message).not.toContain("纯净出厂状态");
      h.findManyFail.clear();
    }
  });

  it("最终计数/核实失败 → 数量未知且可诊断，不编造 0，不改认领/额度", async () => {
    seedQuota("w1", BigInt(10)); // 真实漂移：认领 30、用量 10，恢复正确阻断，认领与用量保持
    seedClaim({ bytes: 30, documentId: "d1" });
    // 第 1 次 findMany = 初始恢复查询（放行），第 2 次 = 最终核实（注入失败）
    h.beforeOpMany = async () => {
      if (h.opManyCalls + 1 >= 2) throw new Error("injected final pending count failure");
    };
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const res = await POST(clearReq());
    const body = await (res as any).json();
    expect(body.storage.pendingCountKnown).toBe(false);
    expect(body.storage.pendingCount).toBeNull();
    expect(body.storage.recoveryCheckFailed).toBe(true);
    expect(body.storage.recoveryCheckFailureCount).toBeGreaterThanOrEqual(1);
    expect(body.message).toContain("待清理数量未知");
    expect(body.message).not.toContain("纯净出厂状态");
    // 核实失败不得改动认领/额度：漂移不清零、认领仍在
    expect(used("w1")).toBe(BigInt(10));
    expect(pendingClaims().length).toBe(1);
  });
});
