/**
 * R0-J5 定向正向验收：只闭合原 J3-01/02/03/04/05/07 的剩余分支（J3-06 已冻结）。
 * 复用 R0-J4 独立审核夹具口径：内存 Prisma + 内存 fs + 真实 handler/service/route，
 * 数据库、文件、模型、计费全部隔离；并发用显式屏障交错，不连真实库/云/付费。
 *
 * 断言全部是「修复后的正向目标」，不把缺陷现象当作验收。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（真实条件求值 + 唯一约束 + 行级事务回滚 + 显式屏障钩子） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const unlinkFail = new Set<string>();
  const createFail = new Map<string, Error>();
  const deleteFail = new Map<string, Error>();
  const updateFail = new Map<string, Error>();
  const findManyFail = new Set<string>();
  let currentUserId = "u1";
  let deleteManyZero = false;
  let columnMissing = false;
  let hideOpDelegate = false;
  let commitFailures = 0;
  let beforeUnlink: ((p: string) => Promise<void>) | null = null;
  let afterDocDelete: ((info: { where: any; count: number }) => Promise<void>) | null = null;
  let beforeOpFirst: ((where: any) => Promise<void>) | null = null;
  let beforeOpMany: ((where: any) => Promise<void>) | null = null;
  let beforeOpCreate: ((data: any) => Promise<void>) | null = null;
  return {
    tables, unlinkFail, createFail, deleteFail, updateFail, findManyFail,
    get currentUserId() { return currentUserId; },
    set currentUserId(v: string) { currentUserId = v; },
    get beforeUnlink() { return beforeUnlink; }, set beforeUnlink(v) { beforeUnlink = v; },
    get afterDocDelete() { return afterDocDelete; }, set afterDocDelete(v) { afterDocDelete = v; },
    get beforeOpFirst() { return beforeOpFirst; }, set beforeOpFirst(v) { beforeOpFirst = v; },
    get beforeOpMany() { return beforeOpMany; }, set beforeOpMany(v) { beforeOpMany = v; },
    get beforeOpCreate() { return beforeOpCreate; }, set beforeOpCreate(v) { beforeOpCreate = v; },
    setDeleteManyZero: (v: boolean) => { deleteManyZero = v; },
    isDeleteManyZero: () => deleteManyZero,
    setColumnMissing: (v: boolean) => { columnMissing = v; },
    isColumnMissing: () => columnMissing,
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
    // Prisma 复合唯一键（如 userId_workspaceId）：值是嵌入字段对象，按字段逐一比对，不解释为查询操作符
    if (k === "userId_workspaceId" && v && typeof v === "object" && !Array.isArray(v)) {
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
  throw new Error("[r0j5-mock] 未识别的 raw 语句: " + norm.slice(0, 120));
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

function baseModel(name: string) {
  const rows = () => [...getTable(name).values()];
  const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
  return {
    findUnique: async ({ where, select }: any) => {
      if (h.isColumnMissing() && name === "storageoperation") {
        const e: any = new Error("The column storageoperation.filePath is missing"); e.code = "P2022"; throw e;
      }
      const row = findRow(where);
      return row ? { ...selectFields(row, select) } : null;
    },
    findFirst: async ({ where, select }: any) => {
      if (name === "storageoperation" && h.beforeOpFirst) await h.beforeOpFirst(where);
      const row = findRow(where);
      return row ? { ...selectFields(row, select) } : null;
    },
    findMany: async ({ where, select }: any) => {
      if (name === "storageoperation" && h.beforeOpMany) await h.beforeOpMany(where);
      if (h.findManyFail.has(name)) throw new Error("injected findMany failure for " + name);
      return rows().filter((r) => matchRow(r, where)).map((r) => selectFields(r, select));
    },
    count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
    create: async ({ data }: any) => {
      if (name === "storageoperation" && h.beforeOpCreate) await h.beforeOpCreate(data);
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
      const injected = h.updateFail.get(name) ?? h.updateFail.get(name + ":" + String(data?.status ?? ""));
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
      if (h.isDeleteManyZero() && name === "document") return { count: 0 };
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
      const injected = h.deleteFail.get(name);
      if (injected) throw injected;
      if (h.isDeleteManyZero() && name === "document") return { count: 0 };
      let count = 0;
      for (const row of rows()) if (matchRow(row, where)) { getTable(name).delete(row.id); count++; }
      if (name === "document" && h.afterDocDelete) await h.afterDocDelete({ where, count });
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

/** 事务内写操作撤销日志：只回滚本事务的写（并发对方已提交写不受影响） */
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
        return async (query: any, ...values: any[]) => evalRaw(typeof query === "string" ? query : query.join("?"), values);
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
      if (h.beforeUnlink) await h.beforeUnlink(p);
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

