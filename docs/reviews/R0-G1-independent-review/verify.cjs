// Independent K01-K05 acceptance using the immutable G review fixture; no business source replacement.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/reviews/R0-G-independent-review/verify.cjs','utf8');
const mainStart=source.indexOf('async function main(){'),controlEnd=source.indexOf('  // J05 gap:');
const prefix=source.slice(0,mainStart);
const h=new Function('require',prefix+'\nasync function runControls(){'+source.slice(mainStart+'async function main(){'.length,controlEnd)+'}\nreturn {setup,assets,record,read,hashes,cases,runControls};')(require);
const old=new Function('require',prefix.replace("routePath='src/app/api/cron/workspace-subscription-expire/route.ts'","routePath='docs/reviews/R0-G1-fix-snapshot/frozen-source/src__app__api__cron__workspace-subscription-expire__route.ts.snapshot.txt'")+'\nreturn {setup};')(require);
const observations=[],comparisons=[],copy=x=>structuredClone(x);
function record(name,c,r){observations.push({name,httpStatus:r.status,response:r.body,state:copy(c.s.data),events:copy(c.s.events)});}
async function bindingCase(loader,initial,target){const c=loader.setup({binding:initial,...(initial===target?{}:{hook:d=>{d.workspaces[0].workspacequotaId=target;if(target==='q2')d.quotas.push({id:'q2',workspaceId:'w1',enterpriseSlots:30n,tokenBalance:99n});}})});const r=await c.call();return {c,r};}
async function main(){
  await h.runControls();
  for(const [initial,target]of [[null,'q2'],['q1','q2'],['q1',null],[null,null],['q1','q1']]){const {c,r}=await bindingCase(h,initial,target);assert.equal(r.status,200);const changed=initial!==target;
    assert.equal(r.body.downgraded,changed?0:1);assert.equal(r.body.skipped,changed?1:0);assert.equal(c.s.data.workspaces[0].plan,changed?'PRO':'STANDARD');assert.equal(c.s.data.workspaces[0].workspacequotaId,target);
    const qw=c.s.events.filter(e=>e.table==='workspacequota'&&e.write);assert.equal(qw.length,changed||target===null?0:1);
    assert.equal(c.s.data.quotas[0].tokenBalance,850n);if(target==='q2'){assert.equal(c.s.data.quotas.find(q=>q.id==='q2').enterpriseSlots,30n);assert.equal(c.s.data.quotas.find(q=>q.id==='q2').tokenBalance,99n);}
    record('binding_'+String(initial)+'_to_'+String(target),c,r);
  }
  for(const std of [null,{key:'STANDARD',maxMembers:0},{key:'STANDARD',maxMembers:-1},{key:'STANDARD',maxMembers:4},{key:'STANDARD',maxMembers:7}]){const c=h.setup({std}),before=copy(c.s.data),r=await c.call();
    if(!std||std.maxMembers<=0){assert.equal(r.status,503);assert.equal(r.body.error,'STANDARD_PLAN_CONFIG_UNAVAILABLE');assert.deepEqual(c.s.data,before);assert.equal(c.s.events.some(e=>e.write||e.method==='begin'),false);}
    else {assert.equal(r.status,200);assert.equal(r.body.downgraded,1);assert.equal(c.s.data.quotas[0].enterpriseSlots,BigInt(std.maxMembers));assert.equal(c.s.data.quotas[0].tokenBalance,850n);}
    record('config_'+(std?std.maxMembers:'missing'),c,r);
  }
  {const c=h.setup({fault:{readConfig:true}}),before=copy(c.s.data),r=await c.call();assert.equal(r.status,500);assert.deepEqual(c.s.data,before);assert.equal(c.s.events.some(e=>e.write||e.method==='begin'),false);record('config_read_failure',c,r);}
  {const c=h.setup({std:null}),r=await c.call('wrong');assert.equal(r.status,401);assert.equal(c.s.events.length,0);record('auth_before_config',c,r);}
  for(const scenario of ['null_binding_change','missing_standard']){const pair={scenario};for(const [label,loader]of [['before',old],['after',h]]){let c,r;if(scenario==='null_binding_change'){({c,r}=await bindingCase(loader,null,'q2'));}else{c=loader.setup({std:null});r=await c.call();}
      pair[label]={status:r.status,response:r.body,plan:c.s.data.workspaces[0].plan,seats:String(c.s.data.quotas[0].enterpriseSlots)};}
    if(scenario==='null_binding_change'){assert.equal(pair.before.response.downgraded,1);assert.equal(pair.after.response.downgraded,0);assert.equal(pair.after.response.skipped,1);}
    else {assert.equal(pair.before.status,200);assert.equal(pair.before.seats,'2');assert.equal(pair.after.status,503);assert.equal(pair.after.plan,'PRO');}
    comparisons.push(pair);
  }
  const manifest=JSON.parse(h.read('docs/reviews/R0-G1-fix-snapshot/manifest.json')),after=JSON.parse(h.read('docs/reviews/R0-G1-fix-snapshot/after-hashes.json')),prior=JSON.parse(h.read('docs/reviews/R0-G-independent-review/verification.json'));
  for(const [p,f]of Object.entries(manifest.files)){h.read(f.snapshotCopy);h.read(p);assert.equal(h.hashes[f.snapshotCopy],f.sha256);assert.equal(f.sha256,prior.sha256[p]);assert.equal(h.hashes[p],after[p].sha256After);}
  for(const p of ['src/app/api/system/maintenance/route.ts','src/lib/maintenance.ts','src/lib/credit-service.ts','src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/security.ts','src/middleware.ts','src/app/admin/maintenance/page.tsx']){h.read(p);assert.equal(h.hashes[p],prior.sha256[p]);}
  h.read('docs/reviews/R0-G1-fix-report.md');
  const result={capturedAt:new Date().toISOString(),verdict:'PASS bounded K01-K05 source/isolated acceptance; freeze original F10 subscription-expiry stop-loss R0-G/G1.',controls:h.cases,observations,comparisons,sha256:h.hashes,
    limits:'Actual handler; reused immutable closed-IO fixture, fixed synthetic clock, memory transaction serialization and faults. No real MySQL/production RBAC, other cron, full request-side entitlements, deployment or financial actions. No business-source edits.'};
  fs.writeFileSync('docs/reviews/R0-G1-independent-review/verification.json',JSON.stringify(result,(_k,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify({verdict:result.verdict,controls:h.cases.length,observations:observations.length,oldNewComparisons:comparisons.length,hashes:Object.keys(h.hashes).length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
