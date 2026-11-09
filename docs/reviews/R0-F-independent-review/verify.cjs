// Independent R0-F review: actual route/helper, closed in-memory IO; no .env, DB or network.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const OUT = 'docs/reviews/R0-F-independent-review';
const hashes = {}, cases = [], findings = [];
const copy = x => structuredClone(x);
function read(p) { const b = fs.readFileSync(p); hashes[p] = crypto.createHash('sha256').update(b).digest('hex'); return b.toString('utf8'); }
function load(p, stubs) {
  const exports = {};
  const js = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { exports, Date, Error, Response, Headers, Math, console: { log(){}, error(){}, warn(){} }, process: { env: {} },
    require(n) { if (Object.hasOwn(stubs, n)) return stubs[n]; throw Error('DEPENDENCY_DENIED '+n); } }, { filename: p });
  return exports;
}
const ADMIN = ['ADMIN','PLATFORM_ADMIN','SUPER_ADMIN','SUPERADMIN','superadmin','super_admin'];
const seed = () => ({ config: {
  maintenance_mode: 'false', maintenance_message: 'old message', maintenance_estimated: '30', system_version: 'v1.0.0',
  SYSTEM_RELEASE_NOTES_V1: JSON.stringify([{id:'r1',title:'Release',version:'v1.1.0',isPublished:true},{id:'rel-20260908-01',version:'v0',isPublished:true}]),
  SYSTEM_MAINTENANCE_SCHEDULES_V1: JSON.stringify([{id:'s1',title:'Schedule',startTime:'2026-12-01 00:00',status:'SCHEDULED'},{id:'maint-20260920-01',title:'legacy'}]),
  SYSTEM_UPDATE_SETTINGS_V1: JSON.stringify({popupTitle:'old title',forceUpdate:false}),
}, users: [{id:'ordinary',role:'MEMBER',sessionToken:'fixture-session',refreshToken:'fixture-refresh'},
  {id:'admin',role:'PLATFORM_ADMIN',sessionToken:'fixture-admin'}], logs: [] });
