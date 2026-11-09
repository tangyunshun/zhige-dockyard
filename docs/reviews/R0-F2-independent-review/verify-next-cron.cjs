// Evidence for original F10 only. Actual cron handler with synthetic environment and memory-only Prisma.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hashes={},cases=[];
function read(p){const b=fs.readFileSync(p);hashes[p]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}
const routeFile='src/app/api/cron/workspace-subscription-expire/route.ts';
const js=ts.transpileModule(read(routeFile),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
async function scenario({name,environment='production',secret,key,reclaim=false,renewAfterScan=false}){
  const now=Date.now(),state={workspace:{id:'fixture-workspace',name:'Fixture',plan:'PRO',planStartedAt:new Date(now-86400000*40),planExpiresAt:new Date(now-86400000),planBillingCycle:'MONTH',extraSeats:5,workspacequotaId:'fixture-quota'},quota:{id:'fixture-quota',enterpriseSlots:20n,tokenBalance:850n},grants:[{id:'fixture-grant',remaining:850n}],ledger:[],events:[]};
  const before=structuredClone(state);
  const tx={workspace:{async update({where,data}){state.events.push({kind:'write',scope:'TX',table:'workspace',where,data});Object.assign(state.workspace,data);return state.workspace;}},workspacequota:{async update({where,data}){state.events.push({kind:'write',scope:'TX',table:'workspacequota',where,data});Object.assign(state.quota,data);return state.quota;}}};
  const prisma={workspaceplan:{async findUnique(){state.events.push({kind:'read',table:'workspaceplan'});return {key:'STANDARD',maxMembers:2};}},workspace:{async findMany({where}){state.events.push({kind:'read',table:'workspace',where});const w=state.workspace;const found=w.plan!=='STANDARD'&&w.planExpiresAt<where.planExpiresAt.lt?[{id:w.id,name:w.name,plan:w.plan,workspacequotaId:w.workspacequotaId}]:[];
    if(renewAfterScan){w.planExpiresAt=new Date(now+86400000*30);w.extraSeats=9;}return found;}},async $transaction(fn){const snap=structuredClone({workspace:state.workspace,quota:state.quota});state.events.push({kind:'transaction'});try{return await fn(tx);}catch(e){state.workspace=snap.workspace;state.quota=snap.quota;throw e;}}};
  const exports={},env={NODE_ENV:environment,RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY:String(reclaim)};if(secret!==undefined)env.CRON_SECRET=secret;
  vm.runInNewContext(js,{exports,Date,BigInt,Error,process:{env},console:{error(){},log(){}},require(n){if(n==='next/server')return {NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}};if(n==='@/lib/prisma')return {prisma};throw Error('DEPENDENCY_DENIED '+n);}},{filename:routeFile});
  const headers=new Headers(key===undefined?{}:{'x-cron-key':key});const response=await exports.POST({headers});const body=await response.json();
  const result={name,environment,configuredSecret:secret!==undefined,providedKey:key!==undefined,reclaim,renewAfterScan,httpStatus:response.status,response:body,before,after:state};
  if(name==='configured_wrong_key_control'){assert.equal(response.status,401);assert.equal(state.events.length,0);assert.equal(state.workspace.plan,'PRO');}
  else {assert.equal(response.status,200);assert.equal(state.workspace.plan,'STANDARD');assert.equal(state.quota.tokenBalance,reclaim?0n:850n);assert.equal(state.grants[0].remaining,850n);assert.equal(state.ledger.length,0);}
  cases.push(result);
}
async function main(){
  await scenario({name:'production_missing_secret_anonymous'});
  await scenario({name:'development_missing_secret_anonymous',environment:'development'});
  await scenario({name:'configured_wrong_key_control',secret:'synthetic-review-key',key:'wrong-key'});
  await scenario({name:'configured_valid_key_preserves_points',secret:'synthetic-review-key',key:'synthetic-review-key'});
  await scenario({name:'configured_reclaim_flag_zeros_balance_without_source_accounting',secret:'synthetic-review-key',key:'synthetic-review-key',reclaim:true});
  await scenario({name:'renewed_after_scan_still_downgraded',secret:'synthetic-review-key',key:'synthetic-review-key',renewAfterScan:true});
  const middleware=read('src/middleware.ts');assert.ok(middleware.includes('"/api/cron"'));
  for(const p of ['docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md','src/app/api/workspace/seat-addon/route.ts','src/lib/payment/seat-addon-fulfill.ts'])read(p);
  const evidence={capturedAt:new Date().toISOString(),originalIssue:'F10 subscription-expiry cron fail-open / raw balance zeroing',cases,sha256:hashes,
    limits:'Synthetic env only; actual route direct execution plus static middleware evidence, no live HTTP or real DB/secret. Renewal modeled between scan and transaction; not real lock testing. Grants/ledger retained as memory sentinels to show the route has no source-accounting writes.'};
  fs.writeFileSync('docs/reviews/R0-F2-independent-review/next-cron-verification.json',JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
  console.log(JSON.stringify({originalIssue:evidence.originalIssue,cases:cases.map(c=>({name:c.name,httpStatus:c.httpStatus,reads:c.after.events.filter(e=>e.kind==='read').length,writes:c.after.events.filter(e=>e.kind==='write').length,plan:c.after.workspace.plan,balance:String(c.after.quota.tokenBalance)}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
