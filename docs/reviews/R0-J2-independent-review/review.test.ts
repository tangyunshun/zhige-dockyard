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
    tables, writes, unlinkFail, createFail, beforeUnlink:null as any, writeThenThrow:false, failReleaseOnce:false, missingOpDelegate:false, failConfirm:false, failDocDelete:false,
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
  const norm = sql.replace(/\s+/g, " "); if(h.failReleaseOnce&&norm.includes("storageUsed` = `storageUsed` -")){h.failReleaseOnce=false;throw Error("synthetic release write failed");}
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
        record(name, "update"); if(name==='storageoperation'&&h.failConfirm)throw Error('synthetic confirm failed');
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
        record(name, "delete"); if(name==='document'&&h.failDocDelete)throw Error('synthetic document cleanup failed');
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
      get: (_t, prop: string) => { if(prop==='storageoperation'&&h.missingOpDelegate)return undefined;
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
    writeFile: async (p: string, data: Buffer) => { memFiles.set(p, data); if(h.writeThenThrow)throw Error("synthetic write response lost after persistence"); },
    readFile: async (p: string) => {
      const d = memFiles.get(p);
      if (!d) { const e: any = new Error("ENOENT: no such file"); e.code = "ENOENT"; throw e; }
      return d;
    },
    unlink: async (p: string) => { if(h.beforeUnlink)await h.beforeUnlink(p);
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
import fsEvidence from 'node:fs';
import {afterEach,afterAll,it,expect} from 'vitest';
import {reserveStorageBytes,reconcileWorkspaceStorage,deleteDocumentsAndReleaseStorage} from '@/lib/storage-quota';
const evidence:any[]=[];
beforeEach(()=>{seedQuota('w1',0n,1000n);h.beforeUnlink=null;h.writeThenThrow=false;h.failReleaseOnce=false;h.missingOpDelegate=false;h.failConfirm=false;h.failDocDelete=false;vi.stubEnv('STORAGE_DRIVER','local');});
afterEach(()=>vi.unstubAllEnvs());
const used=()=>h.tables.workspacequota.get('q-w1').storageUsed;
const ops=()=>[...(h.tables.storageoperation?.values()??[])];
const jsonReq=(body:any)=>new NextRequest('http://localhost/api/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'w1',...body})});
async function run(body:any){const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(jsonReq(body),makeDeps());return {status:res.status,body:await res.json()};}
async function upload(action='upload_doc',workspaceId='w1',content='abc'){const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action,title:'synthetic',visibility:'PRIVATE',workspaceId,...(action==='upload_knowledge_attachment'?{knowledgeId:'k1'}:{})},{name:'test.txt',type:'text/plain',content}),makeDeps());return {status:res.status,body:await res.json()};}
function seedFile(id='d1',size=30,rel='w1/'+id){h.tables.document.set(id,{id,workspaceId:'w1',title:id,status:'APPROVED',visibility:'PRIVATE',filePath:rel,fileSize:size,uploaderId:'u1',type:'doc'});const p=require('node:path').join(process.cwd(),'uploads','assets',rel.replace(/^assets\//,''));memFiles.set(p,Buffer.alloc(size));return p;}
it('fixed real upload IDs and zero quota refusal, positive acceptance',async()=>{const a=await upload();expect(a.status).toBe(200);h.tables.workspace.set('w2',{id:'w2',type:'PERSONAL',ownerId:'u1',name:'second'});seedQuota('w2',0n,0n);const b=await upload('upload_doc','w2');expect(b.status).toBe(403);expect(ops()).toHaveLength(1);expect(ops()[0].opId).toBeTruthy();expect(ops()[0].userId).toBe('u1');expect(ops()[0].status).toBe('CONFIRMED');evidence.push({case:'IDs and quota fixed',accepted:true,first:a.status,second:b,used:used(),operations:ops()});});
it('pending physical delete has already freed its storage allowance',async()=>{const p=seedFile();seedQuota('w1',30n,30n);h.unlinkFail.add(p);const r=await run({action:'remove_asset',assetId:'d1',reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(r.body.code).toBe('STORAGE_CLEANUP_PENDING');expect(used()).toBe(0n);expect(memFiles.has(p)).toBe(true);const next=await upload('upload_doc','w1','x'.repeat(30));expect(next.status).toBe(200);expect([...memFiles.values()].reduce((n,b)=>n+b.length,0)).toBe(60);evidence.push({case:'cleanup pending uncharged',deletion:r,newUploadStatus:next.status,quota:30,used:used(),physicalBytes:60,operations:ops()});});
it('failed pending-cleanup record insert leaves neither document nor recovery record',async()=>{const p=seedFile();seedQuota('w1',30n,30n);h.unlinkFail.add(p);h.createFail.set('storageoperation',Error('synthetic cleanup lead persistence failed'));const r=await run({action:'remove_asset',assetId:'d1',reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(h.tables.document.size).toBe(0);expect(ops()).toHaveLength(0);expect(used()).toBe(0n);expect(memFiles.size).toBe(1);evidence.push({case:'cleanup lead insert failed',...r,used:used(),objects:1,documents:0,operations:ops()});});
it.each(['batch_delete_assets','batch_remove_assets'])('%s actual cleanup failure result is treated as success',async action=>{const p=seedFile('deleted');seedQuota('w1',30n,30n);h.unlinkFail.add(p);const r=await run({action,assetIds:['deleted'],reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(r.body.success).toBe(true);expect(used()).toBe(0n);expect(memFiles.size).toBe(1);evidence.push({case:'batch cleanup response '+action,...r,used:used(),objects:1,operations:ops()});});
it('clear-data release write failure loses its claimed record without operation evidence',async()=>{seedFile();seedQuota('w1',30n,100n);h.failReleaseOnce=true;const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));expect(res.status).toBe(500);expect(h.tables.document.size).toBe(0);expect(memFiles.size).toBe(0);expect(used()).toBe(30n);expect(ops()).toHaveLength(0);evidence.push({case:'clear claim then release fails',status:res.status,used:used(),documents:0,objects:0,operations:ops()});});
it('clear-data new uploads after scan now survive, positive acceptance',async()=>{seedFile();seedQuota('w1',30n,1000n);h.beforeUnlink=async()=>{h.beforeUnlink=null;const r=await upload();expect(r.status).toBe(200);};const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));expect(res.status).toBe(200);expect(h.tables.document.size).toBe(1);expect(memFiles.size).toBe(1);expect(used()).toBe(3n);evidence.push({case:'clear new upload fixed',accepted:true,status:res.status,used:used(),documents:1,objects:1});});
it('clear-data physical failure now preserves record, positive acceptance',async()=>{const p=seedFile();seedQuota('w1',30n,100n);h.unlinkFail.add(p);const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));const body=await res.json();expect(body.storage.failedCount).toBe(1);expect(h.tables.document.size).toBe(1);expect(used()).toBe(30n);evidence.push({case:'clear physical failure fixed',accepted:true,status:res.status,body,used:used()});});
it('clear-data shared-reference-only retention still announces full factory reset',async()=>{seedFile('a',30,'w1/shared');seedFile('b',30,'w1/shared');seedQuota('w1',30n,100n);const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));const body=await res.json();expect(body.storage.sharedRefKept).toBe(2);expect(h.tables.document.size).toBe(2);expect(body.message).toContain('纯净出厂状态');evidence.push({case:'clear shared-only false completion',status:res.status,body,remainingDocuments:2,used:used()});});
it('known aliases of one object evade shared-reference protection',async()=>{seedFile('a',30,'assets/w1/shared');seedFile('b',30,'w1/shared');seedQuota('w1',30n,100n);const r=await run({action:'remove_asset',assetId:'a',reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(h.tables.document.has('b')).toBe(true);expect(memFiles.size).toBe(0);expect(used()).toBe(0n);evidence.push({case:'shared object alias missed',...r,remainingDoc:h.tables.document.get('b'),objects:0,used:used()});});
it('unknown ordinary write retains capacity but never enters pending cleanup or records object location',async()=>{h.writeThenThrow=true;const r=await upload();expect(r.status).toBe(500);expect(r.body.code).not.toBe('STORAGE_OP_PENDING');expect(used()).toBe(3n);expect(memFiles.size).toBe(1);expect(ops()[0].status).toBe('RESERVED');expect(ops()[0].filePath).toBeUndefined();evidence.push({case:'ordinary unknown save unreachable marker',...r,used:used(),objects:[...memFiles.keys()],operations:ops()});});
it('unknown attachment write has the same unreachable marker',async()=>{h.tables.document.set('k1',{id:'k1',workspaceId:'w1',type:'knowledge',status:'APPROVED',uploaderId:'u1'});h.writeThenThrow=true;const r=await upload('upload_knowledge_attachment');expect(r.status).toBe(500);expect(r.body.code).not.toBe('STORAGE_OP_PENDING');expect(ops()[0].status).toBe('RESERVED');evidence.push({case:'attachment unknown save unreachable marker',...r,used:used(),objects:[...memFiles.keys()],operations:ops()});});
it('cleaned upload failure still leaves RESERVED operation charged as in-flight by reconciliation',async()=>{h.createFail.set('document',Error('synthetic document insert failed'));const r=await upload();expect(r.status).toBe(500);expect(used()).toBe(0n);expect(memFiles.size).toBe(0);expect(ops()[0].status).toBe('RESERVED');const report=await reconcileWorkspaceStorage('w1');expect(report.operations.reservedBytes).toBe('3');evidence.push({case:'cleaned failure stale reservation',...r,used:used(),operations:ops(),report});});
it('confirmation and metadata cleanup failures leave successful-looking document with missing file',async()=>{h.failConfirm=true;h.failDocDelete=true;const r=await upload();expect(r.status).toBe(500);expect(h.tables.document.size).toBe(1);expect(memFiles.size).toBe(0);expect(used()).toBe(0n);expect([...h.tables.document.values()][0].status).toBe('APPROVED');evidence.push({case:'confirmation plus metadata cleanup failure',...r,used:used(),documents:[...h.tables.document.values()],objects:0,operations:ops()});});
it('missing operation delegate remains an unstable 500',async()=>{h.missingOpDelegate=true;const r=await upload();expect(r.status).toBe(500);expect(r.body.code).not.toBe('STORAGE_QUOTA_NOT_READY');expect(used()).toBe(0n);evidence.push({case:'delegate readiness',...r,used:used()});});
it('P2002 conflict branch accepts another actor unlike normal replay branch',async()=>{let injected=false;h.setRawGate(async()=>{if(!injected){injected=true;h.tables.storageoperation.set('other-commit',{id:'other-commit',opId:'race',workspaceId:'w1',userId:'u-other',bytes:3,opType:'RESERVE',status:'CONFIRMED'});h.tables.workspacequota.get('q-w1').storageUsed=3n;h.setRawGate(null);}});const r=await reserveStorageBytes('w1',3,'race','u1');expect(r.deduped).toBe(true);expect(used()).toBe(3n);evidence.push({case:'unique conflict actor check omitted',result:r,operations:ops(),limits:'Injected another committed operation and its occupancy between lookup and create; no claim of real MySQL scheduling'});});
it('fresh deletion input and remaining exact shared references now work, positive acceptance',async()=>{seedFile('a',30,'w1/shared');seedFile('b',30,'w1/shared');seedQuota('w1',30n,100n);const r=await run({action:'remove_asset',assetId:'a',reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(r.body.data.physicalFileRetained).toBe(true);expect(h.tables.document.has('b')).toBe(true);expect(memFiles.size).toBe(1);expect(used()).toBe(30n);evidence.push({case:'exact shared reference fixed',accepted:true,...r,used:used(),objects:1});});
it('case-sensitive identities, empty-set drift and list-only inventory are fixed, positive acceptance',async()=>{let reads=0;const r=await reconcileWorkspaceStorage('w1',{quotaRow:{storageUsed:30n,storageLimit:100n},docRows:[],listObjects:async()=>{reads++;return [{key:'w1/orphan',size:30}];}});expect(reads).toBe(1);expect(r.usageDrift?.diff).toBe('30');expect(r.physical.orphanObjects).toHaveLength(1);const keys=await reconcileWorkspaceStorage('w1',{quotaRow:{storageUsed:60n,storageLimit:100n},docRows:[{id:'a',filePath:'w1/A.txt',fileSize:30},{id:'b',filePath:'w1/a.txt',fileSize:30}]});expect(keys.docs.uniqueObjects).toBe(2);evidence.push({case:'reconcile original gaps fixed',accepted:true,empty:r,caseSensitive:keys});});
it('read-to-write negative usage now rejects, positive acceptance',async()=>{h.setRawGate(async()=>{h.setRawGate(null);h.tables.workspacequota.get('q-w1').storageUsed=-10n;});await expect(reserveStorageBytes('w1',5,'negative-window','u1')).rejects.toMatchObject({code:'STORAGE_USAGE_INVALID'});expect(used()).toBe(-10n);expect(ops()).toHaveLength(0);evidence.push({case:'invalid usage write bound fixed',accepted:true,used:used(),operations:ops()});});
afterAll(()=>fsEvidence.writeFileSync('docs/reviews/R0-J2-independent-review/handler-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),evidence,limits:'Actual handlers/services; existing memory Prisma/fs with fault hooks. No real DB, user storage, cloud, provider or payment. Positive cases marked accepted; other PASS asserts current defect reproduction.'},(_,v)=>typeof v==='bigint'?v.toString():v,2)));
