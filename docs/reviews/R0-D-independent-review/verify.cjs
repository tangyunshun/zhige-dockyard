// Current evidence for original proposal F07 only. No real Prisma, payments, models or notifications.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-D-independent-review';
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
function setup({ scope = 'WORKSPACE', automaticallyRefunded = false, allowed = true, authenticated = true, grantedKeys = ['order:refund_approve'] } = {}) {
  const s = { requests: [], wallet: scope === 'WALLET' && automaticallyRefunded ? 100n : 0n,
    pool: scope === 'WORKSPACE' && automaticallyRefunded ? 100n : 0n,
    grants: [{ id: 'source', scope, userId: 'u1', workspaceId: scope === 'WORKSPACE' ? 'w1' : null,
      remaining: automaticallyRefunded ? 100n : 0n }],
    ledger: [{ id: 'consume', direction: 'OUT', type: 'CONSUME', userId: 'u1', taskId: 't1', workspaceId: 'w1', scope,
      points: 100n, grantId: 'source', componentId: null, idempotencyKey: 'TASK:t1#1' }], writes: [], requestedPermissions: [], notifications: [], requestReads: 0 };
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
  prisma.refundrequest.findUnique = async ({where}) => { s.requestReads++; return clone(s.requests.find(r=>r.id===where.id) ?? null); };
  prisma.refundrequest.findMany = async ({where}={}) => clone(s.requests.filter(r=>Object.entries(where||{}).every(([k,v])=>r[k]===v)));
  prisma.refundrequest.updateMany = async ({where,data}) => {
    s.writes.push({kind:'ROOT',table:'refundrequest',method:'updateMany',where:clone(where)});
    const rows=s.requests.filter(r=>Object.entries(where).every(([k,v])=>r[k]===v));
    for(const row of rows) Object.assign(row,clone(data)); return {count:rows.length};
  };
  prisma.refundrequest.delete = async ({where}) => {
    s.writes.push({kind:'ROOT',table:'refundrequest',method:'delete'});
    const row=s.requests.find(r=>r.id===where.id);s.requests=s.requests.filter(r=>r.id!==where.id);return clone(row);
  };
  prisma.pointledger.findMany = async ({where}) => clone(s.ledger.filter(r=>Object.entries(where).every(([k,v])=>
    v && typeof v==='object' && 'not' in v ? r[k]!==v.not : r[k]===v)));
  prisma.componenttask.findMany = async () => [{id:'t1',name:'fixture',type:'C01',status:'FAILED',workspaceId:'w1'}];
  prisma.componentcatalog.findMany = async () => [];
  prisma.workspace = {findMany:async()=>[{id:'w1',name:'fixture',type:'ENTERPRISE'}]};
  prisma.user.findMany = async ({where}={}) => where?.id ? [{id:'u1',name:'fixture',email:'u1@example.test'}] : [];
  const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body),init) } };
  const notices = { addNotification: async (...args) => { s.notifications.push(args); } };
  const credit = load('src/lib/credit-service.ts', { '@/lib/prisma': { prisma }, '@prisma/client': { Prisma:{} },
    '@/lib/notifications-store': notices, '@/lib/workspace-readonly-guard': { assertWorkspaceWritable:async()=>{} },
    '@/lib/register-gift-config': {}, '@/lib/points-notifications': {} });
  const user = load('src/app/api/user/refund-requests/route.ts', { 'next/server':next, crypto,
    '@/lib/prisma':{ prisma }, '@/lib/auth':{ validateUser:async()=>authenticated ? ({valid:true,user:{id:'u1',name:'fixture'}}) : ({valid:false}) },
    '@/lib/notifications-store':notices, '@/lib/role-utils':{ ADMIN_ROLE_VALUES:['ADMIN'] } });
  const admin = load('src/app/api/admin/refund-requests/[id]/resolve/route.ts', { 'next/server':next,
    '@/lib/prisma':{ prisma }, '@/lib/credit-service':credit, '@/lib/notifications-store':notices,
    '@/lib/security':{ requirePlatformPermission:async(_request,key)=>{
      s.requestedPermissions.push(key);
      if(!authenticated) return {authorized:false,errorResponse:new Response(JSON.stringify({error:'unauthorized'}),{status:401})};
      return allowed && grantedKeys.includes(key) ? { authorized:true,user:{id:'fixture-admin'} } :
        {authorized:false,errorResponse:new Response(JSON.stringify({error:'denied'}),{status:403})}; },
      writeAuditLog:async()=>{} },
  });
  const listing = load('src/app/api/admin/refund-requests/route.ts', {'next/server':next,'@/lib/prisma':{prisma},
    '@/lib/security':{requirePlatformPermission:async(_r,key)=>{
      s.requestedPermissions.push(key);
      if(!authenticated) return {authorized:false,errorResponse:new Response('{}',{status:401})};
      return grantedKeys.includes(key) ? {authorized:true,user:{id:'fixture-admin'}} :
        {authorized:false,errorResponse:new Response('{}',{status:403})};
    }}});
  return { s,user,admin,listing };
}
const req = body => ({ headers:new Headers(), json:async()=>body });