function seedWorkspace(enterprise = false) {
  h.tables.workspace = new Map([
    ["w1", { id: "w1", type: enterprise ? "ENTERPRISE" : "PERSONAL", ownerId: "u1", name: "空间", plan: "STANDARD" }],
    ["w2", { id: "w2", type: "PERSONAL", ownerId: "u2", name: "空间2", plan: "STANDARD" }],
  ]);
  h.tables.workspacemember = new Map([
    ["wm1", { id: "wm1", userId: "u1", workspaceId: "w1", role: "OWNER" }],
    ["wm2", { id: "wm2", userId: "u2", workspaceId: "w1", role: "MEMBER" }],
  ]);
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
function doc(id: string, filePath: string | null, fileSize: number | null, opts: { ws?: string; uploader?: string; visibility?: string } = {}) {
  const row = { id, workspaceId: opts.ws ?? "w1", title: id, status: "APPROVED", visibility: opts.visibility ?? "PRIVATE", filePath, fileSize, uploaderId: opts.uploader ?? "u1", type: "doc" };
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

beforeEach(() => {
  h.tables = {};
  h.currentUserId = "u1";
  h.beforeUnlink = null; h.afterDocDelete = null; h.beforeOpFirst = null; h.beforeOpMany = null; h.beforeOpCreate = null;
  h.unlinkFail.clear(); h.createFail.clear(); h.deleteFail.clear(); h.updateFail.clear(); h.findManyFail.clear();
  h.setDeleteManyZero(false); h.setColumnMissing(false); h.setHideOpDelegate(false); h.setCommitFailures(0);
  memFiles.clear();
  seedWorkspace();
});

// ══════════════ J3-01 剩余：单项删除恢复入口的共享引用保护 ══════════════

describe("R0-J5 J3-01：remove_asset 恢复入口按规范对象身份保护仍被共享引用的对象", () => {
  it("d1 已删 + 30 字节待清理 + d2 以历史别名引用同一对象 → 重试保留资料/文件/占用，不谎报已清理", async () => {
    seedQuota("w1", BigInt(50)); // 共享对象 30 + 其他对象 20
    doc("d2", "assets/w1/x.bin", 30); // 别名身份引用同一对象
    seedClaim({ bytes: 30, documentId: "d1" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    doc("other", "w1/other.bin", 20, {});
    memFiles.set(absFile("w1/other.bin"), Buffer.alloc(20));
    seedClaim({ opId: "del-w1-w1/other.bin", filePath: "w1/other.bin", bytes: 20, documentId: "other" });

    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.data.pendingCleared).not.toBe(true);
    expect(body.data.sharedRefKept).toBe(true);
    expect(body.message).toContain("共享引用");
    // 共享对象：资料、文件、占用、认领全部保留
    expect(h.tables.document.has("d2")).toBe(true);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used()).toBe(BigInt(50));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("PENDING_CLEANUP");
    expect(claims().some((o) => o.opId === "del-w1-w1/x.bin" && o.status === "RELEASED")).toBe(false);
    // 其他对象/另一空间不受影响
    expect(h.tables.document.has("other")).toBe(true);
    expect(memFiles.has(absFile("w1/other.bin"))).toBe(true);
  });

  it("无任何引用且同项已授权 → 继续安全恢复释放一次；另一空间资料/用量保持", async () => {
    seedQuota("w1", BigInt(30)); seedQuota("w2", BigInt(10));
    doc("w2doc", "w2/y.bin", 10, { ws: "w2", uploader: "u2" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    memFiles.set(absFile("w2/y.bin"), Buffer.alloc(10));
    seedClaim({ bytes: 30, documentId: "d1" });

    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.data.pendingCleared).toBe(true);
    expect(used("w1")).toBe(BigInt(0));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("RELEASED");
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(false);
    // 另一空间资料/文件/用量完整
    expect(h.tables.document.has("w2doc")).toBe(true);
    expect(memFiles.has(absFile("w2/y.bin"))).toBe(true);
    expect(used("w2")).toBe(BigInt(10));
    // 连续重试不再重复扣减
    const again = await runStudioPost(removeReq("d1"), makeDeps());
    expect(again.status).toBe(200);
    expect(used("w1")).toBe(BigInt(0));
  });
});

// ══════════════ J3-05 剩余：同空间管理员不能绕过私密恢复权限 ══════════════

describe("R0-J5 J3-05：文档缺失后的恢复只认持久认领主体，isManager 不作统一通行证", () => {
  it("企业空间 u1 所有者 / u2 成员：u2 私密资料存在时 u1 得 403；剩 pending 后 u1 仍被拒且零副作用；u2 合法重试可完成", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "w1/x.bin", 30, { uploader: "u2", visibility: "PRIVATE" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const { runStudioPost } = await import("@/app/api/studio/handler");

    // 文档仍存在：u1 作为所有者也不能删他人私密资料
    h.currentUserId = "u1";
    expect((await runStudioPost(removeReq("d1"), makeDeps())).status).toBe(403);

    // u2 已授权删除（文档已删），留下自己发起的待清理认领
    h.tables.document.delete("d1");
    seedClaim({ userId: "u2", bytes: 30, documentId: "d1" });

    // u1 重试恢复：安全拒绝，零副作用，不谎报 pendingCleared
    h.currentUserId = "u1";
    const denied = await runStudioPost(removeReq("d1"), makeDeps());
    const deniedBody = await (denied as any).json();
    expect(denied.status).toBe(403);
    expect(deniedBody.data?.pendingCleared).not.toBe(true);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used()).toBe(BigInt(30));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("PENDING_CLEANUP");

    // u2 合法重试：完成恢复，只释放一次
    h.currentUserId = "u2";
    const ok = await runStudioPost(removeReq("d1"), makeDeps());
    const okBody = await (ok as any).json();
    expect(ok.status).toBe(200);
    expect(okBody.data.pendingCleared).toBe(true);
    expect(used()).toBe(BigInt(0));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("RELEASED");
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(false);
  });

  it("跨空间伪造 documentId 仍被拒绝释放（不触发恢复、不改动他空间用量与认领）", async () => {
    seedQuota("w1", BigInt(30)); seedQuota("w2", BigInt(10));
    seedClaim({ opId: "del-w2-w2/x.bin", ws: "w2", userId: "u2", filePath: "w2/x.bin", bytes: 10, documentId: "forged" });
    memFiles.set(absFile("w2/x.bin"), Buffer.alloc(10));

    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("forged", "w1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.data.pendingCleared).not.toBe(true);
    expect(used("w1")).toBe(BigInt(30));
    expect(used("w2")).toBe(BigInt(10));
    expect(claims().find((o) => o.documentId === "forged").status).toBe("PENDING_CLEANUP");
  });
});

// ══════════════ J3-03 剩余：清空消费 blocked / 原始大小 / CANCELLED 重开前核载荷 ══════════════

describe("R0-J5 J3-03：清空与重开都以持久可信字节为准，破坏性动作前阻断", () => {
  it("清空，fileSize=null、文件30/used30 → 资料/文件/占用保留，未知大小提示，不报出厂完成", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "w1/x.bin", null);
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const body = await ((await POST(clearReq())) as any).json();
    expect(h.tables.document.has("d1")).toBe(true);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used()).toBe(BigInt(30));
    expect(body.storage.clearedCount).toBe(0);
    expect(body.storage.failedObjects.some((o: any) => o.reason.includes("大小未知") || o.reason.includes("矛盾"))).toBe(true);
    expect(body.message).not.toContain("纯净出厂状态");
    expect(claims().length).toBe(0); // 未创建认领（更没有按 0 字节释放）
  });

  it("清空，pending.bytes30 / 文档 fileSize50 → blocked 被消费，破坏性动作零发生", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "w1/x.bin", 50);
    seedClaim({ bytes: 30, documentId: "d1" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const body = await ((await POST(clearReq())) as any).json();
    expect(h.tables.document.has("d1")).toBe(true);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used()).toBe(BigInt(30));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("PENDING_CLEANUP");
    expect(body.storage.clearedCount).toBe(0);
    expect(body.message).not.toContain("纯净出厂状态");
  });

  it("单项删除，CANCELLED.bytes30 / 文档 fileSize50 → 状态不重开、文件/文档不删、占用不动，说明冲突", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "w1/x.bin", 50);
    seedClaim({ bytes: 30, documentId: "d1", status: "CANCELLED" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(500);
    expect(body.code).toBe("STORAGE_SIZE_UNKNOWN");
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("CANCELLED");
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(h.tables.document.has("d1")).toBe(true);
    expect(used()).toBe(BigInt(30));
  });

  it("单项 / 清空，可信真实 0 字节 → 正常删除与终结，不额外占用/扣量", async () => {
    seedQuota("w1", BigInt(0));
    doc("d1", "w1/zero.bin", 0);
    memFiles.set(absFile("w1/zero.bin"), Buffer.alloc(0));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    expect((await runStudioPost(removeReq("d1"), makeDeps())).status).toBe(200);
    expect(used()).toBe(BigInt(0));
    expect(claims().find((o) => o.opId === "del-w1-w1/zero.bin").status).toBe("RELEASED");
    expect(memFiles.has(absFile("w1/zero.bin"))).toBe(false);

    // 清空路径：真实 0 字节同样正常，纯 JSON 文本（无物理对象）不额外计大小
    seedQuota("w1", BigInt(0));
    doc("d2", "w1/zero2.bin", 0);
    doc("kn", null, null);
    memFiles.set(absFile("w1/zero2.bin"), Buffer.alloc(0));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const body = await ((await POST(clearReq())) as any).json();
    expect(body.storage.clearedCount).toBe(2);
    expect(body.message).toContain("纯净出厂状态");
    expect(used()).toBe(BigInt(0));
  });

  it("两个无冲突正常对象 → 分别只释放各自可信字节，其他空间不动", async () => {
    seedQuota("w1", BigInt(50)); seedQuota("w2", BigInt(10));
    doc("d1", "w1/a.bin", 30); doc("d2", "w1/b.bin", 20);
    doc("w2doc", "w2/y.bin", 10, { ws: "w2", uploader: "u2" });
    memFiles.set(absFile("w1/a.bin"), Buffer.alloc(30));
    memFiles.set(absFile("w1/b.bin"), Buffer.alloc(20));
    memFiles.set(absFile("w2/y.bin"), Buffer.alloc(10));
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const body = await ((await POST(clearReq())) as any).json();
    expect(body.storage.clearedCount).toBe(2);
    expect(used("w1")).toBe(BigInt(0));
    expect(used("w2")).toBe(BigInt(10));
    expect(h.tables.document.has("w2doc")).toBe(true);
    expect(memFiles.has(absFile("w2/y.bin"))).toBe(true);
    expect(claims().filter((o) => o.status === "RELEASED").map((o) => o.bytes).sort()).toEqual([20, 30]);
  });
});

