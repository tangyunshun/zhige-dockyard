// Current evidence for original proposal F07 only. No real Prisma, payments, models or notifications.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const hashes = {};
function read(file) {
  const bytes = fs.readFileSync(file);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  return bytes.toString('utf8');
}
function load(file, stubs) {
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, crypto, Date, Error, Headers, Response,
    process: { env: {} }, console: { error() {}, warn() {}, log() {} },
    require(name) { if (Object.hasOwn(stubs,name)) return stubs[name]; throw new Error('Dependency denied ' + name); },
  }, { filename: file });
  return exports;
}
const clone = value => structuredClone(value);
function setup({ scope = 'WORKSPACE', automaticallyRefunded = false, allowed = true } = {}) {
  const s = { requests: [], wallet: scope === 'WALLET' && automaticallyRefunded ? 100n : 0n,
    pool: scope === 'WORKSPACE' && automaticallyRefunded ? 100n : 0n,
    grants: [{ id: 'source', scope, userId: 'u1', workspaceId: scope === 'WORKSPACE' ? 'w1' : null,
      remaining: automaticallyRefunded ? 100n : 0n }],
    ledger: [{ id: 'consume', direction: 'OUT', type: 'CONSUME', userId: 'u1', taskId: 't1', workspaceId: 'w1', scope,
      points: 100n, grantId: 'source', componentId: null, idempotencyKey: 'TASK:t1#1' }], writes: [], requestedPermissions: [], notifications: [] };
  if (automaticallyRefunded) s.ledger.push({ id: 'auto-refund', direction: 'IN', type: 'REFUND', userId: 'u1', taskId: 't1',
    workspaceId: 'w1', scope, points: 100n, grantId: 'source', idempotencyKey: 'REFUND_MODEL_FAILURE:t1:0' });
  function client(kind) {
    const log = (table, method) => s.writes.push({ kind, table, method });
    return {
      pointledger: {
        findMany: async ({ where }) => clone(s.ledger.filter(row => Object.entries(where).every(([k,v]) => row[k] === v))),
        findFirst: async ({ where }) => clone(s.ledger.find(row => row.idempotencyKey?.startsWith(where.idempotencyKey.startsWith)) ?? null),
        create: async ({ data }) => { log('pointledger','create'); s.ledger.push(clone(data)); return clone(data); },
      },
      pointgrant: { create: async ({ data }) => { log('pointgrant','create'); s.grants.push(clone(data)); return clone(data); } },
      userwallet: { upsert: async ({ create, update }) => { log('userwallet','upsert');
        s.wallet = s.wallet === 0n ? create.balance : s.wallet + update.balance.increment; return { balance: s.wallet }; } },
      refundrequest: {
        findFirst: async ({ where }) => clone(s.requests.find(row => Object.entries(where).every(([k,v]) => row[k] === v)) ?? null),
        findUnique: async ({ where }) => clone(s.requests.find(row => row.id === where.id) ?? null),
        create: async ({ data }) => { log('refundrequest','create'); s.requests.push(clone(data)); return clone(data); },
        update: async ({ where, data }) => { log('refundrequest','update'); const row=s.requests.find(r=>r.id===where.id); Object.assign(row,clone(data)); return clone(row); },
      },
      componenttask: { findUnique: async () => ({ id:'t1', name:'fixture task' }) },
      componentcatalog: { findUnique: async () => null },
      user: { findMany: async () => [] },
    };
  }
  const prisma = { ...client('ROOT'), $transaction: async fn => {
    const before = clone(s);
    try { return await fn(client('TX')); } catch(e) { Object.assign(s,before); throw e; }
  } };
  const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body),init) } };
  const notices = { addNotification: async (...args) => { s.notifications.push(args); } };
  const credit = load('src/lib/credit-service.ts', { '@/lib/prisma': { prisma }, '@prisma/client': { Prisma:{} },
    '@/lib/notifications-store': notices, '@/lib/workspace-readonly-guard': { assertWorkspaceWritable:async()=>{} },
    '@/lib/register-gift-config': {}, '@/lib/points-notifications': {} });
  const user = load('src/app/api/user/refund-requests/route.ts', { 'next/server':next, crypto,
    '@/lib/prisma':{ prisma }, '@/lib/auth':{ validateUser:async()=>({valid:true,user:{id:'u1',name:'fixture'}}) },
    '@/lib/notifications-store':notices, '@/lib/role-utils':{ ADMIN_ROLE_VALUES:['ADMIN'] } });
  const admin = load('src/app/api/admin/refund-requests/[id]/resolve/route.ts', { 'next/server':next,
    '@/lib/prisma':{ prisma }, '@/lib/credit-service':credit, '@/lib/notifications-store':notices,
    '@/lib/security':{ requirePlatformPermission:async(_request,key)=>{
      s.requestedPermissions.push(key); return allowed ? { authorized:true,user:{id:'read-only-admin'} } :
        {authorized:false,errorResponse:new Response(JSON.stringify({error:'denied'}),{status:403})}; },
      writeAuditLog:async()=>{} },
  });
  return { s,user,admin };
}
const req = body => ({ headers:new Headers(), json:async()=>body });
async function main() {
  const observations=[];
  for(const options of [{scope:'WORKSPACE',automaticallyRefunded:false},{scope:'WORKSPACE',automaticallyRefunded:true},{scope:'WALLET',automaticallyRefunded:true}]) {
    const c=setup(options), initial={ wallet:c.s.wallet, pool:c.s.pool, originalRefunded: options.automaticallyRefunded ? 100:0 };
    const submitted=await c.user.POST(req({taskId:'t1',reason:'fixture reason for audit'}));
    const submission=await submitted.json(); assert.equal(submitted.status,200); assert.equal(submission.data.points,100);
    const response=await c.admin.POST(req({action:'APPROVE'}),{params:Promise.resolve({id:submission.data.id})});
    const approval=await response.json(); assert.equal(response.status,200); assert.equal(approval.data.status,'APPROVED');
    assert.deepEqual(c.s.requestedPermissions,['order:read']);
    assert.equal(c.s.wallet,initial.wallet+100n);
    observations.push({ options, initial, userPostStatus:submitted.status, requestedPoints:submission.data.points,
      adminPostStatus:response.status, requiredPermission:c.s.requestedPermissions,
      finalWallet:c.s.wallet, finalPool:c.s.pool, newGrant:c.s.grants[1],
      taskRefundLedgerSum:c.s.ledger.filter(r=>r.type==='REFUND'&&r.taskId==='t1').reduce((a,r)=>a+r.points,0n),
      writes:c.s.writes, requestStatus:c.s.requests[0].status });
  }
  const denied=setup({allowed:false});
  const deniedResponse=await denied.admin.POST(req({action:'APPROVE'}),{params:Promise.resolve({id:'not-readable'})});
  assert.equal(deniedResponse.status,403); assert.equal(denied.s.writes.length,0);
  for(const file of ['src/app/api/admin/permissions/route.ts','src/app/admin/finance/refund-requests/page.tsx',
    'src/components/UserRefundRequests.tsx','src/app/api/admin/refund-requests/route.ts']) read(file);
  const evidence={ capturedAt:new Date().toISOString(), originalIssue:'F07 manual refunds + original write permission requirement',
    observations, permissionDeniedControl:{status:deniedResponse.status,writes:denied.s.writes},
    isolation:'Actual user POST, actual manual resolve POST and actual grantPoints loaded with closed memory persistence, authentication/permission, notification/audit IO fixtures. No DB, model, payment or external messaging.',
    limits:'Permission fixture grants only the key requested by route; this proves route asks order:read, not actual deployed RBAC/middleware state. Refund ledger and prior automatic refund are synthetic, not production balance or loss evidence. Does not execute or modify automatic refund engine.',sha256:hashes };
  fs.writeFileSync('docs/reviews/R0-C-independent-review/next-refund-verification.json',JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2));
  console.log(JSON.stringify({originalIssue:evidence.originalIssue,cases:observations.map(r=>({options:r.options,requestedPoints:r.requestedPoints,
    requiredPermission:r.requiredPermission,finalWallet:String(r.finalWallet),taskRefundLedgerSum:String(r.taskRefundLedgerSum)})),deniedStatus:deniedResponse.status},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
