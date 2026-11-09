// Independent R0-G audit. Real handler, fixed synthetic time/env, closed memory-only persistence.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const OUT='docs/reviews/R0-G-independent-review',hashes={},cases=[],findings=[];
const NOW=Date.parse('2026-11-07T06:30:00.000Z'),SECRET='synthetic-review-cron-key';
class ReviewDate extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
function read(p){const b=fs.readFileSync(p);hashes[p]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}
const routePath='src/app/api/cron/workspace-subscription-expire/route.ts',routeSource=read(routePath);
const js=ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const copy=x=>structuredClone(x);
function setup({environment='production',secret=SECRET,reclaim,hook,fault={},std={key:'STANDARD',maxMembers:4},binding='q1'}={}){
  const s={data:{workspaces:[{id:'w1',name:'Fixture workspace',plan:'PRO',planStartedAt:new Date(NOW-86400000*30),planExpiresAt:new Date(NOW-86400000),planBillingCycle:'MONTH',extraSeats:7,workspacequotaId:binding}],quotas:[{id:'q1',workspaceId:'w1',enterpriseSlots:20n,tokenBalance:850n}],grants:[{id:'g1',remaining:850n,source:'RECHARGE'}],ledger:[{id:'l1',delta:850n}],wallet:{balance:125n}},events:[],logs:[],fault,hook,txAfterWrites:null};
  function matches(row,where){return Object.entries(where).every(([k,v])=>{const actual=row[k];if(v&&typeof v==='object'&&!(v instanceof Date)){
    for(const [op,val]of Object.entries(v)){if(op==='not'){if(actual===val||val===null&&actual==null)return false;}else if(op==='lt'){if(actual==null||!(actual.getTime()<val.getTime()))return false;}else if(op==='lte'){if(actual==null||!(actual.getTime()<=val.getTime()))return false;}else throw Error('UNSUPPORTED_PREDICATE '+op);}return true;}
    return v instanceof Date||actual instanceof Date?(v!=null&&actual!=null&&new Date(v).getTime()===new Date(actual).getTime()):actual===v;});}
  const select=(r,sel)=>sel?Object.fromEntries(Object.keys(sel).filter(k=>sel[k]).map(k=>[k,copy(r[k])])):copy(r);
  function client(get,scope){const event=(table,method,args,write=false)=>{s.events.push({scope,table,method,args:copy(args),write});if(write&&scope==='ROOT')throw Error('ROOT_WRITE_DENIED');};
    return {workspaceplan:{async findUnique(args){event('workspaceplan','findUnique',args);if(fault.readConfig)throw Error('CONFIG_READ_FAIL');return copy(std);}},
      workspace:{async findMany(args){event('workspace','findMany',args);return get().workspaces.filter(w=>matches(w,args.where)).map(w=>select(w,args.select));},
        async findUnique(args){event('workspace','findUnique',args);const r=get().workspaces.find(w=>matches(w,args.where));return r?select(r,args.select):null;},
        async updateMany(args){event('workspace','updateMany',args,true);if(fault.workspace)throw Error('WORKSPACE_WRITE_FAIL');let count=0;for(const w of get().workspaces)if(matches(w,args.where)){Object.assign(w,copy(args.data));count++;}return {count};}},
      workspacequota:{async updateMany(args){event('workspacequota','updateMany',args,true);if(fault.quota)throw Error('QUOTA_WRITE_FAIL');let count=0;for(const q of get().quotas)if(matches(q,args.where)){Object.assign(q,copy(args.data));count++;}return {count};}}};
  }
  let queue=Promise.resolve();const prisma={...client(()=>s.data,'ROOT'),$transaction(fn){const run=async()=>{if(s.hook){const f=s.hook;s.hook=null;f(s.data);}const draft=copy(s.data);s.events.push({method:'begin'});
    try{const value=await fn(client(()=>draft,'TX'));s.txAfterWrites=copy(draft);if(fault.commit)throw Error('COMMIT_FAIL');s.data=draft;s.events.push({method:'commit'});return value;}catch(e){s.events.push({method:'rollback'});throw e;}};
    const result=queue.then(run,run);queue=result.catch(()=>{});return result;}};
  const exports={},env={NODE_ENV:environment};if(secret!==null)env.CRON_SECRET=secret;if(reclaim!==undefined)env.RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY=reclaim;
  vm.runInNewContext(js,{exports,Date:ReviewDate,Error,BigInt,process:{env},console:{error(...a){s.logs.push(a.map(x=>String(x)));}},require(n){if(n==='next/server')return {NextResponse:{json:(b,i)=>new Response(JSON.stringify(b),i)}};if(n==='@/lib/prisma')return {prisma};throw Error('DEPENDENCY_DENIED '+n);}},{filename:routePath});
  return {s,async call(key=SECRET,{authorization,query=''}={}){const headers=new Headers();if(key!==null)headers.set('x-cron-key',key);if(authorization)headers.set('authorization',authorization);const r=await exports.POST({headers,nextUrl:new URL('http://isolated/api/cron/workspace-subscription-expire'+query)});return {status:r.status,body:await r.json()};}};
}
function assets(c){const d=c.s.data;return copy({grants:d.grants,ledger:d.ledger,wallet:d.wallet,balances:d.quotas.map(q=>({id:q.id,tokenBalance:q.tokenBalance}))});}
function record(name,c,r,extra={}){cases.push({name,...extra,httpStatus:r.status,response:r.body,state:copy(c.s.data),events:copy(c.s.events)});}
async function main(){
  for(const environment of ['production','development','test'])for(const secret of [null,'','   ']){const c=setup({environment,secret}),before=copy(c.s.data),r=await c.call(null);assert.equal(r.status,503);assert.equal(r.body.error,'CRON_SECRET_NOT_CONFIGURED');assert.deepEqual(c.s.data,before);assert.equal(c.s.events.length,0);record('missing_secret',c,r,{environment,secretForm:secret===null?'missing':secret===''?'empty':'blank'});}
  for(const key of [null,'','  ','wrong']){const c=setup(),r=await c.call(key);assert.equal(r.status,401);assert.equal(c.s.events.length,0);assert.ok(!JSON.stringify(r).includes(SECRET));record('invalid_key',c,r);}
  for(const options of [{authorization:'Bearer synthetic-login'},{query:'?key='+SECRET}]){const c=setup(),r=await c.call(null,options);assert.equal(r.status,401);assert.equal(c.s.events.length,0);record('no_alternate_auth',c,r);}
  for(const reclaim of [undefined,'false','true','TRUE','1']){const c=setup({reclaim}),before=assets(c),r=await c.call();assert.equal(r.status,200);assert.equal(r.body.downgraded,1);assert.equal(r.body.reclaimedPoints,false);assert.equal(c.s.data.quotas[0].enterpriseSlots,4n);assert.deepEqual(assets(c),before);if(reclaim==='true')assert.equal(r.body.reclaimPaused,true);record('preserve_assets',c,r,{reclaim:reclaim??'missing'});}
  {const c=setup();const base=copy(c.s.data.workspaces[0]);c.s.data.workspaces.push({...base,id:'future',planExpiresAt:new Date(NOW+1),workspacequotaId:null},{...base,id:'equal',planExpiresAt:new Date(NOW),workspacequotaId:null},{...base,id:'no-deadline',planExpiresAt:null,workspacequotaId:null},{...base,id:'standard',plan:'STANDARD',workspacequotaId:null});const r=await c.call();assert.equal(r.status,200);assert.equal(r.body.downgraded,1);for(const w of c.s.data.workspaces.filter(w=>w.id!=='w1'))assert.equal(w.plan,w.id==='standard'?'STANDARD':'PRO');record('classification_fixed_boundary',c,r);}
  for(const [name,hook]of Object.entries({renew:d=>{d.workspaces[0].planExpiresAt=new Date(NOW+86400000);},changedExpiredDeadline:d=>{d.workspaces[0].planExpiresAt=new Date(NOW-1000);},planChange:d=>{d.workspaces[0].plan='ENTERPRISE';},bindingChange:d=>{d.workspaces[0].workspacequotaId='q2';d.quotas.push({id:'q2',workspaceId:'w1',enterpriseSlots:30n,tokenBalance:99n});},bindingRemoved:d=>{d.workspaces[0].workspacequotaId=null;},wrongQuotaOwner:d=>{d.quotas[0].workspaceId='other';}})){
    const c=setup({hook}),r=await c.call();assert.equal(r.status,200);assert.equal(r.body.downgraded,0);assert.equal(r.body.skipped,1);assert.notEqual(c.s.data.workspaces[0].plan,'STANDARD');assert.equal(c.s.data.quotas[0].enterpriseSlots,20n);record('race_'+name,c,r);}
  for(const fault of [{workspace:true},{quota:true},{commit:true}]){const c=setup({fault}),before=copy(c.s.data),r=await c.call();assert.equal(r.status,500);assert.deepEqual(c.s.data,before);assert.ok(c.s.events.filter(e=>e.write).every(e=>e.scope==='TX'));if(fault.commit){assert.equal(c.s.txAfterWrites.workspaces[0].plan,'STANDARD');assert.equal(c.s.txAfterWrites.quotas[0].enterpriseSlots,4n);}record('failure_rollback',c,r,{fault});}
  {const c=setup(),responses=await Promise.all([c.call(),c.call()]);assert.equal(responses.reduce((n,r)=>n+r.body.downgraded,0),1);const repeat=await c.call();assert.equal(repeat.body.downgraded,0);record('parallel_then_repeat',c,repeat,{responses});}
  // J05 gap: original null candidate bypasses all quota-binding validation.
  {const c=setup({binding:null,hook:d=>{d.workspaces[0].workspacequotaId='q2';d.quotas.push({id:'q2',workspaceId:'w1',enterpriseSlots:30n,tokenBalance:99n});}});const r=await c.call();assert.equal(r.status,200);assert.equal(r.body.downgraded,1);assert.equal(r.body.skipped,0);assert.equal(c.s.data.workspaces[0].plan,'STANDARD');assert.equal(c.s.data.quotas.find(q=>q.id==='q2').enterpriseSlots,30n);
    findings.push({id:'G-BINDING',priority:'P1',scenario:'scanned_null_binding_attached_before_write',response:r.body,state:copy(c.s.data),events:copy(c.s.events)});}
  // J03/config guard gap: a missing STANDARD row still writes hard-coded seats=2.
  {const c=setup({std:null}),r=await c.call();assert.equal(r.status,200);assert.equal(r.body.downgraded,1);assert.equal(c.s.data.quotas[0].enterpriseSlots,2n);
    findings.push({id:'G-CONFIG',priority:'P2',scenario:'missing_STANDARD_config_still_downgrades_with_2_seats',response:r.body,state:copy(c.s.data),events:copy(c.s.events)});}
  const manifest=JSON.parse(read('docs/reviews/R0-G-fix-snapshot/manifest.json')),after=JSON.parse(read('docs/reviews/R0-G-fix-snapshot/after-hashes.json')),prior=JSON.parse(read('docs/reviews/R0-F2-independent-review/next-cron-verification.json'));
  for(const [p,f]of Object.entries(manifest.files)){read(f.snapshotCopy);assert.equal(hashes[f.snapshotCopy],f.sha256);assert.equal(f.sha256,prior.sha256[p]);assert.equal(hashes[p],after[p].sha256After);}
  for(const [p,f]of Object.entries(after)){read(p);assert.equal(hashes[p],f.sha256After);}
  const frozen=JSON.parse(read('docs/reviews/R0-F2-independent-review/verification.json'));
  for(const p of ['src/app/api/system/maintenance/route.ts','src/lib/maintenance.ts','src/lib/credit-service.ts','src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/security.ts','src/middleware.ts','src/app/admin/maintenance/page.tsx']){read(p);assert.equal(hashes[p],frozen.sha256[p]);}
  read('docs/reviews/R0-G-fix-report.md');
  const result={capturedAt:new Date().toISOString(),verdict:'NOT ACCEPTED: G-BINDING (null-to-quota race) and G-CONFIG (missing STANDARD fallback) violate original J05 / configuration safety requirements.',cases,findings,sha256:hashes,
    limits:'Actual handler in VM, synthetic fixed time/env, serial memory transactions/commit failures; not live MySQL concurrency, deployment or actual user state. No business-source edits or real DB/network/paid calls. Exit 0 means controlled findings were reproduced, not batch acceptance.'};
  fs.writeFileSync(OUT+'/verification.json',JSON.stringify(result,(_k,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({verdict:result.verdict,controlCases:cases.length,findings:findings.length,hashes:Object.keys(hashes).length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
