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
    tables, writes, unlinkFail, createFail, deleteFail, updateFail, beforeUnlink: null as any, afterDocDelete: null as any, beforeOpRead: null as any, beforeOpCreate: null as any,
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
    findUnique: async ({ where, select }: any) => { if(name === "storageoperation" && h.beforeOpRead) await h.beforeOpRead(where);
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
    create: async ({ data }: any) => { if(name === "storageoperation" && h.beforeOpCreate) await h.beforeOpCreate(data);
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
      if(name === "document" && h.afterDocDelete) await h.afterDocDelete({where,count});
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
    unlink: async (p: string) => { if(h.beforeUnlink) await h.beforeUnlink(p);
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
  h.beforeUnlink=null; h.afterDocDelete=null; h.beforeOpRead=null; h.beforeOpCreate=null;
  seedWorkspace();
});
// Independent characterization: defect tests assert the observed unsafe state, not acceptance.
import { afterAll } from 'vitest';
const observations: any[] = [];
function observe(name: string, facts: any) { observations.push({name,...facts}); }
function doc(id='d1', key='w1/x.bin', bytes=30) {
  const row={id,workspaceId:'w1',title:id,status:'APPROVED',visibility:'PRIVATE',filePath:key,fileSize:bytes,uploaderId:'u1',type:'doc'};
  h.tables.document.set(id,row);return row;
}
function abs(key='w1/x.bin'){return require('node:path').join(process.cwd(),'uploads','assets',key);}
function removeReq(id='d1'){return new NextRequest('http://localhost/api/studio',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-token'},body:JSON.stringify({action:'remove_asset',workspaceId:'w1',assetId:id,reasonCode:'VIOLATION'})});}
function clearReq(){return new NextRequest('http://localhost/api/workspace/clear-data',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-token'},body:JSON.stringify({workspaceId:'w1',confirmText:'确认删除'})});}
function latch(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
function pending(key='w1/x.bin',bytes=30){const opId='del-w1-'+key;h.tables.storageoperation.set('claim',{id:'claim',opId,workspaceId:'w1',userId:'u1',opType:'RELEASE',status:'PENDING_CLEANUP',filePath:key,documentId:'d1',bytes});return opId;}

describe('R0-J3 independent current-version evidence',()=>{
  it('positive: physical failure keeps quota and prevents a new upload',async()=>{
    seedQuota('w1',30n,30n);doc();memFiles.set(abs(),Buffer.alloc(30));h.unlinkFail.add(abs());
    const {runStudioPost}=await import('@/app/api/studio/handler');
    const deletion=await runStudioPost(removeReq(),makeDeps());
    const upload=await runStudioPost(multipartReq({action:'upload_doc',title:'new',visibility:'PRIVATE',workspaceId:'w1'},{name:'new.bin',type:'application/octet-stream',content:'123456789012345678901234567890'}),makeDeps());
    expect([deletion.status,upload.status]).toEqual([500,403]);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);
    observe('capacity-positive',{deletion:deletion.status,upload:upload.status,used:30,files:memFiles.size});
  });
  it('positive: failed cleanup claim stops before destructive operations',async()=>{
    seedQuota('w1',30n,30n);doc();memFiles.set(abs(),Buffer.alloc(30));h.createFail.set('storageoperation',new Error('claim persistence failed'));
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(removeReq(),makeDeps());
    expect(res.status).toBe(500);expect(h.tables.document.size).toBe(1);expect(memFiles.size).toBe(1);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);
    observe('claim-failure-positive',{status:res.status,body:await res.json(),used:30,docs:1,files:1});
  });
  it('defect: concurrent loser cancels winner claim before finalization; no recovery remains',async()=>{
    seedQuota('w1',30n,30n);doc();memFiles.set(abs(),Buffer.alloc(30));
    const enteredA=latch(),enteredB=latch(),allowA=latch(),allowB=latch(),rowDeleted=latch(),allowFinish=latch();let calls=0;
    h.beforeUnlink=async()=>{calls++;if(calls===1){enteredA.resolve();await allowA.promise;}else if(calls===2){enteredB.resolve();await allowB.promise;}};
    h.afterDocDelete=async({count}:any)=>{if(count===1){rowDeleted.resolve();await allowFinish.promise;}};
    const {runStudioPost}=await import('@/app/api/studio/handler');
    const a=runStudioPost(removeReq(),makeDeps());await enteredA.promise;
    const b=runStudioPost(removeReq(),makeDeps());await enteredB.promise;
    allowA.resolve();await rowDeleted.promise;allowB.resolve();const rb=await b;
    expect([...h.tables.storageoperation.values()][0].status).toBe('CANCELLED');allowFinish.resolve();const ra=await a;
    expect([ra.status,rb.status]).toEqual([500,404]);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);expect(h.tables.document.size).toBe(0);expect(memFiles.size).toBe(0);
    const {POST}=await import('@/app/api/workspace/clear-data/route');const retry=await POST(clearReq());const result=await retry.json();
    expect(result.storage.pendingRecovered).toBe(0);expect(result.message).toContain('纯净出厂状态');
    observe('concurrent-cancellation-defect',{a:ra.status,b:rb.status,used:h.tables.workspacequota.get('q-w1').storageUsed,docs:0,files:0,ops:[...h.tables.storageoperation.values()],clearRetry:result});
  });
  it('defect: recovery sweep bypasses alias references, deletes shared file and frees capacity',async()=>{
    seedQuota('w1',30n,30n);doc('d1','assets/w1/x.bin');doc('d2','w1/x.bin');memFiles.set(abs(),Buffer.alloc(30));pending();
    const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(clearReq());const body=await res.json();
    expect(body.storage.sharedRefKept).toBe(2);expect(h.tables.document.size).toBe(2);expect(memFiles.size).toBe(0);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(0n);
    observe('recovery-shared-defect',{status:res.status,body,docs:[...h.tables.document.values()],files:0,used:0,ops:[...h.tables.storageoperation.values()]});
  });
  it('defect: recovery-only commit failure is swallowed and returns factory-reset success',async()=>{
    seedQuota('w1',30n,30n);pending();h.setCommitFailures(1);
    const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(clearReq());const body=await res.json();
    expect(res.status).toBe(200);expect(body.message).toContain('纯净出厂状态');expect(body.storage.pendingStill).toBe(0);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);expect([...h.tables.storageoperation.values()][0].status).toBe('PENDING_CLEANUP');
    observe('recovery-error-hidden-defect',{status:res.status,body,used:30,ops:[...h.tables.storageoperation.values()]});
  });
  it('defect: remove commit failure followed by same deletion retry reports success without releasing pending quota',async()=>{
    seedQuota('w1',30n,30n);doc();memFiles.set(abs(),Buffer.alloc(30));h.setCommitFailures(1);
    const {runStudioPost}=await import('@/app/api/studio/handler');const first=await runStudioPost(removeReq(),makeDeps());const retry=await runStudioPost(removeReq(),makeDeps());const body=await retry.json();
    expect(first.status).toBe(500);expect(retry.status).toBe(200);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);expect([...h.tables.storageoperation.values()][0].status).toBe('PENDING_CLEANUP');
    observe('remove-retry-defect',{first:first.status,retry:retry.status,body,used:30,ops:[...h.tables.storageoperation.values()]});
  });
  it('positive: pre-bound unknown upload retains file, quota and stable recovery identity',async()=>{
    seedQuota('w1',0n,30n);fileFlags.failSaveAfterWrite=true;fileFlags.failDelete=true;
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'unknown',visibility:'PRIVATE',workspaceId:'w1'},{name:'x.bin',type:'application/octet-stream',content:'123'}),makeDeps());const body=await res.json();
    expect(body.code).toBe('STORAGE_OP_PENDING');const op=[...h.tables.storageoperation.values()][0];expect(op.filePath).toBe(body.filePath);expect(op.status).toBe('PENDING_CLEANUP');expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(3n);
    observe('upload-unknown-positive',{status:res.status,body,op,used:3,files:memFiles.size});
  });
  it('positive: written object response lost but cleanup succeeds -> RELEASED terminal state',async()=>{
    seedQuota('w1',0n,30n);fileFlags.failSaveAfterWrite=true;
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'safe cleanup',visibility:'PRIVATE',workspaceId:'w1'},{name:'x.bin',type:'application/octet-stream',content:'123'}),makeDeps());
    expect(res.status).toBe(500);expect([...h.tables.storageoperation.values()][0].status).toBe('RELEASED');expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(0n);expect(memFiles.size).toBe(0);
    observe('upload-cleanup-positive',{status:res.status,op:[...h.tables.storageoperation.values()][0],used:0,files:0});
  });
  it('defect: ordinary reserve replay accepts a RELEASE operation as the same reservation',async()=>{
    seedQuota('w1',30n,30n);const opId=pending();const {reserveStorageBytes}=await import('@/lib/storage-quota');
    const result=await reserveStorageBytes('w1',30,opId,'u1');expect(result.deduped).toBe(true);
    observe('reserve-type-defect',{result,op:[...h.tables.storageoperation.values()][0],used:30});
  });
  it('defect: pending claim bytes conflict is ignored; caller bytes release another object capacity',async()=>{
    seedQuota('w1',80n,80n);doc('d1','w1/x.bin',50);doc('other','w1/other.bin',50);memFiles.set(abs(),Buffer.alloc(30));memFiles.set(abs('w1/other.bin'),Buffer.alloc(50));pending('w1/x.bin',30);
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(removeReq(),makeDeps());
    expect(res.status).toBe(200);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);expect(memFiles.get(abs('w1/other.bin'))?.length).toBe(50);expect([...h.tables.storageoperation.values()][0].bytes).toBe(30);
    observe('claim-bytes-mismatch-defect',{status:res.status,body:await res.json(),used:30,remainingPhysicalBytes:50,ops:[...h.tables.storageoperation.values()]});
  });
  it('defect: unknown file size is silently coerced to zero and destructive cleanup is marked released',async()=>{
    seedQuota('w1',30n,30n);doc();h.tables.document.get('d1').fileSize=null;memFiles.set(abs(),Buffer.alloc(30));
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(removeReq(),makeDeps());
    expect(res.status).toBe(200);expect(h.tables.document.size).toBe(0);expect(memFiles.size).toBe(0);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(30n);expect([...h.tables.storageoperation.values()][0].status).toBe('RELEASED');
    observe('unknown-size-defect',{status:res.status,body:await res.json(),used:30,files:0,docs:0,ops:[...h.tables.storageoperation.values()]});
  });
  it('defect: real P2002 branch also accepts wrong operation type',async()=>{
    seedQuota('w1',0n,-1n);let injected=false;
    h.beforeOpCreate=async(data:any)=>{if(!injected&&data.opType==='RESERVE'){injected=true;h.tables.storageoperation.set('other',{id:'other',opId:data.opId,workspaceId:'w1',userId:'u1',opType:'RELEASE',status:'PENDING_CLEANUP',bytes:30,filePath:'w1/x.bin'});}};
    const {reserveStorageBytes}=await import('@/lib/storage-quota');const result=await reserveStorageBytes('w1',30,'race-type','u1');
    expect(injected).toBe(true);expect(result.deduped).toBe(true);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(0n);
    observe('reserve-p2002-type-defect',{result,used:0,op:[...h.tables.storageoperation.values()][0]});
  });
  it('defect: missing storage operation column P2022 is not normalized to 503',async()=>{
    seedQuota('w1',0n,30n);h.beforeOpRead=async()=>{const e:any=new Error('The column storageoperation.filePath is missing');e.code='P2022';throw e;};
    const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action:'upload_doc',title:'not ready',visibility:'PRIVATE',workspaceId:'w1'},{name:'x.bin',type:'application/octet-stream',content:'123'}),makeDeps());const body=await res.json();
    expect(res.status).toBe(500);expect(body.code).toBeUndefined();expect(memFiles.size).toBe(0);expect(h.tables.workspacequota.get('q-w1').storageUsed).toBe(0n);
    observe('missing-column-defect',{status:res.status,body,used:0,files:0});
  });
  it('positive: ambiguous candidates are both preserved; traversal and cross-workspace are refused',async()=>{
    const fs=await import('@/lib/file-store');memFiles.set(abs(),Buffer.from('NEW'));memFiles.set(abs('assets/w1/x.bin'),Buffer.from('OLD'));
    const ambiguous=await fs.deleteAssetFile('w1/x.bin','w1');expect(ambiguous.ambiguous).toBe(true);expect(memFiles.size).toBe(2);
    expect(()=>fs.resolveAssetAbsolute('w1/../../outside.txt')).toThrow();await expect(fs.readAssetFile('w2/x.bin','w1')).rejects.toMatchObject({code:'OBJECT_PATH_ESCAPE'});
    const traversal=await fs.deleteAssetFile('w1/../../outside.txt','w1');expect(traversal.ok).toBe(false);const scope=await fs.deleteAssetFile('w2/x.bin','w1');expect(scope.ok).toBe(false);
    observe('paths-positive',{ambiguous,traversal,scope,files:2});
  });
});
afterAll(()=>require('node:fs').writeFileSync(require('node:path').join(process.cwd(),'docs/reviews/R0-J3-independent-review/handler-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'in-memory DB and fs; actual handlers/services; defect assertions characterize current behavior',observations},(_k,v)=>typeof v==='bigint'?v.toString():v,2)));
