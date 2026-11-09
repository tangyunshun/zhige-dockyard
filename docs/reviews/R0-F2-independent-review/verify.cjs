// Bounded independent acceptance. Actual route/helper, memory-only persistence/auth; no shared-source replacement.
const fs=require('node:fs'),assert=require('node:assert/strict');
const prior='docs/reviews/R0-F-independent-review/verify.cjs',original=fs.readFileSync(prior,'utf8');
const start=original.indexOf('async function main() {'),end=original.indexOf('  // Scope finding:');
const h=new Function('require',original.slice(0,start)+'\nasync function runControls(){'+original.slice(start+'async function main() {'.length,end)+'}\nreturn {setup,read,cases,hashes,runControls};')(require);
const prefix=original.slice(0,start)
  .replace("prefix+'src__lib__maintenance.ts.frozen'","'docs/reviews/R0-F2-fix-snapshot/frozen-source/src__lib__maintenance.ts.snapshot.txt'")
  .replace("prefix+'src__app__api__system__maintenance__route.ts.frozen'","'docs/reviews/R0-F2-fix-snapshot/frozen-source/src__app__api__system__maintenance__route.ts.snapshot.txt'");
const old=new Function('require',prefix+'\nreturn {setup,hashes};')(require);
const observations=[],comparisons=[],copy=x=>JSON.parse(JSON.stringify(x));
const cfg={schedule:'SYSTEM_MAINTENANCE_SCHEDULES_V1',release:'SYSTEM_RELEASE_NOTES_V1'};
const schedule={id:'s-full',title:'Review plan',type:'UPGRADE',status:'IN_PROGRESS',isDowntime:true,startTime:'2026-12-01 02:00',endTime:'2026-12-01 04:00',manager:'Manager A',scope:'Scope A',description:'Description A',actualResult:'Result A'};
const release={id:'r-full',version:'v1.0.0',title:'Review release',type:'FEATURE',publishDate:'2026-11-07',isPublished:true,author:'Author A',items:['Item A','Item B']};
const message=s=>`系统正在进行【${s.title}】\n影响范围：${s.scope}\n详细说明：${s.description}`;
function seed(c){c.s.data.config[cfg.schedule]=JSON.stringify([schedule]);c.s.data.config[cfg.release]=JSON.stringify([release]);}
function summary(name,c,r,extra={}){observations.push({name,httpStatus:r.status,audit:copy(c.s.data.logs.at(-1)),...extra});}
const fields={schedule:{title:'Changed plan',type:'DATABASE',status:'COMPLETED',isDowntime:false,startTime:'2026-12-01 03:00',endTime:'2026-12-01 05:00',manager:'Manager B',scope:'Scope B',description:'Description B',actualResult:'Result B'},
  release:{version:'v2.0.0',title:'Changed release',type:'SECURITY',publishDate:'2026-11-08',isPublished:false,author:'Author B',items:['Changed item','New item']}};
