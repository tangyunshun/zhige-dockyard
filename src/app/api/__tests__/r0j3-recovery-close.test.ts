/**
 * R0-J3 正向验收：完成原 F13 剩余四组（J-RELEASE/J-UPLOAD/J-CLEAR/J-KEYS）
 * 覆盖 IDE-R0-J3-PROMPT.md §五 表格场景（真实 handler/service，DB/fs 夹具真实求值）：
 * - 容量不变量：物理未确认删除 → 占用保持计量 → 下一笔上传被准入拒绝
 * - 认领失败/无依据状态、清空提交故障恢复重试、共享保留如实提示
 * - 上传对象键预绑定、保存后响应丢失进入稳定待核实、确认+文档清理组合故障可恢复
 * - delegate 未就绪 503、P2002 不同主体冲突、多候选歧义、根/空间越界拒绝
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（真实条件求值 + 唯一约束 + 行级事务回滚） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const unlinkFail = new Set<string>();
  const createFail = new Map<string, Error>();
  const deleteFail = new Map<string, Error>();
  const updateFail = new Map<string, Error>();
  let hideOpDelegate = false;
  let rawGate: ((sql: string) => Promise<void>) | null = null;
  let rawGateVal: ((sql: string) => Promise<void>) | null = null;
  const setRawGate = (g: ((sql: string) => Promise<void>) | null) => { rawGateVal = g; };
  let commitFailures = 0;
  return {
    tables, writes, unlinkFail, createFail, deleteFail, updateFail,
    setHideOpDelegate: (v: boolean) => { hideOpDelegate = v; },
    isOpDelegateHidden: () => hideOpDelegate,
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
  throw new Error("[r0j3-mock] 未识别的 raw 语句: " + norm.slice(0, 120));
}

function baseModel(name: string) {
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
      // updateFail 支持按目标状态精确注入（如仅让 CONFIRMED 失败，mark PENDING_CLEANUP 不受影响）
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
      let count = 0;
      for (const row of rows()) {
        if (matchRow(row, where)) { getTable(name).set(row.id, applyData(row, data)); count++; }
      }
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
      let count = 0;
      for (const row of rows()) {
        if (matchRow(row, where)) { getTable(name).delete(row.id); count++; }
      }
      return { count };
    },
    upsert: async ({ where, create, update }: any) => {
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
}

const selectFields = (row: any, select: any) => {
  if (!select) return { ...row };
  const out: any = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
};

/** [§五] 事务内写操作撤销日志：仅回滚本事务的写（并发对方已提交写不受影响，与真实 MySQL 一致） */
function txModel(name: string, undo: Array<() => void>) {
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
  const clientProxy: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        // [§五] delegate 未生成：storageoperation 模型能力缺失 → ensureOpModel 稳定 503
        if (prop === "storageoperation" && h.isOpDelegateHidden()) return undefined;
        if (prop === "$executeRaw" || prop === "$executeRawUnsafe") {
          return async (query: TemplateStringsArray | { sql?: string }, ...values: any[]) => {
            const sql = typeof query === "string" ? query : (query as TemplateStringsArray).join("?");
            const gate = h.getRawGate();
            if (gate) await gate(sql);
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
                  return async (query: TemplateStringsArray | { sql?: string }, ...values: any[]) => {
                    const sql = typeof query === "string" ? query : (query as TemplateStringsArray).join("?");
                    const gate = h.getRawGate();
                    if (gate) await gate(sql);
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
                return txModel(p2, undo);
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
        return baseModel(prop);
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

// [§五] file-store 包装：注入"写入已产生对象后响应丢失"与"对象删除失败"场景
const fileFlags = vi.hoisted(() => ({ failSaveAfterWrite: false, failDelete: false }));
vi.mock("@/lib/file-store", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    saveAssetFileToKey: async (...args: any[]) => {
      const r = await actual.saveAssetFileToKey(...args);
      if (fileFlags.failSaveAfterWrite) throw new Error("保存响应丢失（注入：写入已产生对象）");
      return r;
    },
    deleteAssetFile: async (...args: any[]) => {
      if (fileFlags.failDelete) return { ok: false, notExists: false, error: "注入删除失败" };
      return actual.deleteAssetFile(...args);
    },
  };
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
vi.mock("@/lib/workspaceInit", () => ({ ensureDefaultComponents: vi.fn(async () => {}) }));
vi.mock("@/lib/serverCache", () => ({ clearServerCache: vi.fn(() => {}) }));

import type { StudioExecutionDeps } from "@/app/api/studio/handler";
import { prisma as mockedPrisma } from "@/lib/prisma";
// [R0-K1 隔离桩] 冻结存储回归不测试解析准入；注入"始终放行"后端，使 handler 新接入的准入调用不干扰存储闭环
import { __setParseAdmissionBackendForTest } from "@/lib/parse-admission";

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
  h.deleteFail.clear();
  h.updateFail.clear();
  h.setHideOpDelegate(false);
  h.setCommitFailures(0);
  fileFlags.failSaveAfterWrite = false;
  fileFlags.failDelete = false;
  memFiles.clear();
  seedWorkspace();
  // [R0-K1 隔离桩] backend 的 acquire 必须返回 "granted"（租约由 acquireParseLease 内部生成）
  __setParseAdmissionBackendForTest({
    acquire: async () => "granted",
    release: async () => true,
    quarantine: async () => {},
    isLeaseActive: async () => true,
    sweep: async () => 0,
  });
});

// ══════════════ A. 容量不变量（J-RELEASE 最高优先级） ══════════════

describe("R0-J3 A：物理未确认删除 → 占用保持计量（容量不变量）", () => {
  it("限额 30：删除 30 物理失败 → 再上传 30 被准入拒绝；清理成功后仅释放一次", async () => {
    seedQuota("w1", BigInt(30), BigInt(30));
    h.tables.document.set("d1", { id: "d1", workspaceId: "w1", title: "占满资料", status: "APPROVED", visibility: "PRIVATE", filePath: "w1/full.bin", fileSize: 30, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    memFiles.set(pathMod.join(process.cwd(), "uploads", "assets", "w1", "full.bin"), Buffer.from("F"));
    const abs = pathMod.join(process.cwd(), "uploads", "assets", "w1", "full.bin");
    h.unlinkFail.add(abs);
    const { runStudioPost } = await import("@/app/api/studio/handler");

    // 1. 删除遇 EACCES → 500，记录与占用保留，认领待清理
    const res1 = await runStudioPost(
      new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ action: "remove_asset", assetId: "d1", workspaceId: "w1", reasonCode: "VIOLATION" }),
      }),
      makeDeps(),
    );
    expect(res1.status).toBe(500);
    expect(h.tables.document.has("d1")).toBe(true);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(30)); // 不给下一笔腾容量
    const claimOp = [...h.tables.storageoperation.values()].find((o) => o.status === "PENDING_CLEANUP" && o.filePath === "w1/full.bin");
    expect(claimOp).toBeTruthy();

    // 2. 物理仍在 → 再上传 30 字节被容量准入拒绝（EXCEEDED，副作用前）
    const res2 = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "再来一份", visibility: "PRIVATE", workspaceId: "w1" }, { name: "b.bin", type: "application/octet-stream", content: "012345678901234567890123456789" }),
      makeDeps(),
    );
    expect(res2.status).toBe(403);
    const body2 = await (res2 as any).json();
    expect(body2.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(memFiles.has(abs)).toBe(true); // 物理对象仍在（未被清/未被覆盖）
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(30));

    // 3. 物理失败解除 → 重试删除 → 认领恢复路径 → 释放一次 + 终态
    h.unlinkFail.delete(abs);
    const res3 = await runStudioPost(
      new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ action: "remove_asset", assetId: "d1", workspaceId: "w1", reasonCode: "VIOLATION" }),
      }),
      makeDeps(),
    );
    expect(res3.status).toBe(200);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 只释放一次
    expect([...h.tables.storageoperation.values()].find((o) => o.opId === claimOp!.opId)!.status).toBe("RELEASED");

    // 4. 释放后 → 再上传 30 成功（容量已真实腾出）
    const res4 = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "成功上传", visibility: "PRIVATE", workspaceId: "w1" }, { name: "c.bin", type: "application/octet-stream", content: "012345678901234567890123456789" }),
      makeDeps(),
    );
    expect(res4.status).toBe(200);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(30));
  });

  it("删除认领插入失败 → 明确失败，记录/文件/占用全保留（无依据状态不出现）", async () => {
    seedQuota("w1", BigInt(30), BigInt(-1));
    h.tables.document.set("d1", { id: "d1", workspaceId: "w1", title: "资料", status: "APPROVED", visibility: "PRIVATE", filePath: "w1/x.bin", fileSize: 30, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    const abs = pathMod.join(process.cwd(), "uploads", "assets", "w1", "x.bin");
    memFiles.set(abs, Buffer.from("X"));
    h.createFail.set("storageoperation", new Error("db write failure"));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ action: "remove_asset", assetId: "d1", workspaceId: "w1", reasonCode: "VIOLATION" }),
      }),
      makeDeps(),
    );
    expect(res.status).toBe(500);
    const body = await (res as any).json();
    expect(body.code).toBe("STORAGE_CLAIM_FAILED");
    expect(h.tables.document.has("d1")).toBe(true); // 最后元数据未删
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(30)); // 计量未释放
    expect(memFiles.has(abs)).toBe(true); // 文件未动
    h.createFail.delete("storageoperation");
  });
});

