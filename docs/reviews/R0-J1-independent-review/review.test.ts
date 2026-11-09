/**
 * R0-J 隔离回归：存储配额止损闭环（原方案 F13）。
 *
 * 覆盖 IDE-R0-J-PROMPT.md S01—S07：
 *  - S01 配额语义：缺失/0/非法/负值拒绝；-1 不限；BigInt 判定；JSON 文本不采信客户端 fileSize；
 *  - S02 原子占用：预留 = 单条条件 UPDATE（内存夹具真实求值条件），并发至多占用至上限；
 *  - S03 两条上传链路（真实 runStudioPost + multipart）：鉴权前置、预留、保存、记录、失败清理；
 *  - S04 file-store 路径一致（内存 fs）：save/read/delete 同一对象；删除失败如实返回；
 *  - S05 删除只释放一次：原子扣减、软删除继续占用、恢复不重复计量、批量/clear-data 旁路；
 *  - S06 只读对账：正常与差异均可解释，DB/对象写方法全 0。
 *
 * 隔离说明：真实 runStudioPost/真实配额与文件函数；Prisma 为内存夹具（$executeRaw 对已知
 * 语句真实求值条件并记录 SQL，事务串行）；fs/promises 为内存文件表。内存测试不证明 MySQL
 * 行锁/隔离级别；S3 驱动仅覆盖本地路径一致性契约，不发起真实网络访问。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════ 内存 Prisma（$executeRaw 真实求值已知语句 + 记录 SQL） ══════════════

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const rawSql: string[] = [];
  const unlinkFail = new Set<string>(); // 模拟 unlink 非 ENOENT 失败
  // 并发屏障：raw 求值钩子（测试可注入 await 实现交错）
  let rawGate: ((sql: string) => Promise<void>) | null = null;
  const setRawGate = (g: ((sql: string) => Promise<void>) | null) => { rawGateVal = g; };
  let rawGateVal: ((sql: string) => Promise<void>) | null = null;
  return { tables, writes, rawSql, setRawGate, getRawGate: () => rawGateVal, unlinkFail, beforeUnlink:null as any, createDocFail:false,writeThenThrow:false,strictOpId:false,failOpCreate:false,failOpUpdate:false,missingOpDelegate:false };
});

function getTable(name: string): Map<string, any> {
  if (!h.tables[name]) h.tables[name] = new Map();
  return h.tables[name];
}

function matchRow(row: any, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      // updateMany increment 出现在 data 不在 where
      for (const [op, ov] of Object.entries(v)) {
        const rv = row[k];
        if (op === "not") { if (rv === ov) return false; }
        else if (op === "gt") { if (!(rv > ov)) return false; }
        else if (op === "lt") { if (!(rv < ov)) return false; }
        else if (op === "in") { if (!Array.isArray(ov) || !ov.includes(rv)) return false; }
        else { return false; }
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

/** 对已知 raw 语句真实求值（workspacequota 预留/释放/钳制），返回受影响行数 */
function evalRaw(sql: string, values: any[]): number {
  const norm = sql.replace(/\s+/g, " ");
  const wsId = values.find((v) => typeof v === "string");
  const byteVal = (values.find((v) => typeof v === "bigint") ?? BigInt(0)) as bigint;
  // 行按 workspaceId 定位（与真实 DB 的 WHERE workspaceId 一致）
  const row = [...getTable("workspacequota").values()].find((r) => r.workspaceId === wsId);
  if (!row) return 0;
  const used = row.storageUsed as bigint;
  const limit = row.storageLimit as bigint;
  // -1 条件预留（J-WRITE-BOUND：写边界核验 limit 仍为 -1）
  if (norm.includes("storageUsed` = `storageUsed` +") && norm.includes("`storageLimit` = -1")) {
    if (limit === BigInt(-1)) {
      row.storageUsed = used + byteVal;
      return 1;
    }
    return 0;
  }
  // 有限预留（核验 + 预留同一语句）
  if (norm.includes("storageUsed` = `storageUsed` +") && norm.includes("<= `storageLimit`")) {
    if (used + byteVal <= limit) {
      row.storageUsed = used + byteVal;
      return 1;
    }
    return 0;
  }
  // 原子扣减
  if (norm.includes("storageUsed` = `storageUsed` -") && norm.includes("storageUsed` >= ")) {
    if (used >= byteVal) {
      row.storageUsed = used - byteVal;
      return 1;
    }
    return 0;
  }
  // 漂移钳制
  if (norm.includes("storageUsed` = 0") && norm.includes("storageUsed` < ")) {
    if (used > BigInt(0) && used < byteVal) {
      row.storageUsed = BigInt(0);
      return 1;
    }
    return 0;
  }
  throw new Error("[r0j-mock] 未识别的 raw 语句: " + norm.slice(0, 120));
}