function setup({fault={}, legacy=false}={}) {
  const s = { data: seed(), events: [], auth: [], fault, count: 0, afterWrites: null };
  function client(get, scope) {
    function event(method, key, write=false) { s.events.push({scope,method,key,write}); if(write && scope==='ROOT') throw Error('ROOT_WRITE'); }
    const config = {
      async findUnique({where}) { event('findUnique',where.key); if(s.fault.read===where.key) throw Error('READ_FAIL'); const d=get(); return Object.hasOwn(d.config,where.key)?{key:where.key,value:d.config[where.key]}:null; },
      async upsert({where,create,update}) { event('upsert',where.key,true); if(++s.count===s.fault.configAt) throw Error('CONFIG_FAIL'); const d=get(); d.config[where.key]=Object.hasOwn(d.config,where.key)?update.value:create.value; return {key:where.key,value:d.config[where.key]}; },
      async update({where,data}) { event('update',where.key,true); get().config[where.key]=data.value; return {key:where.key,value:data.value}; },
    };
    return {systemconfig:config, user:{async updateMany({where,data}) {
      event('user.updateMany',null,true); let count=0;
      for(const u of get().users) if(!where.role.notIn.includes(u.role) && u.sessionToken!==null) {Object.assign(u,data); count++;}
      return {count};
    }}, operationlog:{async create({data}) { event('operationlog.create',null,true); if(s.fault.audit) throw Error('AUDIT_FAIL'); const row=JSON.parse(JSON.stringify({...data,createdAt:new Date().toISOString()}));get().logs.push(row);return row;} }};
  }
  const prisma = { ...client(()=>s.data,'ROOT'), async $transaction(fn) {
    const draft=copy(s.data);s.events.push({method:'begin'});
    try { const result=await fn(client(()=>draft,'TX'));s.afterWrites=copy(draft);
      if(s.fault.commit) throw Error('COMMIT_FAIL');s.data=draft;s.events.push({method:'commit'});return result;
    } catch(e) {s.events.push({method:'rollback'});throw e;}
  }};
  const grants={normal:[],roleOnly:[],read:['maintenance:read','system:read'],toggle:['system:maintenance_toggle'],publish:['maintenance:publish'],both:['system:maintenance_toggle','maintenance:publish'],super:[]};
  const security={async requirePlatformPermission(req,...keys) {
    const token=(req.headers.get('authorization')||'').replace('Bearer ','');s.auth.push({token,keys});
    if(!Object.hasOwn(grants,token)) return {authorized:false,errorResponse:new Response(JSON.stringify({error:'UNAUTHORIZED'}),{status:401})};
    if(token==='super'||keys.some(k=>grants[token].includes(k))) return {authorized:true,user:{id:token,name:token,role:token==='normal'?'MEMBER':'PLATFORM_ADMIN'}};
    return {authorized:false,errorResponse:new Response(JSON.stringify({error:'FORBIDDEN',required:keys}),{status:403})};
  }};
  const prefix=legacy?'docs/reviews/R0-F-fix-snapshot/frozen-source/':null;
  const helperFile=legacy?prefix+'src__lib__maintenance.ts.frozen':'src/lib/maintenance.ts';
  const routeFile=legacy?prefix+'src__app__api__system__maintenance__route.ts.frozen':'src/app/api/system/maintenance/route.ts';
  const maintenance=load(helperFile,{'@/lib/prisma':{prisma}});
  const route=load(routeFile,{'@/lib/prisma':{prisma},'@/lib/maintenance':maintenance,'@/lib/security':security,
    '@/lib/auth':{validateUser:async()=>({valid:false}),isAdminRole:()=>false},'@/lib/role-utils':{ADMIN_ROLE_VALUES:ADMIN},
    'next/server':{NextResponse:{json:(b,i)=>new Response(JSON.stringify(b),i)}},'../../../../../package.json':{version:JSON.parse(read('package.json')).version}});
  return {s,maintenance,async call(method='GET',body,token,query='') {
    const req={headers:new Headers(token?{authorization:'Bearer '+token}:{}),nextUrl:new URL('http://isolated/api/system/maintenance'+query),json:async()=>body};
    const r=await route[method](req);return {status:r.status,body:await r.json()};
  }};
}
function writes(c) {return c.s.events.filter(e=>e.write);}
function record(name,c,r,extra={}) {cases.push({name,status:r.status,...extra,events:copy(c.s.events),auth:copy(c.s.auth)});}
const bodies={
  toggle:{enabled:true,message:'new message',estimatedMinutes:45},
  create_schedule:{action:'create_schedule',schedule:{title:'New schedule',startTime:'2026-12-02 00:00'}},
  update_schedule:{action:'update_schedule',schedule:{id:'s1',title:'Changed',startTime:'2026-12-01 00:00',status:'SCHEDULED'}},
  delete_schedule:{action:'delete_schedule',scheduleId:'s1'},
  create_release:{action:'create_release',release:{title:'New release',version:'v2.0.0'}},
  update_release:{action:'update_release',release:{id:'r1',title:'Changed release',version:'v1.1.1'}},
  delete_release:{action:'delete_release',releaseId:'r1'},
  toggle_release_publish:{action:'toggle_release_publish',releaseId:'r1',isPublished:false},
  save_update_settings:{action:'save_update_settings',settings:{popupTitle:'new title',forceUpdate:true}},
};
async function main() {
  // Old counterexample executes frozen files, never replaces current business source.
  {const c=setup({legacy:true});c.s.data.config.maintenance_mode='true';
    const r=await c.call('GET',null,null,'?action=emergency_disable');assert.equal(r.status,500);
    // ROOT write is deliberately blocked by fixture, proving the old route attempts persistence.
    assert.ok(writes(c).some(e=>e.scope==='ROOT'));record('old_GET_attempts_root_write_blocked_by_fixture',c,r);}
  for(const token of [null,'normal','read','super']) for(const query of ['', '?t=1&t=2','?action=emergency_disable']) {
    const c=setup(), before=copy(c.s.data);const r=await c.call('GET',null,token,query);
    assert.equal(r.status,query.includes('emergency_disable')?400:200);assert.deepEqual(c.s.data,before);assert.equal(writes(c).length,0);assert.equal(c.s.auth.length,0);
    record('GET_readonly',c,r,{token,query});
  }
  for(const condition of ['empty','readFailure']) {const c=setup({fault:condition==='readFailure'?{read:'SYSTEM_RELEASE_NOTES_V1'}:{}});if(condition==='empty') c.s.data.config={};
    const before=copy(c.s.data),r=await c.call();assert.equal(r.status,200);assert.deepEqual(c.s.data,before);assert.equal(writes(c).length,0);record('GET_'+condition,c,r);}
  for(const token of [null,'normal','roleOnly','read']) for(const [name,body] of Object.entries(bodies).concat([['DELETE',undefined]])) {
    const c=setup(),before=copy(c.s.data);const r=await c.call(name==='DELETE'?'DELETE':'POST',body,token);
    assert.equal(r.status,token===null?401:403);assert.equal(writes(c).length,0);assert.deepEqual(c.s.data,before);record('denied_'+name,c,r,{token});
  }
  for(const token of ['toggle','publish','both','super']) for(const [name,body] of Object.entries(bodies).concat([['DELETE',undefined]])) {
    const c=setup();const toggle=name==='toggle'||name==='DELETE',allow=token==='super'||token==='both'||(toggle?token==='toggle':token==='publish');
    const r=await c.call(name==='DELETE'?'DELETE':'POST',body,token);assert.equal(r.status,allow?200:403);
    if(allow) {assert.equal(c.s.data.logs.length,1);assert.ok(writes(c).every(e=>e.scope==='TX'));}
    else assert.equal(writes(c).length,0);
    record('action_matrix_'+name,c,r,{token});
  }
  for(const status of ['IN_PROGRESS','COMPLETED','CANCELLED']) for(const token of ['publish','both','super']) {
    const c=setup();const r=await c.call('POST',{...bodies.update_schedule,schedule:{...bodies.update_schedule.schedule,status},syncMaintenanceMode:true},token);
    assert.equal(r.status,token==='publish'?403:200);assert.deepEqual(c.s.auth.map(a=>a.keys),[['maintenance:publish'],['system:maintenance_toggle']]);
    if(token==='publish') assert.equal(writes(c).length,0);else assert.equal(c.s.data.config.maintenance_mode,String(status==='IN_PROGRESS'));
    record('sync_'+status,c,r,{token});
  }
  {const c=setup(),r=await c.call('POST',{action:'unknown',enabled:true},'super');assert.equal(r.status,400);assert.equal(writes(c).length,0);record('unknown_action',c,r);}
  // Inject after prior config writes / after session clearing / after callback but before commit.
  for(const fault of [{configAt:2},{audit:true},{commit:true}]) {
    const c=setup({fault});c.maintenance.setMaintenanceCache(false);const before=copy(c.s.data);
    const r=await c.call('POST',bodies.toggle,'super');assert.equal(r.status,500);assert.deepEqual(c.s.data,before);
    assert.equal(c.maintenance.isMaintenanceModeSync(),false);assert.ok(writes(c).every(e=>e.scope==='TX'));
    if(!fault.configAt) assert.ok(writes(c).some(e=>e.method==='user.updateMany'));
    if(fault.commit) {assert.equal(c.s.afterWrites.config.maintenance_mode,'true');assert.equal(c.s.afterWrites.logs.length,1);assert.equal(c.s.afterWrites.users[0].sessionToken,null);}
    record('fault_rollback',c,r,{fault,cacheAfter:c.maintenance.isMaintenanceModeSync()});
  }
  for(const method of ['POST','DELETE']) {const c=setup({fault:{commit:true}});c.s.data.config.maintenance_mode='true';c.maintenance.setMaintenanceCache(true);
    const before=copy(c.s.data),r=await c.call(method,method==='POST'?{enabled:false}:undefined,'super');assert.equal(r.status,500);assert.deepEqual(c.s.data,before);assert.equal(c.maintenance.isMaintenanceModeSync(),true);record('disable_commit_rollback_'+method,c,r);}
  // Scope finding: audit existence is correct, actual before/after facts are missing.
  {const c=setup(),before=copy(c.s.data.config);const r=await c.call('POST',bodies.save_update_settings,'super');assert.equal(r.status,200);
    const log=c.s.data.logs[0];assert.deepEqual(log.details,{});assert.notEqual(c.s.data.config.SYSTEM_UPDATE_SETTINGS_V1,before.SYSTEM_UPDATE_SETTINGS_V1);
    findings.push({id:'F-AUDIT',severity:'P2',case:'settings_change_has_empty_audit_details',status:r.status,before:JSON.parse(before.SYSTEM_UPDATE_SETTINGS_V1),after:JSON.parse(c.s.data.config.SYSTEM_UPDATE_SETTINGS_V1),audit:log});}
  {const c=setup(),r=await c.call('POST',bodies.create_schedule,'super');assert.equal(r.status,200);const created=r.body.schedules[0],log=c.s.data.logs[0];
    assert.ok(created.id);assert.equal(Object.hasOwn(log.details,'scheduleId'),false);
    findings.push({id:'F-AUDIT',severity:'P2',case:'created_schedule_audit_has_no_generated_id_or_change_facts',created,audit:log});}
  {const c=setup(),r=await c.call('POST',bodies.toggle,'super');assert.equal(r.status,200);const log=c.s.data.logs[0];
    assert.equal(log.details.hasMessage,true);assert.equal(Object.hasOwn(log.details,'before'),false);assert.equal(Object.hasOwn(log.details,'after'),false);
    findings.push({id:'F-AUDIT',severity:'P2',case:'maintenance_toggle_records_request_summary_only',audit:log});}
  const manifest=JSON.parse(read('docs/reviews/R0-F-fix-snapshot/manifest.json'));
  const prior=JSON.parse(read('docs/reviews/R0-E-independent-review/next-maintenance-verification.json'));
  for(const f of manifest.files) {const start='docs/reviews/R0-F-fix-snapshot/frozen-source/'+f.path.replaceAll('/','__')+'.frozen';
    const end='docs/reviews/R0-F-fix-snapshot/end-source/'+f.path.replaceAll('/','__')+'.frozen';read(start);read(end);read(f.path);
    assert.equal(hashes[start],f.startSha256);assert.equal(hashes[start],prior.sha256[f.path]);assert.equal(hashes[end],f.endSha256);assert.equal(hashes[f.path],f.endSha256);}
  for(const [p,h] of Object.entries(manifest.protectedUnchangedSha256)){read(p);assert.equal(hashes[p],h);assert.equal(h,prior.sha256[p]);}
  // Ensure prior payment/accounting protection hashes are still intact.
  const previous=JSON.parse(read('docs/reviews/R0-E-independent-review/verification.json'));
  const protectedFiles=['src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/credit-service.ts','src/lib/security.ts','src/middleware.ts'];
  for(const p of protectedFiles){read(p);assert.equal(hashes[p],previous.sha256[p]||manifest.protectedUnchangedSha256[p]);}
  read('src/app/api/__tests__/r0f-maintenance-readonly.test.ts');read('docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs');read('docs/reviews/R0-F-fix-report.md');
  const result={capturedAt:new Date().toISOString(),verdict:'R0-F NOT ACCEPTED: original required audit before/after and created target facts missing. Other independently checked gates pass.',
    cases,findings,sha256:hashes,limits:'Actual route/helper in VM; memory-only transactions/auth/audit storage; commit failure is modeled, not real MySQL. No DB, credentials, network or paid calls. Script exits 0 for a successfully reproduced review finding, NOT batch acceptance.'};
  fs.writeFileSync(OUT+'/verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({verdict:result.verdict,cases:cases.length,findingCases:findings.length,uniqueBlockingFindings:1,hashes:Object.keys(hashes).length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