async function update(c,kind,patch={},sync=false){const base=kind==='schedule'?schedule:release;return c.call('POST',{action:'update_'+kind,[kind]:{...base,...patch},...(sync?{syncMaintenanceMode:true}:{})},sync?'both':'publish');}
async function main(){
  await h.runControls();
  for(const kind of ['schedule','release'])for(const [field,value] of Object.entries(fields[kind])){
    const c=h.setup();seed(c);const before=copy(JSON.parse(c.s.data.config[cfg[kind]])[0]),r=await update(c,kind,{[field]:value});assert.equal(r.status,200);
    const after=JSON.parse(c.s.data.config[cfg[kind]])[0],d=copy(c.s.data.logs[0].details);
    assert.equal(d.changed,true);assert.equal(d.target,before.id);assert.deepEqual(d.before,{[field]:before[field]});assert.deepEqual(d.after,{[field]:after[field]});assert.deepEqual(after[field],value);summary('field_'+kind+'_'+field,c,r,{field,storedBefore:before[field],storedAfter:after[field]});
  }
  for(const kind of ['schedule','release']){const c=h.setup();seed(c);const r=await update(c,kind);assert.equal(r.status,200);const d=copy(c.s.data.logs[0].details);assert.equal(d.changed,false);assert.deepEqual(d.before,{});assert.deepEqual(d.after,{});summary('unchanged_'+kind,c,r);}
  {const c=h.setup();seed(c);const r=await update(c,'release',{items:[...release.items].reverse()});assert.equal(r.status,200);assert.equal(c.s.data.logs[0].details.changed,true);summary('array_order_change',c,r);}
  for(const [kind,field] of [['schedule','description'],['release','author']]){const c=h.setup();seed(c);const row=kind==='schedule'?copy(schedule):copy(release);delete row[field];c.s.data.config[cfg[kind]]=JSON.stringify([row]);const r=await update(c,kind,{[field]:'New optional value'});
    assert.equal(r.status,200);const d=copy(c.s.data.logs[0].details);assert.equal(d.before[field],null);assert.equal(d.after[field],'New optional value');summary('missing_old_value_'+kind,c,r);}
  // Four sync combinations: unchanged, mode-only, explanation-only, plan+mode.
  for(const scenario of ['unchanged','modeOnly','messageOnly','planAndMode']){const c=h.setup();seed(c);const oldMode=scenario==='modeOnly'||scenario==='planAndMode'?'false':'true';c.s.data.config.maintenance_mode=oldMode;c.maintenance.setMaintenanceCache(oldMode==='true');
    c.s.data.config.maintenance_message=scenario==='messageOnly'?'Old custom explanation':message(schedule);
    const before=copy(c.s.data.config),r=await update(c,'schedule',scenario==='planAndMode'?{description:'New synced description'}:{},true);assert.equal(r.status,200);const d=copy(c.s.data.logs[0].details);
    assert.equal(d.changed,scenario!=='unchanged');assert.equal(d.maintenanceModeBefore,oldMode==='true');assert.equal(d.maintenanceModeAfter,true);assert.equal(d.maintenanceMessageBefore,before.maintenance_message);assert.equal(d.maintenanceMessageAfter,c.s.data.config.maintenance_message);
    if(scenario==='unchanged')assert.deepEqual(c.s.data.config,before);summary('sync_'+scenario,c,r,{storedBefore:before,storedAfter:copy(c.s.data.config)});
  }
  {const c=h.setup();seed(c);c.s.data.config.maintenance_mode='true';c.maintenance.setMaintenanceCache(true);const r=await update(c,'schedule',{status:'COMPLETED'},true);assert.equal(r.status,200);assert.equal(c.s.data.logs[0].details.maintenanceModeAfter,false);assert.equal(c.maintenance.isMaintenanceModeSync(),false);summary('sync_disable',c,r);}
  for(const kind of ['schedule','release']){const c=h.setup();seed(c);const base=kind==='schedule'?schedule:release;const r=await c.call('POST',{action:'create_'+kind,[kind]:base},'publish');assert.equal(r.status,200);const created=r.body[kind==='schedule'?'schedules':'releases'][0];assert.equal(c.s.data.logs[0].details.target,created.id);assert.notEqual(created.id,base.id);summary('create_actual_id_'+kind,c,r);
    const del=await c.call('POST',{action:'delete_'+kind,[kind+'Id']:created.id},'publish');assert.equal(del.status,200);const d=copy(c.s.data.logs[1].details);assert.equal(d.target,created.id);assert.equal(d.after.deleted,true);if(kind==='schedule')assert.equal(d.before.description,base.description);
    if(kind==='release')assert.deepEqual(d.before.items,release.items);summary('delete_facts_'+kind,c,del);
  }
  {const c=h.setup();const r=await c.call('POST',{action:'save_update_settings',settings:{popupTitle:'new title',forceUpdate:true}},'publish');assert.equal(r.status,200);const d=copy(c.s.data.logs[0].details);assert.equal(d.before.popupTitle,'old title');assert.equal(d.after.forceUpdate,true);summary('settings_no_version',c,r);}
  // Exact old/new counterexamples in isolated frozen copies, without any filesystem source swap.
  for(const scenario of ['releaseBody','unchangedSync']){const sample={scenario};for(const [label,loader]of [['before',old],['after',h]]){const c=loader.setup({legacy:label==='before'});seed(c);c.s.data.config.maintenance_mode='true';c.s.data.config.maintenance_message=message(schedule);
      const r=await update(c,scenario==='releaseBody'?'release':'schedule',scenario==='releaseBody'?{items:['New body']}:{},scenario==='unchangedSync');assert.equal(r.status,200);sample[label]={changed:c.s.data.logs[0].details.changed,details:copy(c.s.data.logs[0].details)};}
    assert.equal(sample.before.changed,scenario==='unchangedSync');assert.equal(sample.after.changed,scenario!=='unchangedSync');comparisons.push(sample);}
  const manifest=JSON.parse(h.read('docs/reviews/R0-F2-fix-snapshot/manifest.json')),after=JSON.parse(h.read('docs/reviews/R0-F2-fix-snapshot/after-hashes.json'));
  const priorEvidence=JSON.parse(h.read('docs/reviews/R0-F1-independent-review/verification.json'));
  for(const [p,item]of Object.entries(manifest.files)){h.read(item.snapshotCopy);h.read(p);assert.equal(h.hashes[item.snapshotCopy],item.sha256);assert.equal(item.sha256,priorEvidence.sha256[p]);assert.equal(h.hashes[p],after[p].sha256After);}
  for(const p of ['src/lib/maintenance.ts','src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/credit-service.ts','src/lib/security.ts','src/middleware.ts','src/app/admin/maintenance/page.tsx']){h.read(p);assert.equal(h.hashes[p],priorEvidence.sha256[p]);}
  h.read('docs/reviews/R0-F2-fix-report.md');
  const result={capturedAt:new Date().toISOString(),verdict:'PASS bounded H01-H06 source/isolated acceptance. Freeze original F09 (R0-F/F1/F2).',scopeControls:h.cases,observations,comparisons,sha256:h.hashes,
    limits:'Actual route/helper with closed persistence/auth/audit IO. No real MySQL, network, deployment, browser DOM or financial operation. No business source edits.'};
  fs.writeFileSync('docs/reviews/R0-F2-independent-review/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({verdict:result.verdict,scopeControls:h.cases.length,auditObservations:observations.length,oldNewComparisons:comparisons.length,hashes:Object.keys(h.hashes).length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