// ══════════════ B. 交错与结构就绪（J-RELEASE/J-UPLOAD） ══════════════

describe("R0-J3 B：交错、身份核验与结构就绪", () => {
  it("清空认领终结后同对象删除重放 → already-released 幂等收尾，只释放一次", async () => {
    seedQuota("w1", BigInt(40), BigInt(-1));
    h.tables.document.set("d1", { id: "d1", workspaceId: "w1", title: "资料", status: "APPROVED", visibility: "PRIVATE", filePath: "w1/once.bin", fileSize: 40, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    const abs = pathMod.join(process.cwd(), "uploads", "assets", "w1", "once.bin");
    memFiles.set(abs, Buffer.from("O"));
    const { runStudioPost } = await import("@/app/api/studio/handler");
    // 1. 清空：认领 → 物理删 → 删行 → 终结释放
    const { POST: clearPOST } = await import("@/app/api/workspace/clear-data/route");
    const clearRes = await clearPOST(
      new NextRequest("http://localhost/api/workspace/clear-data", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ workspaceId: "w1", confirmText: "确认删除" }),
      }),
    );

    const clearBody = await (clearRes as any).json();
    expect(clearBody.storage.clearedCount).toBe(1);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0));
    expect([...h.tables.storageoperation.values()][0].status).toBe("RELEASED");
    // 2. 同对象删除重放：认领已 RELEASED、记录已删 → 优雅成功（已处于移除状态），不重复扣减
    const res2 = await runStudioPost(
      new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ action: "remove_asset", assetId: "d1", workspaceId: "w1", reasonCode: "VIOLATION" }),
      }),
      makeDeps(),
    );
    expect(res2.status).toBe(200);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 不重复扣减（认领终态防止重放多扣）
  });

  it("P2002 并发分支与普通重放同一核验口径：不同主体/已释放 → OP_CONFLICT", async () => {
    const { reserveStorageBytes } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await reserveStorageBytes("w1", 100, "op-shared", "u1");
    // 另一主体重放同一 opId → 冲突（不得 dedup）
    await expect(reserveStorageBytes("w1", 100, "op-shared", "u2")).rejects.toMatchObject({
      code: "STORAGE_OP_CONFLICT", status: 409,
    });
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(100));
  });

  it("delegate/表未就绪 → 503 STORAGE_QUOTA_NOT_READY，预留/认领零副作用", async () => {
    h.setHideOpDelegate(true);
    const { reserveStorageBytes, claimObjectCleanup } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(0), BigInt(-1));
    await expect(reserveStorageBytes("w1", 10, "op-nr", "u1")).rejects.toMatchObject({
      code: "STORAGE_QUOTA_NOT_READY", status: 503,
    });
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 零增量
    await expect(claimObjectCleanup("w1", "w1/x.bin", 10, { userId: "u1" })).rejects.toMatchObject({
      code: "STORAGE_QUOTA_NOT_READY", status: 503,
    });
    expect([...h.tables.storageoperation.values()].length).toBe(0);
    h.setHideOpDelegate(false);
  });
});

