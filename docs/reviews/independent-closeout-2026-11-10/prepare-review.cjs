const fs=require('node:fs'),path=require('node:path');const out=__dirname;
let payment=fs.readFileSync('src/app/api/__tests__/r0y-payment-u04.test.ts','utf8');
payment+=`
describe('Independent cross-state receipt ownership',()=>{
 it('DEFECT: transaction first registered as SUCCESS-order difference can still fulfill another pending order',async()=>{
  seed('A',{status:'SUCCESS',metadata:{gatewayTransactionId:'ORIGINAL'}});
  await fulfillPaidOrder(real('A',{gatewayTransactionId:'SECOND'}));
  expect(Object.values(state.orders).some((x:any)=>x.status==='DIFF_FACT'&&x.metadata?.gatewayTransactionId==='SECOND')).toBe(true);
  seed('B');const r=await fulfillPaidOrder(real('B',{gatewayTransactionId:'SECOND'}));
  expect(r.status).toBe('FULFILLED');expect(state.grantCalls).toBe(1);
 });
});`;
fs.writeFileSync(path.join(out,'payment-review.test.ts'),payment);
let admission=fs.readFileSync('docs/reviews/unified-closeout-review-2026-11-09/admission-review.test.ts','utf8');
admission=admission.slice(0,admission.indexOf("describe('Current actual"));
admission=admission.replace("if(op==='in'){", "if(op==='startsWith'){if(!String(r[k]??'').startsWith(String(x)))return false;}else if(op==='in'){");
admission+=`
it('POSITIVE: ACTIVE expiry now quarantines without freeing any unknown worker capacity',async()=>{
 seed(1,1);lease('old',true);const a=await import('@/lib/parse-admission');await a.sweepParseLeases(now);
 expect(h.leases.get('old').status).toBe('QUARANTINED');expect(h.counters.get('platform').active).toBe(1);
});
it('POSITIVE: confirmed direct release still returns persisted weight once',async()=>{
 const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:2,now});
 expect(await a.releaseParseLease(l)).toBe(true);expect(await a.releaseParseLease(l)).toBe(false);expect(h.counters.get('platform').workUnits).toBe(0);
});
it('DEFECT: EXIT_CONFIRMED fallback cannot update an already-QUARANTINED lease after release failure',async()=>{
 const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:1,now});await a.quarantineParseLease(l,'STOP_UNCONFIRMED');
 h.failCounterDecrement=true;expect(await a.releaseParseLease(l)).toBe(false);
 await a.quarantineParseLease(l,'EXIT_CONFIRMED: actual late exit observed, release failed');
 const row=[...h.leases.values()][0];expect(row.note).toBe('STOP_UNCONFIRMED');
 await a.sweepParseLeases(now+200000);expect(h.counters.get('platform').active).toBe(1);expect([...h.leases.values()][0].status).toBe('QUARANTINED');
});
it('DEFECT: exit arriving inside quarantine update is ignored before route quarantine flag is set',async()=>{
 const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner');let w:any;
 r.__setParseRunnerHooks({terminateTimeoutMs:5,exitConfirmMs:5,workerFactory:()=>{w=new EventEmitter();w.terminate=()=>new Promise(()=>{});queueMicrotask(()=>w.emit('message',{envelope:'result',text:'controlled fixture',usage:{}}));return w;}});
 h.beforeLeaseUpdate=({data}:any)=>{if(data.status==='QUARANTINED')w.emit('exit',0);};
 const f=Object.assign(new Blob(['fixture'],{type:'text/plain'}),{name:'fixture.txt'});const {POST}=await import('@/app/api/studio/extract-text/route');
 const res=await POST({headers:new Headers(),formData:async()=>new Map([['file',f]])}as any);expect(res.status).toBe(503);
 await new Promise(resolve=>setTimeout(resolve,10));await a.sweepParseLeases(Date.now()+200000);
 expect(h.counters.get('platform').active).toBe(1);expect([...h.leases.values()][0].status).toBe('QUARANTINED');
});`;
admission+=`
it('DEFECT: cancelled stalled arrayBuffer read has no finite completion boundary',async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);
 const entered=latch();let resume!:(b:ArrayBuffer)=>void;let done=false;
 const f=Object.assign(new Blob(['fixture'],{type:'text/plain'}),{name:'fixture.txt',arrayBuffer:()=>{entered.resolve();return new Promise<ArrayBuffer>(r=>resume=r);}});
 const controller=new AbortController();const {POST}=await import('@/app/api/studio/extract-text/route');
 const p=POST({headers:new Headers(),signal:controller.signal,formData:async()=>new Map([['file',f]])}as any).then(r=>{done=true;return r;});
 await entered.promise;controller.abort();await vi.advanceTimersByTimeAsync(120000);expect(done).toBe(false);
 resume(new TextEncoder().encode('fixture').buffer);expect((await p).status).toBe(503);
 const a=await import('@/lib/parse-admission');const l=[...h.leases.values()][0];if(l)await a.releaseParseLease(l);
});`;
fs.writeFileSync(path.join(out,'parse-review.test.ts'),admission);
fs.copyFileSync('docs/reviews/unified-closeout-review-2026-11-09/business-modules-review.test.ts',path.join(out,'business-modules-review.test.ts'));
let redirect=fs.readFileSync('src/app/auth/login/page.tsx','utf8').match(/function sanitizeInternalRedirect[\s\S]*?\n}/)[0];
const ts=require('typescript');const js=ts.transpileModule(redirect,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
fs.writeFileSync(path.join(out,'redirect-fixture.js'),js+'\nmodule.exports=sanitizeInternalRedirect;\n');
console.log('Prepared fresh audit-only route/state fixtures; prior evidence and source not edited.');