function makePrisma() {
  let txDepth = 0;
  let txQueue: Promise<any> = Promise.resolve();
  const record = (kind: string, model: string, method: string) => h.writes.push(`${kind} ${model}.${method}`);
  const model = (name: string) => {
    const rows = () => [...getTable(name).values()];
    const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
    const applyData = (row: any, data: any) => {
      const next = { ...row };
      for (const [k, v] of Object.entries(data || {})) {
        if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "increment" in v) {
          next[k] = (typeof next[k] === "bigint" ? next[k] : BigInt(Math.trunc(Number(next[k] ?? 0)))) + BigInt((v as any).increment);
        } else if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "set" in v) {
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
        rows()
          .filter((r) => matchRow(r, where))
          .map((r) => (select ? selectFields(r, select) : { ...r })),
      count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
      create: async ({ data }: any) => {
        record("ROOT", name, "create");
 if(name==='document'&&h.createDocFail)throw Error('synthetic document create failure');
 if(name==='storageoperation'){
  if(h.failOpCreate)throw Error('synthetic operation create failed');
  if(h.strictOpId&&!data.id)throw Object.assign(Error('Argument id is missing, required by storageoperation schema'),{name:'PrismaClientValidationError'});
  if(rows().some(r=>r.opId===data.opId))throw Object.assign(Error('synthetic unique opId violation'),{code:'P2002'});
 }
        const row = { ...data };
        if (!row.id) row.id = `auto_${Math.random().toString(36).slice(2)}`;
        getTable(name).set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        record("ROOT", name, "update"); if(name==='storageoperation'&&h.failOpUpdate)throw Error('synthetic operation update failed');
        const row = findRow(where);
        if (!row) throw new Error(`P2025:${name}`);
        const next = applyData(row, data);
        getTable(name).set(row.id ?? where.id, next);
        return { ...next };
      },
      updateMany: async ({ where, data }: any) => {
        record("ROOT", name, "updateMany");
        let count = 0;
        for (const row of rows()) {
          if (matchRow(row, where)) {
            getTable(name).set(row.id, applyData(row, data));
            count++;
          }
        }
        return { count };
      },
      delete: async ({ where }: any) => {
        record("ROOT", name, "delete");
        const row = findRow(where);
        if (!row) throw new Error(`P2025:${name}`);
        getTable(name).delete(row.id ?? where.id);
        return { ...row };
      },
      deleteMany: async ({ where }: any) => {
        record("ROOT", name, "deleteMany");
        let count = 0;
        for (const row of rows()) {
          if (matchRow(row, where)) {
            getTable(name).delete(row.id);
            count++;
          }
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        record("ROOT", name, "upsert");
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
  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
 if(prop==='storageoperation'&&h.missingOpDelegate)return undefined;
 if(prop==='$transaction')return async(fn:any)=>{const run=async()=>{const snap=structuredClone(h.tables);try{return await fn(makePrisma());}catch(e){h.tables=snap;throw e;}};const pending=txQueue.then(run,run);txQueue=pending.catch(()=>{});return pending;};
        if (prop === "$executeRaw" || prop === "$executeRawUnsafe") {
          return async (query: TemplateStringsArray | { sql?: string }, ...values: any[]) => {
            const sql = typeof query === "string" ? query : (query as TemplateStringsArray).join("?");
            h.rawSql.push(sql); const gate = h.getRawGate();
            if (gate) await gate(sql);
            const n = evalRaw(sql, values);
            return n;
          };
        }
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
          return async () => [];
        }
        return model(prop);
      },
    },
  );
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
// 文件 IO：内存文件表（保存/读取/删除对同一绝对路径对象）
const memFiles = new Map<string, Buffer>();
vi.mock("fs/promises", () => {
  const impl = {
    mkdir: async () => {},
    writeFile: async (p: string, data: Buffer) => { memFiles.set(p, data); if(h.writeThenThrow)throw Error("synthetic uncertain write after persistence"); },
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
// 慢外部解析以可控桩替换（解析器本身不在本批范围）
vi.mock("@/lib/text-extract", () => ({
  extractTextFromBufferWithTimeout: vi.fn(async () => "提取的文本内容"),
}));
vi.mock("@/lib/smart-summary", () => ({
  generateSmartSummary: vi.fn(() => ({ overview: "智能摘要" })),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications-store", () => ({ addNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/credit-service", () => ({
  grantNewUserGift: vi.fn(async () => ({})),
  consumePoints: vi.fn(async () => ({})),
  refundConsumedPoints: vi.fn(async () => ({ ok: true })),
}));

import type { StudioExecutionDeps } from "@/app/api/studio/handler";

const fx = {
  consumeCalls: [] as any[],
  adapterExecuteCalls: [] as any[],
};

function seedWorkspace(opts: { type?: string; ownerId?: string } = {}) {
  h.tables.workspace = new Map([
    ["w1", { id: "w1", type: opts.type ?? "PERSONAL", ownerId: opts.ownerId ?? "u1", name: "空间", plan: "STANDARD" }],
  ]);
  h.tables.workspacemember = new Map([
    ["wm1", { id: "wm1", userId: "u1", workspaceId: "w1", role: "MEMBER", monthlyTokenLimit: null, monthlyTokenUsed: 0, tokenBalance: 10000 }],
  ]);
  h.tables.user = new Map([["u1", { id: "u1", name: "用户", membershipLevel: "FREE" }]]);
  h.tables.postmember = new Map();
  h.tables.operationlog = new Map();
  h.tables.componenttask = new Map();
  h.tables.componentusage = new Map();
  h.tables.tenant = new Map();
  h.tables.document = new Map();
  h.tables.documentremoval = new Map();
  h.tables.workspacequota = new Map();
  fx.consumeCalls = [];
  fx.adapterExecuteCalls = [];
}

function seedQuota(opts: { used?: bigint; limit?: bigint } = {}) {
  h.tables.workspacequota.set("q1", {
    id: "q1", workspaceId: "w1",
    storageUsed: opts.used ?? BigInt(0),
    storageLimit: opts.limit ?? BigInt(-1),
  });
}

beforeEach(() => {
  h.tables = {};
  h.writes.length = 0;
  h.rawSql.length = 0;
  h.setRawGate(null);
  memFiles.clear();
  seedWorkspace();
  fx.consumeCalls = [];
  fx.adapterExecuteCalls = [];
});

// ══════════════ S03/S05：真实 handler 两条上传与删除入口 ══════════════

import { prisma as mockedPrisma } from "@/lib/prisma";

function makeDeps(): StudioExecutionDeps {
  return {
    prisma: mockedPrisma as any,
    getUserId: vi.fn(async (r: any) => "u1"),
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

// storage-quota 通过顶层 import 引用 @/lib/prisma 的 mock 实例；handler 也用同一实例。
// 这里需要一个已导入的 prisma 引用（vi.mock 工厂已在模块加载时创建）。
function multipartReq(body: Record<string, string>, file: { name: string; type: string; content: string } | null, overridePath = "/api/studio") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.append(k, v);
  if (file) {
    fd.append("file", new Blob([file.content], { type: file.type }), file.name);
  }
  return new NextRequest(`http://localhost${overridePath}`, {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: fd,
  });
}
import fsEvidence from 'node:fs';
import {afterEach,afterAll} from 'vitest';
import {reserveStorageBytes,releaseStorageBytes,reconcileWorkspaceStorage,confirmStorageOperation,deleteDocumentsAndReleaseStorage} from '@/lib/storage-quota';
import {extractTextFromBufferWithTimeout as extractFixture} from '@/lib/text-extract';
vi.mock('@/lib/auth',()=>({validateUser:async()=>({valid:true,user:{id:'u1'}})}));
vi.mock('@/lib/workspace-readonly-guard',()=>({assertWorkspaceWritable:async()=>{}}));
vi.mock('@/lib/workspaceInit',()=>({ensureDefaultComponents:async()=>{}}));
vi.mock('@/lib/serverCache',()=>({clearServerCache:()=>{}}));
const evidence:any[]=[];
beforeEach(()=>{seedQuota({used:0n,limit:1000n});h.beforeUnlink=null;h.createDocFail=false;h.writeThenThrow=false;h.strictOpId=false;h.failOpCreate=false;h.failOpUpdate=false;h.missingOpDelegate=false;h.unlinkFail.clear();vi.mocked(extractFixture).mockReset().mockResolvedValue('synthetic parsed text');vi.stubEnv('STORAGE_DRIVER','local');});
afterEach(()=>vi.unstubAllEnvs());
const used=()=>h.tables.workspacequota.get('q1').storageUsed;
const ops=()=>[...(h.tables.storageoperation?.values()??[])];
const jsonReq=(body:any)=>new NextRequest('http://localhost/api/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:'w1',...body})});
async function run(body:any){const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(jsonReq(body),makeDeps());return {status:res.status,body:await res.json()};}
async function upload(action='upload_doc',workspaceId='w1'){const {runStudioPost}=await import('@/app/api/studio/handler');const res=await runStudioPost(multipartReq({action,title:'synthetic',visibility:'PRIVATE',workspaceId,...(action==='upload_knowledge_attachment'?{knowledgeId:'k1'}:{})},{name:'test.txt',type:'text/plain',content:'abc'}),makeDeps());return {status:res.status,body:await res.json()};}
function seedFile(id='d1',size=30,uploaderId='u1',rel='w1/'+id){h.tables.document.set(id,{id,workspaceId:'w1',title:id,status:'APPROVED',visibility:'PRIVATE',filePath:rel,fileSize:size,uploaderId,type:'doc'});const p=require('node:path').join(process.cwd(),'uploads','assets',rel);memFiles.set(p,Buffer.alloc(size));return p;}
describe('Independent current-version runtime evidence; reproduction PASS is not acceptance',()=>{
 it('second ordinary upload in a zero-quota space bypasses occupancy using empty operation ID',async()=>{const a=await upload();expect(a.status).toBe(200);h.tables.workspace.set('w2',{id:'w2',type:'PERSONAL',ownerId:'u1',name:'second'});h.tables.workspacequota.set('q2',{id:'q2',workspaceId:'w2',storageUsed:0n,storageLimit:0n});const b=await upload('upload_doc','w2');expect(b.status).toBe(200);expect(h.tables.workspacequota.get('q2').storageUsed).toBe(0n);expect(memFiles.size).toBe(2);expect(ops()).toHaveLength(1);expect(ops()[0].opId).toBe('');evidence.push({case:'empty op ID crosses workspace',first:a,second:b,w1Used:used(),w2Quota:h.tables.workspacequota.get('q2'),ops:ops(),documents:[...h.tables.document.values()]});});
 it('schema-required operation ID omitted after quota has already incremented',async()=>{h.strictOpId=true;await expect(reserveStorageBytes('w1',30,'strict')).rejects.toThrow('Argument id is missing');expect(used()).toBe(30n);expect(ops()).toHaveLength(0);evidence.push({case:'required schema id missing',used:used(),operations:ops(),writes:h.writes,limit:'Fixture enforces actual schema required id, not an actual Prisma/DB connection'});});
 it('operation persistence failure leaves an untracked reservation',async()=>{h.failOpCreate=true;await expect(reserveStorageBytes('w1',30,'failure')).rejects.toThrow('operation create failed');expect(used()).toBe(30n);expect(ops()).toHaveLength(0);evidence.push({case:'operation insert fails after increment',used:used(),operations:ops(),writes:h.writes});});
 it('concurrent same-operation requests increment twice despite unique opId constraint',async()=>{const results=await Promise.all([reserveStorageBytes('w1',30,'same'),reserveStorageBytes('w1',30,'same')]);expect(used()).toBe(60n);expect(ops()).toHaveLength(1);evidence.push({case:'concurrent same operation',results,used:used(),operations:ops()});});
 it('ordinary doc create failure cleans bytes but leaves stale reservation state',async()=>{h.createDocFail=true;const r=await upload();expect(r.status).toBe(500);expect(used()).toBe(0n);expect(memFiles.size).toBe(0);expect(ops()[0].status).toBe('RESERVED');evidence.push({case:'ordinary failure stale operation',...r,used:used(),operations:ops()});});
 it('attachment doc creation failure still escapes cleanup',async()=>{h.tables.document.set('k1',{id:'k1',workspaceId:'w1',type:'knowledge',status:'APPROVED',uploaderId:'u1'});h.createDocFail=true;const r=await upload('upload_knowledge_attachment');expect(r.status).toBe(500);expect(used()).toBe(3n);expect(memFiles.size).toBe(1);expect(ops()[0].filePath).toBeUndefined();evidence.push({case:'attachment DB failure',...r,used:used(),objects:[...memFiles.keys()],operations:ops()});});
 it('unknown save outcome still frees occupied bytes',async()=>{h.writeThenThrow=true;const r=await upload();expect(r.status).toBe(500);expect(used()).toBe(0n);expect(memFiles.size).toBe(1);expect(ops()[0].status).toBe('RESERVED');evidence.push({case:'unknown save result',...r,used:used(),objects:[...memFiles.keys()],operations:ops()});});
 it('confirmation failure is swallowed',async()=>{await reserveStorageBytes('w1',3,'confirm');h.failOpUpdate=true;await expect(confirmStorageOperation('confirm','w1/file','doc')).resolves.toBeUndefined();expect(ops()[0].status).toBe('RESERVED');evidence.push({case:'confirmation swallowed',operations:ops()});});
 it('missing generated model delegate produces 500 rather than stable readiness response',async()=>{h.missingOpDelegate=true;const r=await upload();expect(r.status).toBe(500);expect(r.body.code).not.toBe('STORAGE_QUOTA_NOT_READY');evidence.push({case:'missing operation model',...r,used:used(),objects:memFiles.size});});
 it('real same-object concurrent deletion remains wired to separate release and deletion',async()=>{seedFile();seedFile('other',70);h.tables.workspacequota.get('q1').storageUsed=100n;let count=0,release:any;const barrier=new Promise<void>(r=>release=r);h.setRawGate(async sql=>{if(sql.includes('storageUsed` = `storageUsed` -')){if(++count===2)release();await barrier;}});const results=await Promise.all([run({action:'remove_asset',assetId:'d1',reasonCode:'VIOLATION'}),run({action:'remove_asset',assetId:'d1',reasonCode:'VIOLATION'})]);expect(used()).toBe(40n);evidence.push({case:'real deletion duplicate release',results,used:used(),remainingOtherBytes:70});});
 it('new unused transaction helper also counts already-missing input documents',async()=>{seedFile('present',40);seedFile('other',60);h.tables.workspacequota.get('q1').storageUsed=100n;const result=await deleteDocumentsAndReleaseStorage('w1',[{id:'gone',filePath:'w1/gone',fileSize:30},{id:'present',filePath:'w1/present',fileSize:40}]);expect(used()).toBe(30n);expect(h.tables.document.has('other')).toBe(true);evidence.push({case:'transaction helper stale input',result,used:used(),expected:60,remainingDocs:[...h.tables.document.keys()]});});
 it('deleting one reference destroys an object still referenced by another document',async()=>{seedFile('one',30,'u1','w1/shared');seedFile('two',30,'u1','w1/shared');h.tables.workspacequota.get('q1').storageUsed=30n;const r=await run({action:'remove_asset',assetId:'one',reasonCode:'VIOLATION'});expect(r.status).toBe(200);expect(h.tables.document.has('two')).toBe(true);expect(memFiles.size).toBe(0);expect(used()).toBe(0n);evidence.push({case:'remaining reference loses object',...r,used:used(),remainingDoc:h.tables.document.get('two'),objects:0});});
 it('clear-data failure still erases the failed object record',async()=>{const p=seedFile();h.tables.workspacequota.get('q1').storageUsed=30n;h.unlinkFail.add(p);const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));expect(res.status).toBe(200);expect(h.tables.document.size).toBe(0);expect(memFiles.size).toBe(1);evidence.push({case:'clear failed object',status:res.status,used:used(),objects:1,documents:0});});
 it('clear-data still removes an upload completed after scan',async()=>{seedFile();h.tables.workspacequota.get('q1').storageUsed=30n;h.beforeUnlink=async()=>{h.beforeUnlink=null;const r=await upload();expect(r.status).toBe(200);};const {POST}=await import('@/app/api/workspace/clear-data/route');const res=await POST(jsonReq({confirmText:'确认删除'}));expect(res.status).toBe(200);expect(h.tables.document.size).toBe(0);expect(memFiles.size).toBe(1);evidence.push({case:'clear concurrent upload',status:res.status,used:used(),objects:[...memFiles.keys()],documents:0});});
 it('PRIVATE batch ownership is fixed, positive acceptance',async()=>{seedFile('private',30,'u2');h.tables.workspacequota.get('q1').storageUsed=30n;const r=await run({action:'batch_delete_assets',assetIds:['private']});expect(r.status).toBe(207);expect(h.tables.document.has('private')).toBe(true);expect(used()).toBe(30n);expect(memFiles.size).toBe(1);evidence.push({case:'PRIVATE ownership fixed',accepted:true,...r,used:used(),objects:1});});
 it('limit tightening fixed but a read-to-write invalid usage still enters arithmetic',async()=>{h.setRawGate(async()=>{h.tables.workspacequota.get('q1').storageUsed=-10n;h.setRawGate(null);});await reserveStorageBytes('w1',5,'negative');expect(used()).toBe(-5n);evidence.push({case:'negative usage after read',used:used(),operations:ops()});});
 it('actual read-to-write -1 to zero tightening is rejected, positive acceptance',async()=>{h.tables.workspacequota.get('q1').storageLimit=-1n;h.setRawGate(async()=>{h.tables.workspacequota.get('q1').storageLimit=0n;h.setRawGate(null);});await expect(reserveStorageBytes('w1',60,'tightening')).rejects.toMatchObject({code:'STORAGE_LIMIT_ZERO'});expect(used()).toBe(0n);evidence.push({case:'limit tightening fixed',accepted:true,used:used(),limit:0});});
 it('ordinary upload parses once and invalid workspace does not parse, positive acceptance',async()=>{const r=await upload();expect(r.status).toBe(200);expect(extractFixture).toHaveBeenCalledTimes(1);vi.mocked(extractFixture).mockClear();const missing=await upload('upload_doc','missing');expect(missing.status).toBe(404);expect(extractFixture).not.toHaveBeenCalled();evidence.push({case:'parse order fixed',accepted:true,normalCalls:1,missingWorkspaceCalls:0});});
 it('object identity lowercases distinct case-sensitive keys',async()=>{const r=await reconcileWorkspaceStorage('w1',{quotaRow:{storageUsed:60n,storageLimit:100n},docRows:[{id:'a',filePath:'w1/A.txt',fileSize:30},{id:'b',filePath:'w1/a.txt',fileSize:30}]});expect(r.docs.uniqueObjects).toBe(1);expect(r.docs.physicalBytesSum).toBe('30');evidence.push({case:'case-sensitive identity merged',report:r});});
 it('empty document set hides nonzero drift, and list-only inventory is ignored',async()=>{let inventoryCalls=0;const r=await reconcileWorkspaceStorage('w1',{quotaRow:{storageUsed:30n,storageLimit:100n},docRows:[],listObjects:async()=>{inventoryCalls++;return [{key:'w1/orphan',size:30}];}});expect(r.usageDrift).toBeNull();expect(inventoryCalls).toBe(0);expect(r.coverage.objectListProvided).toBe(true);evidence.push({case:'zero docs / inventory coverage',report:r,inventoryCalls});});
});
afterAll(()=>fsEvidence.writeFileSync('docs/reviews/R0-J1-independent-review/handler-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),evidence,limits:'Actual handlers/services; offline Prisma/fs/parse mocks. Operation unique constraint enforced; required id enforced only in dedicated schema-contract case, auto-id permissive fixtures used for other independent defects. No real DB/Prisma connection or external storage. One positive ownership acceptance.'},(_,v)=>typeof v==='bigint'?v.toString():v,2)));