// ══════════════ C. 上传恢复（J-UPLOAD §二） ══════════════

describe("R0-J3 C：上传对象键预绑定与稳定待核实", () => {
  it("保存写入对象后响应丢失 + 清理失败 → STORAGE_OP_PENDING + 操作持有可定位对象 + 占用保留", async () => {
    seedQuota("w1", BigInt(0), BigInt(-1));
    fileFlags.failSaveAfterWrite = true; // 写入已产生对象，然后抛错
    fileFlags.failDelete = true; // 核实清理也失败 → 稳定待核实
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "未知结果", visibility: "PRIVATE", workspaceId: "w1" }, { name: "m.bin", type: "application/octet-stream", content: "MATERIAL" }),
      makeDeps(),
    );
    expect(res.status).toBe(500);
    const body = await (res as any).json();
    expect(body.code).toBe("STORAGE_OP_PENDING");
    expect(body.filePath).toBeTruthy(); // 操作预绑定的对象定位（响应可定位）
    expect(body.storageOpId).toBeTruthy();
    // 操作持久持有对象定位与字节（重启后可凭 op 定位对象）
    const op = [...h.tables.storageoperation.values()].find((o) => o.opId === body.storageOpId);
    expect(op.status).toBe("PENDING_CLEANUP");
    expect(op.filePath).toBe(body.filePath);
    expect(op.bytes).toBe(8);
    // 占用保留（不盲释），物理对象仍在
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(8));
    expect(memFiles.size).toBe(1);
    expect(h.tables.document.size).toBe(0); // 无资料行
  });

  it("确认失败 + 残留文档行清理失败 → 保留文件/记录/占用（不留成功外观的空壳）", async () => {
    seedQuota("w1", BigInt(0), BigInt(-1));
    h.updateFail.set("storageoperation:CONFIRMED", new Error("confirm update failure")); // 仅 CONFIRMED 更新失败 → confirm 抛 CONFIRM_FAILED
    h.deleteFail.set("document", new Error("doc delete failure")); // 残留文档行清理失败
    const { runStudioPost } = await import("@/app/api/studio/handler");
    const res = await runStudioPost(
      multipartReq({ action: "upload_doc", title: "组合故障", visibility: "PRIVATE", workspaceId: "w1" }, { name: "c.bin", type: "application/octet-stream", content: "CONTENT" }),
      makeDeps(),
    );
    expect(res.status).toBe(500);
    const body = await (res as any).json();
    expect(body.code).toBe("STORAGE_CLEANUP_PENDING");
    // 可恢复状态齐全：文档行仍在、文件仍在、占用仍在、操作待核实
    expect(h.tables.document.size).toBe(1);
    const doc = [...h.tables.document.values()][0];
    expect(doc.status).toBe("APPROVED"); // 未被伪装成功（响应用户可见为失败）
    expect(memFiles.size).toBe(1);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(7));
    const op = [...h.tables.storageoperation.values()][0];
    expect(op.status).toBe("PENDING_CLEANUP");
    h.updateFail.delete("storageoperation");
    h.deleteFail.delete("document");
  });
});