const seed = c => c.s.requests.push({id:'rr1',taskId:'t1',userId:'u1',workspaceId:'w1',componentId:null,
  points:100,reason:'fixture reason',status:'PENDING',refundLedgerId:null});
const params = id => ({params:Promise.resolve({id})});
function asset(c) { return clone({wallet:c.s.wallet,pool:c.s.pool,grants:c.s.grants,ledger:c.s.ledger,requests:c.s.requests}); }
async function main() {
  const cases=[];
  for(const action of ['APPROVE','REJECT']) {
    const c=setup({grantedKeys:['order:read']});seed(c);
    const before=asset(c),res=await c.admin.POST(req({action,remark:'valid reason'}),params('rr1'));
    assert.equal(res.status,403);assert.deepEqual(c.s.requestedPermissions,['order:refund_approve']);
    assert.equal(c.s.requestReads,0);assert.equal(c.s.writes.length,0);assert.deepEqual(asset(c),before);
    cases.push({id:'D01',action,status:res.status,requestedKeys:c.s.requestedPermissions,requestReads:c.s.requestReads,writes:c.s.writes});
  }
  const anon=setup({authenticated:false});seed(anon);
  const anonResult=await anon.admin.POST(req({action:'APPROVE'}),params('rr1'));
  assert.equal(anonResult.status,401);assert.equal(anon.s.requestReads,0);
  cases.push({id:'D01_unauthorized',status:anonResult.status,writes:anon.s.writes});
  for(const options of [{scope:'WALLET'},{scope:'WORKSPACE'},{scope:'WORKSPACE',automaticallyRefunded:true},{scope:'WALLET',automaticallyRefunded:true},{scope:'PERSONAL_GIFT'}]) {
    const c=setup(options);seed(c);const before=asset(c);
    const results=await Promise.all(Array.from({length:8},()=>c.admin.POST(req({action:'APPROVE'}),params('rr1'))));
    for(const res of results) { const body=await res.json();assert.equal(res.status,409);assert.equal(body.success,false);
      assert.equal(body.code,'MANUAL_REFUND_APPROVAL_PAUSED');assert.equal(body.refunded,undefined); }
    assert.equal(c.s.writes.length,0);assert.equal(c.s.requestReads,0);assert.equal(c.s.notifications.length,0);
    assert.deepEqual(asset(c),before);
    cases.push({id:'D02_D03_D04',options,parallelRequests:results.length,writes:c.s.writes,requestReads:c.s.requestReads,assets:before});
  }
  const reject=setup();seed(reject);const initialFunds=clone({wallet:reject.s.wallet,pool:reject.s.pool,grants:reject.s.grants,ledger:reject.s.ledger});
  const rejects=await Promise.all(Array.from({length:4},()=>reject.admin.POST(req({action:'REJECT',remark:'fixture valid reason'}),params('rr1'))));
  assert.equal(rejects.filter(r=>r.status===200).length,1);assert.equal(rejects.filter(r=>r.status===409).length,3);
  assert.equal(reject.s.requests[0].status,'REJECTED');assert.equal(reject.s.notifications.length,1);
  assert.ok(reject.s.writes.every(w=>w.table==='refundrequest'));
  assert.deepEqual({wallet:reject.s.wallet,pool:reject.s.pool,grants:reject.s.grants,ledger:reject.s.ledger},initialFunds);
  cases.push({id:'D05',statuses:rejects.map(r=>r.status),status:reject.s.requests[0].status,writes:reject.s.writes});
  const flow=setup({grantedKeys:['order:read','billing:export']});
  const created=await flow.user.POST(req({taskId:'t1',reason:'fixture review request'}));const newReq=await created.json();assert.equal(created.status,200);
  flow.s.writes=[];flow.s.notifications=[];
  const query=await flow.user.GET({headers:new Headers(),nextUrl:new URL('http://isolated/api/user/refund-requests')});
  const data=await query.json();assert.equal(query.status,200);assert.equal(data.capabilities.manualApprovalPaused,true);
  assert.equal(data.capabilities.pointsAreReferenceOnly,true);assert.equal(data.data.requests.length,1);assert.equal(flow.s.writes.length,0);
  const adminQuery=await flow.listing.GET({headers:new Headers(),nextUrl:new URL('http://isolated/?status=ALL&export=1')});
  const adminData=await adminQuery.json();assert.equal(adminQuery.status,200);assert.equal(adminData.capabilities.manualApprovalPaused,true);
  assert.deepEqual(flow.s.requestedPermissions,['order:read','billing:export']);assert.equal(flow.s.writes.length,0);
  const deleted=await flow.user.DELETE({headers:new Headers(),nextUrl:new URL('http://isolated/?id='+newReq.data.id)});
  assert.equal(deleted.status,200);assert.equal(flow.s.requests.length,0);assert.equal(flow.s.wallet,0n);
  assert.ok(flow.s.writes.every(w=>w.table==='refundrequest'));
  cases.push({id:'D06',userGet:query.status,adminGet:adminQuery.status,withdraw:deleted.status,capabilities:data.capabilities,writes:flow.s.writes});
  const manifest=JSON.parse(read('docs/reviews/R0-D-fix-snapshot/manifest.json'));
  const previous=JSON.parse(read('docs/reviews/R0-C-independent-review/next-refund-verification.json'));
  const snapshots=manifest.files.map(entry=>{
    const name=entry.path.replaceAll('/','__')+'.frozen',start='docs/reviews/R0-D-fix-snapshot/frozen-source/'+name,
      end='docs/reviews/R0-D-fix-snapshot/end-source/'+name;
    read(start);read(end);read(entry.path);
    return {file:entry.path,startMatchesPrior:hashes[start]===previous.sha256[entry.path],startMatchesManifest:hashes[start]===entry.startSha256,
      endMatchesManifest:hashes[end]===entry.endSha256,currentMatchesEnd:hashes[entry.path]===entry.endSha256};
  });
  assert.ok(snapshots.every(r=>Object.entries(r).every(([k,v])=>k==='file'||v)));
  const frozen=JSON.parse(read('docs/reviews/R0-C-independent-review/verification.json'));
  const protectedFiles=['src/lib/credit-service.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/payment/fulfill.ts',
    'src/lib/payment-cashier-display.ts','src/lib/order-expiry.ts'];
  const protectedChecks=protectedFiles.map(file=>{read(file);return {file,unchanged:hashes[file]===frozen.sha256[file]};});
  assert.ok(protectedChecks.every(r=>r.unchanged));
  for(const file of ['src/app/api/__tests__/r0d-refund-approval.test.ts','docs/reviews/R0-D-fix-report.md',
    'docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs'])read(file);
  const evidence={capturedAt:new Date().toISOString(),verdict:'PASS bounded R0-D stop-loss; freeze batch',cases,snapshots,protectedChecks,
    isolation:'Actual resolve POST, user GET/POST/DELETE, admin GET; full unchanged credit-service available as real dependency. Closed persistence, identity/permission and notification/audit IO fixtures. No actual business data, money or source swapping.',
    limits:'Controlled permission keys, not deployed RBAC. In-memory conditional updates are not MySQL concurrency proof. Page checks run separately in VM, not browser DOM. Full refund engine remains outside this stop-loss acceptance.',sha256:hashes};
  fs.writeFileSync(dir+'/verification.json',JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2));
  console.log(JSON.stringify({verdict:evidence.verdict,caseGroups:cases.length,snapshotPairs:snapshots.length,protectedFiles:protectedChecks.length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