// ══════════════ J3-02 剩余：清空/删除显式屏障交错 + 已释放终态幂等 ══════════════

describe("R0-J5 J3-02：共用认领由完成方推进终态，清空交错不 CANCELLED、终态重放不漂移", () => {
  it("显式屏障交错：A 清空创建认领后停在文件删除前，B 单项删除删行后暂停，A 继续至 count=0，B 最后终结", async () => {
    seedQuota("w1", BigInt(30)); seedQuota("w2", BigInt(10));
    doc("d1", "w1/x.bin", 30);
    doc("w2doc", "w2/y.bin", 10, { ws: "w2", uploader: "u2" });
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    memFiles.set(absFile("w2/y.bin"), Buffer.alloc(10));

    const enterA = latch(), enterB = latch(), allowA = latch(), allowB = latch(), rowDone = latch(), finish = latch();
    let unlinkCalls = 0;
    h.beforeUnlink = async () => {
      unlinkCalls++;
      if (unlinkCalls === 1) { enterA.resolve(); await allowA.promise; }
      else if (unlinkCalls === 2) { enterB.resolve(); await allowB.promise; }
    };
    h.afterDocDelete = async ({ count }) => { if (count === 1) { rowDone.resolve(); await finish.promise; } };

    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const a = POST(clearReq());            // A：清空
    await enterA.promise;                  // A 已认领、停在文件删除前
    const b = runStudioPost(removeReq("d1"), makeDeps()); // B：单项删除读到旧资料
    await enterB.promise;                  // B 停在文件删除前
    allowB.resolve();
    await rowDone.promise;                 // B 已物理删除 + 删行成功，停在终结前
    allowA.resolve();                      // A 继续 → 自己的 deleteMany 得到 count=0
    const ra = await a;
    const aBody = await (ra as any).json();
    finish.resolve();                      // B 执行终结
    const rb = await b;

    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(h.tables.document.has("d1")).toBe(false);
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(false);
    expect(used("w1")).toBe(BigInt(0));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("RELEASED");
    expect(claims().some((o) => o.status === "CANCELLED")).toBe(false);
    expect(aBody.message).not.toContain("纯净出厂状态"); // 并发跳过不得报完整出厂重置
    expect(aBody.storage.concurrentSkipped).toBe(1);
    // 另一空间资料/文件/用量不动
    expect(h.tables.document.has("w2doc")).toBe(true);
    expect(memFiles.has(absFile("w2/y.bin"))).toBe(true);
    expect(used("w2")).toBe(BigInt(10));
  });

  it("同认领连续终结：第一次 30→0，第二次识别 alreadyReleased 且不漂移", async () => {
    const { finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(30));
    seedClaim({ bytes: 30 });
    const first = await finalizeObjectCleanup("w1", "del-w1-w1/x.bin", 30);
    expect(first.released).toBe(true);
    expect(first.finalized).toBe(true);
    expect(used()).toBe(BigInt(0));
    const replay = await finalizeObjectCleanup("w1", "del-w1-w1/x.bin", 30);
    expect(replay.finalized).toBe(true);
    expect(replay.alreadyReleased).toBe(true);
    expect(replay.drift).toBe(false);
    expect(replay.released).toBe(false);
    expect(used()).toBe(BigInt(0)); // 只释放一次
  });

  it("终结提交故障后重试仍可终结；未完成且真实用量不足仍保持漂移阻断", async () => {
    const { finalizeObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(30));
    seedClaim({ bytes: 30 });
    h.setCommitFailures(1);
    await expect(finalizeObjectCleanup("w1", "del-w1-w1/x.bin", 30)).rejects.toThrow(/COMMIT_FAILED_INJECTED/);
    expect(used()).toBe(BigInt(30));
    expect(claims()[0].status).toBe("PENDING_CLEANUP");
    const retry = await finalizeObjectCleanup("w1", "del-w1-w1/x.bin", 30);
    expect(retry.finalized).toBe(true);
    expect(used()).toBe(BigInt(0));

    // 用量不足以扣减：保持漂移阻断，不清零
    seedQuota("w1", BigInt(5));
    seedClaim({ opId: "del-w1-w1/drift.bin", filePath: "w1/drift.bin", bytes: 30, documentId: "dd" });
    const drift = await finalizeObjectCleanup("w1", "del-w1-w1/drift.bin", 30);
    expect(drift.drift).toBe(true);
    expect(drift.finalized).toBe(false);
    expect(used()).toBe(BigInt(5));
    expect(claims().find((o) => o.opId === "del-w1-w1/drift.bin").status).toBe("PENDING_CLEANUP");
  });

  it("反向交错（A 单项删除 / B 清空）保持安全：只释放一次、共用认领不被取消", async () => {
    seedQuota("w1", BigInt(30));
    doc("d1", "w1/x.bin", 30);
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    const enterA = latch(), enterB = latch(), allowA = latch(), allowB = latch(), rowDone = latch(), finish = latch();
    let calls = 0;
    h.beforeUnlink = async () => {
      calls++;
      if (calls === 1) { enterA.resolve(); await allowA.promise; }
      else if (calls === 2) { enterB.resolve(); await allowB.promise; }
    };
    h.afterDocDelete = async ({ count }) => { if (count === 1) { rowDone.resolve(); await finish.promise; } };
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const a = runStudioPost(removeReq("d1"), makeDeps());
    await enterA.promise;
    const b = POST(clearReq());
    await enterB.promise;
    allowB.resolve();
    await rowDone.promise;
    allowA.resolve();
    const ra = await a;
    finish.resolve();
    const rb = await b;
    expect([ra.status, rb.status]).toEqual([404, 200]);
    expect(used("w1")).toBe(BigInt(0));
    expect(claims().find((o) => o.opId === "del-w1-w1/x.bin").status).toBe("RELEASED");
    expect(claims().some((o) => o.status === "CANCELLED")).toBe(false);
  });
});