// ══════════════ D. 清空恢复（J-CLEAR §三） ══════════════

describe("R0-J3 D：清空提交故障与共享保留提示", () => {
  function clearReq() {
    return new NextRequest("http://localhost/api/workspace/clear-data", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({ workspaceId: "w1", confirmText: "确认删除" }),
    });
  }

  it("终结提交故障 → 认领持久恢复依据；重试可完成且不重复扣减，不丢最后元数据", async () => {
    seedQuota("w1", BigInt(30), BigInt(-1));
    h.tables.document.set("d1", { id: "d1", workspaceId: "w1", title: "资料", status: "APPROVED", visibility: "PRIVATE", filePath: "w1/cf.bin", fileSize: 30, uploaderId: "u1", type: "doc" });
    const pathMod = require("path");
    const abs = pathMod.join(process.cwd(), "uploads", "assets", "w1", "cf.bin");
    memFiles.set(abs, Buffer.from("C"));
    h.setCommitFailures(1); // 终结事务提交失败
    const { POST: clearPOST } = await import("@/app/api/workspace/clear-data/route");
    const res1 = await clearPOST(clearReq());
    expect(res1.status).toBe(500);
    // 故障后：认领已持久（含对象定位与字节），占用保持计量
    const claim = [...h.tables.storageoperation.values()].find((o) => o.status === "PENDING_CLEANUP" && o.filePath === "w1/cf.bin");
    expect(claim).toBeTruthy();
    expect(claim.bytes).toBe(30);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(30));
    // 重试（故障解除）→ 恢复段完成终结 → 只扣减一次
    const res2 = await clearPOST(clearReq());
    expect(res2.status).toBe(200);
    const body2 = await (res2 as any).json();
    expect(body2.storage.pendingRecovered).toBe(1);
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(0)); // 只扣一次
    expect([...h.tables.storageoperation.values()].find((o) => o.opId === claim.opId)!.status).toBe("RELEASED");
  });

  it("清空只保留共享对象 → 提示实际保留，不宣称完全出厂重置", async () => {
    seedQuota("w1", BigInt(50), BigInt(-1));
    h.tables.document.set("s1", { id: "s1", workspaceId: "w1", title: "共享A", status: "APPROVED", visibility: "PRIVATE", filePath: "assets/w1/sh.bin", fileSize: 50, uploaderId: "u1", type: "doc" });
    h.tables.document.set("s2", { id: "s2", workspaceId: "w1", title: "共享B", status: "APPROVED", visibility: "PRIVATE", filePath: "w1/sh.bin", fileSize: 50, uploaderId: "u1", type: "doc" });
    const { POST: clearPOST } = await import("@/app/api/workspace/clear-data/route");
    const res = await clearPOST(clearReq());
    expect(res.status).toBe(200);
    const body = await (res as any).json();
    expect(body.storage.sharedRefKept).toBe(2); // 别名身份识别（同对象两个引用）
    expect(body.storage.clearedCount).toBe(0);
    expect(body.message).toContain("共享引用保留");
    expect(body.message).not.toContain("纯净出厂状态"); // 不假报完全重置
    expect(h.tables.document.size).toBe(2); // 记录保留
    expect(h.tables.workspacequota.get("q-w1").storageUsed).toBe(BigInt(50)); // 计量保留
  });
});

