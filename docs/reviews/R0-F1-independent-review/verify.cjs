// Read-only business-source review; only this review's JSON output is written.
const fs=require('node:fs'),assert=require('node:assert/strict');
const prior='docs/reviews/R0-F-independent-review/verify.cjs', original=fs.readFileSync(prior,'utf8');
const mainAt=original.indexOf('async function main() {'), stopAt=original.indexOf('  // Scope finding:');
assert.ok(mainAt>0&&stopAt>mainAt);
// Reuse the frozen closed-IO fixture and 110 scope controls, without running its old-defect assertions or writing its old JSON.
const h=new Function('require',original.slice(0,mainAt)+'\nasync function runControls(){'+original.slice(mainAt+'async function main() {'.length,stopAt)+'}\n'+
  'return {setup,read,cases,hashes,copy,record,runControls};')(require);
const observations=[],findings=[];
const CFG={releases:'SYSTEM_RELEASE_NOTES_V1',schedules:'SYSTEM_MAINTENANCE_SCHEDULES_V1',settings:'SYSTEM_UPDATE_SETTINGS_V1'};
const clone=x=>JSON.parse(JSON.stringify(x));
function dataFixture(c) {
  c.s.data.config[CFG.releases]=JSON.stringify([{id:'r1',version:'v1.1.0',title:'Release',type:'FEATURE',isPublished:true,publishDate:'2026-11-01',author:'Old author',items:['Old announcement body']}]);
  c.s.data.config[CFG.schedules]=JSON.stringify([{id:'s1',title:'Schedule',type:'UPGRADE',status:'SCHEDULED',isDowntime:true,startTime:'2026-12-01 00:00',endTime:'待定',manager:'Old manager',scope:'Old scope',description:'Old description',actualResult:''}]);
}
function log(c){return clone(c.s.data.logs.at(-1));}
function observe(name,c,r,before){observations.push({name,status:r.status,before,after:clone(c.s.data.config),audit:log(c)});}
async function main(){
  await h.runControls();
  // G01: original empty-settings-details finding is fixed; repeat submitted scalar remains honest.
  {const c=h.setup();const before=clone(c.s.data.config);const r=await c.call('POST',{action:'save_update_settings',settings:{popupTitle:'new title',forceUpdate:true}},'publish');
    assert.equal(r.status,200);const d=log(c).details;assert.equal(d.target,CFG.settings);assert.equal(d.before.popupTitle,'old title');assert.equal(d.after.popupTitle,'new title');assert.equal(d.before.forceUpdate,false);assert.equal(d.after.forceUpdate,true);assert.equal(d.changed,true);observe('G01_settings_before_after',c,r,before);
    const repeat=await c.call('POST',{action:'save_update_settings',settings:{popupTitle:'new title',forceUpdate:true}},'publish');assert.equal(repeat.status,200);assert.equal(log(c).details.changed,false);observe('G01_settings_repeat_no_change',c,repeat,before);
  }
  for(const versionOnly of [true,false]){const c=h.setup();const before=clone(c.s.data.config);const r=await c.call('POST',{action:'save_update_settings',settings:{systemVersion:'v3.0.0',...(versionOnly?{}:{popupTitle:'mixed title'})}},'publish');
    assert.equal(r.status,200);const d=log(c).details;assert.equal(d.before.systemVersion,'v1.0.0');assert.equal(d.after.systemVersion,'v3.0.0');assert.ok(d.target.includes('system_version'));observe('G01_version_'+(versionOnly?'only':'mixed'),c,r,before);}
  // G02/G03: generated targets and actual mode facts are now captured.
  for(const kind of ['schedule','release']){const c=h.setup();dataFixture(c);const before=clone(c.s.data.config);const body=kind==='schedule'?{title:'New schedule',startTime:'2026-12-03 00:00'}:{title:'New release',version:'v2.0.0'};
    const r=await c.call('POST',{action:'create_'+kind,[kind]:body},'publish');assert.equal(r.status,200);const created=r.body[kind==='schedule'?'schedules':'releases'][0];const d=log(c).details;
    assert.equal(d.target,created.id);assert.equal(d.before,null);assert.equal(d.after.title,created.title);assert.equal(d.changed,true);observe('G02_create_'+kind,c,r,before);}
  for(const method of ['POST','DELETE']){const c=h.setup();c.s.data.config.maintenance_mode='true';c.maintenance.setMaintenanceCache(true);const before=clone(c.s.data.config);const r=await c.call(method,method==='POST'?{enabled:false}:undefined,'toggle');
    assert.equal(r.status,200);const d=log(c).details;assert.equal(d.before.maintenanceMode,true);assert.equal(d.after.maintenanceMode,false);assert.equal(d.changed,true);observe('G03_disable_'+method,c,r,before);}
  {const c=h.setup();const before=clone(c.s.data.config);const r=await c.call('POST',{enabled:true,message:'new explanation',estimatedMinutes:45},'toggle');assert.equal(r.status,200);const d=log(c).details;
    assert.equal(d.before.maintenanceMessage,'old message');assert.equal(d.after.maintenanceMessage,'new explanation');assert.equal(d.before.estimatedMinutes,'30');assert.equal(d.after.estimatedMinutes,'45');assert.equal(d.sessionsCleared,1);
    assert.ok(!JSON.stringify(d).includes('fixture-session'));observe('G03_enable_with_explanation',c,r,before);}
  // Existing metadata CRUD stays observable.
  for(const kind of ['release','schedule'])for(const mode of ['update','delete']){const c=h.setup();dataFixture(c);const key=CFG[kind+'s'],old=JSON.parse(c.s.data.config[key])[0],before=clone(c.s.data.config);
    const body=mode==='update'?{action:'update_'+kind,[kind]:{...old,title:'Changed title'}}:{action:'delete_'+kind,[kind+'Id']:old.id};
    const r=await c.call('POST',body,'publish');assert.equal(r.status,200);const d=log(c).details;assert.equal(d.target,old.id);assert.equal(d.before.title,old.title);assert.equal(d.changed,true);if(mode==='update')assert.equal(d.after.title,'Changed title');else assert.equal(d.after.deleted,true);observe('G02_metadata_'+mode+'_'+kind,c,r,before);}
  // The same original audit-truth requirement still fails for legitimate editable business content.
  for(const [kind,field,value] of [['release','items',['Updated announcement body']],['release','author','New author'],['schedule','description','New description'],['schedule','scope','New scope'],['schedule','actualResult','Work completed'],['schedule','manager','New manager']]) {
    const c=h.setup();dataFixture(c);const key=CFG[kind+'s'],old=JSON.parse(c.s.data.config[key])[0],before=clone(c.s.data.config);
    const r=await c.call('POST',{action:'update_'+kind,[kind]:{...old,[field]:value}},'publish');assert.equal(r.status,200);const actual=JSON.parse(c.s.data.config[key])[0],audit=log(c);
    assert.equal(JSON.stringify(actual[field]),JSON.stringify(value));assert.notEqual(JSON.stringify(old[field]),JSON.stringify(actual[field]));
    assert.equal(audit.details.changed,false);assert.equal(JSON.stringify(audit.details.before),'{}');assert.equal(JSON.stringify(audit.details.after),'{}');
    findings.push({id:'F-AUDIT-REMAINDER',severity:'P2',case:'changed_content_reported_unchanged',kind,field,oldValue:old[field],actualNewValue:actual[field],audit});observe('G02_content_'+kind+'_'+field,c,r,before);
  }
  // Sync mode forces changed=true even if every persisted value is already identical.
  {const c=h.setup();dataFixture(c);const plan=JSON.parse(c.s.data.config[CFG.schedules])[0];plan.status='IN_PROGRESS';c.s.data.config[CFG.schedules]=JSON.stringify([plan]);c.s.data.config.maintenance_mode='true';
    c.s.data.config.maintenance_message=`系统正在进行【${plan.title}】\n影响范围：${plan.scope}\n详细说明：${plan.description}`;c.maintenance.setMaintenanceCache(true);
    const before=clone(c.s.data.config),r=await c.call('POST',{action:'update_schedule',schedule:plan,syncMaintenanceMode:true},'both');assert.equal(r.status,200);
    assert.equal(JSON.stringify(c.s.data.config),JSON.stringify(before));assert.equal(log(c).details.changed,true);
    findings.push({id:'F-AUDIT-REMAINDER',severity:'P2',case:'identical_plan_and_mode_sync_reported_changed',configUnchanged:true,audit:log(c)});observe('G02_sync_repeat',c,r,before);
  }
  // Strict transaction reads must abort rather than fabricate old facts.
  for(const kind of ['release','schedule'])for(const fault of ['badJSON','readFailure']){const c=h.setup({fault:fault==='readFailure'?{read:CFG[kind+'s']}:{}});if(fault==='badJSON')c.s.data.config[CFG[kind+'s']]='not JSON';
    const before=clone(c.s.data);const r=await c.call('POST',kind==='schedule'?{action:'create_schedule',schedule:{title:'New',startTime:'2026-12-03 00:00'}}:{action:'create_release',release:{title:'New',version:'v2.0.0'}},'publish');
    assert.equal(r.status,500);assert.equal(JSON.stringify(c.s.data),JSON.stringify(before));assert.equal(c.s.events.filter(e=>e.write).length,0);observations.push({name:'G04_strict_read_'+kind+'_'+fault,status:r.status,events:clone(c.s.events)});}
  const manifest=JSON.parse(h.read('docs/reviews/R0-F1-fix-snapshot/manifest.json')),after=JSON.parse(h.read('docs/reviews/R0-F1-fix-snapshot/after-hashes.json'));
  const priorEvidence=JSON.parse(h.read('docs/reviews/R0-F-independent-review/verification.json'));
  for(const [p,item] of Object.entries(manifest.files)){h.read(item.snapshotCopy);h.read(p);assert.equal(h.hashes[item.snapshotCopy],item.sha256);assert.equal(item.sha256,priorEvidence.sha256[p]);assert.equal(h.hashes[p],after[p].sha256After);}
  const protectedPaths=['src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/credit-service.ts','src/lib/security.ts','src/middleware.ts','src/app/admin/maintenance/page.tsx'];
  for(const p of protectedPaths){h.read(p);assert.equal(h.hashes[p],priorEvidence.sha256[p]);}
  h.read('docs/reviews/R0-F1-fix-report.md');
  const result={capturedAt:new Date().toISOString(),verdict:'NOT ACCEPTED: one original F-AUDIT requirement remains: changed-content and no-change sync audit facts are inaccurate.',scopeControls:h.cases,observations,findings,sha256:h.hashes,
    limits:'Actual route/helper with reused closed IO fixture. No credential/env/DB/network/payment access. Exit 0 means the observations and remaining defect were reproduced, not acceptance. JSON writes only inside this review directory.'};
  fs.writeFileSync('docs/reviews/R0-F1-independent-review/verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({verdict:result.verdict,scopeControls:h.cases.length,observations:observations.length,remainingDefectCases:findings.length,uniqueDefects:1,hashes:Object.keys(h.hashes).length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