// ══════════════ J3-04 剩余：查询失败是状态未知 ══════════════

describe("R0-J5 J3-04：检查失败次数与对象数量分开，未知不是 0 也不是 1", () => {
  for (const pendingCount of [0, 2]) {
    it(`实际 ${pendingCount} 条认领下注入查询失败 → 不编造总数、API 有未知标志且不报完全成功`, async () => {
      seedQuota("w1", BigInt(30));
      if (pendingCount === 2) {
        seedClaim({ opId: "del-w1-w1/a.bin", filePath: "w1/a.bin", bytes: 15, documentId: "a" });
        seedClaim({ opId: "del-w1-w1/b.bin", filePath: "w1/b.bin", bytes: 15, documentId: "b" });
      }
      h.findManyFail.add("storageoperation");
      const { POST } = await import("@/app/api/workspace/clear-data/route");
      const res = await POST(clearReq());
      const body = await (res as any).json();
      expect(res.status).toBe(200);
      expect(body.storage.pendingStill).toBe(0);
      expect(body.storage.recoveryCheckFailed).toBe(true);
      expect(body.storage.recoveryCheckFailureCount).toBe(1);
      expect(body.storage.pendingCountKnown).toBe(false);
      expect(body.storage.pendingCount).toBeNull();
      expect(body.message).toContain("恢复检查失败，待清理数量未知");
      expect(body.message).not.toContain("1 条历史待清理认领仍未完成");
      expect(body.message).not.toContain("纯净出厂状态");
    });
  }

  it("查询成功：逐项失败按实际 1 条报告、完成数按实际记录；正常空集合显示清理完成", async () => {
    const { POST } = await import("@/app/api/workspace/clear-data/route");
    // 逐项终结失败 → 已知 1 条未完成
    seedQuota("w1", BigInt(30));
    seedClaim({ bytes: 30, documentId: "d1" });
    h.setCommitFailures(1);
    const failBody = await ((await POST(clearReq())) as any).json();
    expect(failBody.storage.pendingStill).toBe(1);
    expect(failBody.storage.pendingCountKnown).toBe(true);
    expect(failBody.storage.pendingCount).toBe(1);
    expect(failBody.storage.recoveryCheckFailed).toBe(false);
    expect(failBody.message).toContain("1 条历史待清理认领仍未完成");

    // 恢复完成 → 完成数按实际 1 条
    const okBody = await ((await POST(clearReq())) as any).json();
    expect(okBody.storage.pendingRecovered).toBe(1);
    expect(okBody.storage.pendingStill).toBe(0);
    expect(okBody.storage.pendingCount).toBe(0);
    expect(okBody.message).toContain("纯净出厂状态");

    // 正常空集合
    seedQuota("w1", BigInt(0));
    const emptyBody = await ((await POST(clearReq())) as any).json();
    expect(emptyBody.storage.pendingStill).toBe(0);
    expect(emptyBody.storage.recoveryCheckFailed).toBe(false);
    expect(emptyBody.message).toContain("纯净出厂状态");
  });
});