// ══════════════ E. 路径边界（J-KEYS §四） ══════════════

describe("R0-J3 E：多候选歧义与根/空间越界", () => {
  it("归一位置与历史双 assets 位置并存 → 删除前歧义拒绝，不删第一个也不全删", async () => {
    const fileStore = await import("@/lib/file-store");
    const pathMod = require("path");
    // 两个候选位置都写入同一相对键
    memFiles.set(pathMod.join(process.cwd(), "uploads", "assets", "w1", "amb.bin"), Buffer.from("NEW"));
    memFiles.set(pathMod.join(process.cwd(), "uploads", "assets", "assets", "w1", "amb.bin"), Buffer.from("OLD"));
    const del = await fileStore.deleteAssetFile("w1/amb.bin", "w1");
    expect(del.ok).toBe(false);
    expect(del.ambiguous).toBe(true);
    // 两个候选都原样保留（待人工核实）
    expect(memFiles.size).toBe(2);
    // 单候选时正常删除恢复（已通过行为回归）
    memFiles.delete(pathMod.join(process.cwd(), "uploads", "assets", "assets", "w1", "amb.bin"));
    const del2 = await fileStore.deleteAssetFile("w1/amb.bin", "w1");
    expect(del2.ok).toBe(true);
    expect(memFiles.size).toBe(0);
  });

  it("根/空间越界拒绝（含历史候选与读取），合法键与 S3 形状键不受影响", async () => {
    const fileStore = await import("@/lib/file-store");
    // 根越界：../ 穿越段被拒绝（不定位到存储根之外）
    const delEscape = await fileStore.deleteAssetFile("w1/../../outside.txt", "w1");
    expect(delEscape.ok).toBe(false);
    // 空间越界：首段不属于授权空间
    await expect(fileStore.readAssetFile("w2/secret.bin", "w1")).rejects.toMatchObject({ code: "OBJECT_PATH_ESCAPE" });
    await expect(fileStore.saveAssetFileToKey("assets/w2/evil.bin", Buffer.from("x"), "w1")).rejects.toMatchObject({ code: "OBJECT_PATH_ESCAPE" });
    // 导出的绝对路径解析同样拒绝穿越
    expect(() => fileStore.resolveAssetAbsolute("w1/../../outside.txt")).toThrow(/穿越|存储根/);
    // 合法键：分配 → 落盘 → 读取 → 删除（契约回归）
    const { key } = fileStore.allocateObjectKey("w1", "bin");
    const saved = await fileStore.saveAssetFileToKey(key, Buffer.from("ok"), "w1");
    expect(saved.filePath).toBe(key);
    const buf = await fileStore.readAssetFile(saved.filePath, "w1");
    expect(buf.toString()).toBe("ok");
    const delOk = await fileStore.deleteAssetFile(saved.filePath, "w1");
    expect(delOk.ok).toBe(true);
  });
});

