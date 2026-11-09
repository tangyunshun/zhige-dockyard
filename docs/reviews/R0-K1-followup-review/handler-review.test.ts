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
        else if (op === "gte") { if (!(rv >= ov)) return false; }
        else if (op === "lte") { if (!(rv <= ov)) return false; }
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
      } else if (v !== null && typeof v === "object" && !(v instanceof Date) && ("increment" in v || "decrement" in v)) {
        next[k] = next[k] + ((v as any).increment ?? -((v as any).decrement));
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
      if ((name === "parseadmissioncounter" && rows().some(r => r.id === data.id)) || (name === "parselease" && rows().some(r => r.leaseId === data.leaseId || r.claimToken === data.claimToken))) { const e: any = new Error("Unique"); e.code = "P2002"; throw e; }
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
});
import {afterEach,afterAll} from 'vitest';
import {EventEmitter} from 'node:events';
const observations:any[]=[];
afterEach(async()=>{(await import('@/lib/parse-runner')).__resetParseRunnerHooks();(await import('@/lib/parse-admission')).__setParseAdmissionBackendForTest(null);});
describe('Current actual Studio upload and F13 storage protocol',()=>{
 it('positive: denied shared admission now rejects actual upload before worker/storage',async()=>{
  seedQuota('w1',0n,1000n);let acquired=0,starts=0;
  const a=await import('@/lib/parse-admission'),p=await import('@/lib/parse-policy'),r=await import('@/lib/parse-runner');
  a.__setParseAdmissionBackendForTest({acquire:async()=>{acquired++;throw new p.ParseResourceError(p.PARSE_CODES.ADMISSION_NOT_READY);},release:async()=>true,quarantine:async()=>{},sweep:async()=>0});
  r.__setParseRunnerHooks({workerFactory:()=>{starts++;throw Error('must not start');}});
  const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'test',visibility:'PRIVATE',workspaceId:'w1'},{name:'small.txt',type:'text/plain',content:'Controlled text'}),makeDeps());
  expect(res.status).toBe(503);expect(acquired).toBe(1);expect(starts).toBe(0);expect(memFiles.size).toBe(0);expect(h.tables.document.size).toBe(0);
  observations.push({name:'upload-admission-now-wired',status:res.status,acquired,workerStarts:starts,files:memFiles.size});
 });
 it('positive: actual upload no longer immediately releases on STOP_UNCONFIRMED',async()=>{
  seedQuota('w1',0n,1000n);let acquired=0,released=0,quarantined=0;let fake:any;
  const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner');
  a.__setParseAdmissionBackendForTest({acquire:async()=>{acquired++;return 'granted';},release:async()=>{released++;return true;},quarantine:async()=>{quarantined++;},sweep:async()=>0});
  r.__setParseRunnerHooks({exitConfirmMs:5,terminateTimeoutMs:5,workerFactory:()=>{fake=new EventEmitter();fake.terminate=()=>new Promise(()=>{});queueMicrotask(()=>fake.emit('message',{envelope:'result',text:'Controlled text',usage:{}}));return fake;}});
  const deps=makeDeps(),{runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'test',visibility:'PRIVATE',workspaceId:'w1'},{name:'small.txt',type:'text/plain',content:'Controlled text'}),deps);const body=await res.json();
  expect(body.code).toBe('PARSE_STOP_UNCONFIRMED');expect(res.status).toBe(503);expect(acquired).toBe(1);expect(released).toBe(0);expect(quarantined).toBe(0);expect(deps.creditService.consumePoints).not.toHaveBeenCalled();expect(deps.creditService.consumeAndCreateSettlementHold).not.toHaveBeenCalled();
  observations.push({name:'studio-immediate-release-fixed-but-no-quarantine',status:res.status,code:body.code,acquired,released,quarantined,workerExitNotObserved:true,used:String(h.tables.workspacequota.get('q-w1').storageUsed),documents:h.tables.document.size});fake.emit('exit',0);
 });
 it('positive: admitted normal upload preserves real F13 accounting and output',async()=>{
  seedQuota('w1',0n,1000n);let acquired=0,released=0,starts=0;const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner'),{Worker}=await import('node:worker_threads');
  a.__setParseAdmissionBackendForTest({acquire:async()=>{acquired++;return 'granted';},release:async()=>{released++;return true;},quarantine:async()=>{},sweep:async()=>0});r.__setParseRunnerHooks({workerFactory:(file,opts)=>{starts++;return new Worker(file,opts);}});
  const content='Controlled normal storage upload.',{runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'test',visibility:'PRIVATE',workspaceId:'w1'},{name:'small.txt',type:'text/plain',content}),makeDeps());
  expect(res.status).toBe(200);expect(acquired).toBe(1);expect(released).toBe(1);expect(starts).toBe(1);expect(h.tables.document.size).toBe(1);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(BigInt(Buffer.byteLength(content)));
  observations.push({name:'normal-upload-storage-positive',status:res.status,acquired,released,starts,used:String(h.tables.workspacequota.get('q-w1').storageUsed)});
 });
});
afterAll(()=>require('node:fs').writeFileSync(require('node:path').join(process.cwd(),'docs/reviews/R0-K1-followup-review/handler-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'Actual handler/storage/parser; fake IO, real normal worker or explicit controlled lifecycle double',observations},null,2)));

describe('Studio retained unknown work and actual expiry algorithm',()=>{
 it('defect KR4: skipped immediate release stays ACTIVE and expiry frees unconfirmed work',async()=>{
  seedQuota('w1',0n,1000n);const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner');a.__setParseAdmissionBackendForTest(a.createPrismaBackend());let fake:any,exitSeen=false;
  r.__setParseRunnerHooks({terminateTimeoutMs:5,exitConfirmMs:5,workerFactory:()=>{fake=new EventEmitter();fake.on('exit',()=>exitSeen=true);fake.terminate=()=>new Promise(()=>{});queueMicrotask(()=>fake.emit('message',{envelope:'result',text:'Controlled text',usage:{}}));return fake;}});
  const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'test',visibility:'PRIVATE',workspaceId:'w1'},{name:'small.txt',type:'text/plain',content:'Controlled text'}),makeDeps());const body=await res.json();expect(res.status).toBe(503);expect(body.code).toBe('PARSE_STOP_UNCONFIRMED');
  const lease=[...h.tables.parselease.values()][0];expect(lease.status).toBe('ACTIVE');expect(h.tables.parseadmissioncounter.get('platform').active).toBe(1);await a.sweepParseLeases(Date.now()+100000);expect(h.tables.parselease.get(lease.id).status).toBe('EXPIRED');expect(h.tables.parseadmissioncounter.get('platform').active).toBe(0);expect(exitSeen).toBe(false);
  observations.push({name:'studio-unknown-active-expiry-releases',status:res.status,initialLeaseStatus:'ACTIVE',afterSweepStatus:'EXPIRED',remainingActive:0,exitEventSeen:false,workerMode:'Controlled EventEmitter; no real unbounded CPU task'});fake.emit('exit',0);
 });
});