// ══════════════ J3-07 剩余：恢复查询就绪错误经实际 remove_asset 映射稳定 503 ══════════════

describe("R0-J5 J3-07：文档缺失恢复入口的缺表/缺列/缺 delegate → 稳定 503 且零副作用", () => {
  for (const mode of ["delegate", "P2021", "P2022"]) {
    it(`runStudioPost/remove_asset：${mode} → 503 + 稳定 code，文件/用量/认领零变化`, async () => {
      seedQuota("w1", BigInt(30));
      memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
      seedClaim({ bytes: 30, documentId: "d1" }); // 目标文档已无
      if (mode === "delegate") h.setHideOpDelegate(true);
      else {
        h.beforeOpFirst = async () => {
          const e: any = new Error(mode === "P2021" ? "Table does not exist" : "The column is missing");
          e.code = mode;
          throw e;
        };
      }
      const { runStudioPost } = await import("@/app/api/studio/handler");
      const res = await runStudioPost(removeReq("d1"), makeDeps());
      const body = await (res as any).json();
      expect(res.status).toBe(503);
      expect(body.code).toBe(mode === "P2022" ? "STORAGE_OP_UNAVAILABLE" : "STORAGE_QUOTA_NOT_READY");
      expect(body.error).not.toMatch(/SQL|Table |column /i);
      expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
      expect(used()).toBe(BigInt(30));
      expect(claims()[0].status).toBe("PENDING_CLEANUP");
    });
  }

  it("普通业务异常不伪装成未迁移：仍走通用错误，不返回 503 就绪码", async () => {
    seedQuota("w1", BigInt(30));
    memFiles.set(absFile("w1/x.bin"), Buffer.alloc(30));
    seedClaim({ bytes: 30, documentId: "d1" });
    h.beforeOpFirst = async () => { throw new Error("连接被重置（普通业务异常）"); };
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(removeReq("d1"), makeDeps());
    const body = await (res as any).json();
    expect(res.status).toBe(500);
    expect(body.code).not.toBe("STORAGE_OP_UNAVAILABLE");
    expect(body.code).not.toBe("STORAGE_QUOTA_NOT_READY");
    expect(memFiles.has(absFile("w1/x.bin"))).toBe(true);
    expect(used()).toBe(BigInt(30));
  });
});