// ══════════════ F. 对账净占用一致性（配套） ══════════════

describe("R0-J3 F：对账终态/待清理净占用", () => {
  it("PENDING_CLEANUP 认领参与在途解释；RELEASED 终态不再当在途；对账零写", async () => {
    const { claimObjectCleanup, finalizeObjectCleanup, reconcileWorkspaceStorage } = await import("@/lib/storage-quota");
    seedQuota("w1", BigInt(30), BigInt(-1));
    const c = await claimObjectCleanup("w1", "w1/pen.bin", 30, { userId: "u1" });
    // 对账：无文档记录但占用 30 → diff = 30 = 在途认领字节 → 可解释
    const report1 = await reconcileWorkspaceStorage("w1");
    expect(report1.usageDrift!.inFlightBytes).toBe("30");
    expect(report1.notes.some((n) => n.includes("可由在途预留/待清理认领解释"))).toBe(true);
    const writesBefore = h.writes.length;
    await finalizeObjectCleanup("w1", c.claimOpId!, 30);
    // 终态后：认领不再计入在途，占用归 0 → 无未解释差异
    const report2 = await reconcileWorkspaceStorage("w1");
    expect(report2.usageDrift!.inFlightBytes).toBe("0");
    expect(report2.usageDrift!.diff).toBe("0");
    expect(h.writes.length).toBe(writesBefore); // 对账零写
  });
});
