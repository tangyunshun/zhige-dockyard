import {describe,it,expect,vi,beforeEach,afterEach,afterAll} from 'vitest';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';import path from 'node:path';
const h=vi.hoisted(()=>({counters:new Map<string,any>(),leases:new Map<string,any>(),serial:0,tail:Promise.resolve() as Promise<any>,beforeLeaseUpdate:null as any,failCounterDecrement:false,workers:[] as any[],workerWaiters:[] as Array<{n:number;resolve:()=>void}>}));
function matches(r:any,w:any):boolean{for(const[k,v]of Object.entries(w||{})){if(v&&typeof v==='object'&&!(v instanceof Date)){for(const[op,x]of Object.entries(v)){if(op==='in'){if(!(x as any[]).includes(r[k]))return false;}else if(op==='gt'){if(!(r[k]>(x as any)))return false;}else if(op==='gte'){if(!(r[k]>=(x as any)))return false;}else if(op==='lt'){if(!(r[k]<(x as any)))return false;}else if(op==='lte'){if(!(r[k]<=(x as any)))return false;}else return false;}}else if(r[k]!==v)return false;}return true;}
function table(name:string){return name==='parselease'?h.leases:h.counters;}
function model(name:string){return {
 create:async({data}:any)=>{const rows=table(name);const all=[...rows.values()];if(all.some(r=>name==='parselease'?(r.leaseId===data.leaseId||r.claimToken===data.claimToken):r.id===data.id)){const e:any=new Error('Unique');e.code='P2002';throw e;}const row={...data,id:data.id||'auto-'+(++h.serial)};rows.set(row.id,row);return {...row};},
 findUnique:async({where}:any)=>{const r=[...table(name).values()].find(r=>matches(r,where));return r?{...r}:null;},
 findMany:async({where,take,select}:any)=>[...table(name).values()].filter(r=>matches(r,where)).slice(0,take??Infinity).map(r=>select?Object.fromEntries(Object.keys(select).filter(k=>select[k]).map(k=>[k,r[k]])):{...r}),
 updateMany:async({where,data}:any)=>{if(name==='parselease'&&h.beforeLeaseUpdate)await h.beforeLeaseUpdate({where,data});if(name==='parseadmissioncounter'&&data?.active?.decrement&&h.failCounterDecrement){h.failCounterDecrement=false;throw new Error('counter decrement unavailable');}let count=0;for(const[id,r]of table(name)){if(!matches(r,where))continue;const next={...r};for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&!(v instanceof Date)&&('increment'in v||'decrement'in v))next[k]=next[k]+((v as any).increment??-((v as any).decrement));else next[k]=v;}table(name).set(id,next);count++;}return {count};},
 deleteMany:async({where}:any)=>{let count=0;for(const[id,r]of table(name))if(matches(r,where)){table(name).delete(id);count++;}return {count};}
};}
function makeDb(){const db:any={parseadmissioncounter:model('parseadmissioncounter'),parselease:model('parselease')};db.$transaction=(fn:any)=>{const result=h.tail.then(async()=>{const beforeC=structuredClone(h.counters),beforeL=structuredClone(h.leases);try{return await fn(db);}catch(e){h.counters=beforeC;h.leases=beforeL;throw e;}});h.tail=result.then(()=>{},()=>{});return result;};return db;}
vi.mock('@/lib/prisma',()=>({prisma:makeDb()}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:true,user:{id:'u1'}}))}));
vi.mock('@/lib/parse-policy',async(importOriginal)=>{const a:any=await importOriginal();return {...a,PARSE_LIMITS:{...a.PARSE_LIMITS,PLATFORM_MAX_CONCURRENT:1,USER_MAX_CONCURRENT:1}};});
const observations:any[]=[];
const now=1_700_000_000_000;
function seed(active=2,work=2){h.counters.set('platform',{id:'platform',active,workUnits:work,requests:0,windowStart:new Date(now)});h.counters.set('user:u1',{id:'user:u1',active,workUnits:0,requests:0,windowStart:new Date(now)});}
function lease(id:string,expired:boolean){const r={id,leaseId:id,claimToken:'token-'+id,userId:'u1',instanceId:'offline',status:'ACTIVE',workUnits:1,leaseUntil:new Date(expired?now-100000:now+100000),createdAt:new Date(now-60000),updatedAt:new Date(now)};h.leases.set(id,r);return r;}
function latch(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
beforeEach(async()=>{h.counters=new Map();h.leases=new Map();h.serial=0;h.tail=Promise.resolve();h.beforeLeaseUpdate=null;h.failCounterDecrement=false;h.workers=[];h.workerWaiters=[];const a=await import('@/lib/parse-admission');a.__setParseAdmissionBackendForTest(null);});
afterEach(async()=>{h.beforeLeaseUpdate=null;const r=await import('@/lib/parse-runner');r.__resetParseRunnerHooks();vi.useRealTimers();});

describe('Current actual Prisma algorithm with condition-aware rollback delegates',()=>{
 it('positive: concurrent sweep returns counters once and full weight',async()=>{
  seed();lease('old',true);lease('healthy',false);const a=await import('@/lib/parse-admission');await Promise.all([a.sweepParseLeases(now),a.sweepParseLeases(now)]);
  expect(h.counters.get('platform').active).toBe(1);expect(h.counters.get('platform').workUnits).toBe(1);expect(h.counters.get('user:u1').active).toBe(1);
  observations.push({name:'concurrent-sweep-positive',active:1,workUnits:1});
 });
 it('positive: weighted release now returns two units, repeats return none',async()=>{
  const a=await import('@/lib/parse-admission');const one=await a.acquireParseLease({userId:'u1',workUnits:2,now});expect(await a.releaseParseLease(one)).toBe(true);expect(await a.releaseParseLease(one)).toBe(false);expect(h.counters.get('platform').workUnits).toBe(0);expect(h.counters.get('platform').active).toBe(0);
  observations.push({name:'weighted-release-positive',active:0,workUnits:0});
 });
 it('positive: twelve completed expiry accounting cycles leave no units',async()=>{
  const a=await import('@/lib/parse-admission');for(let i=0;i<12;i++){const stamp=now+i*200000;await a.acquireParseLease({userId:'u1',workUnits:1,now:stamp});await a.sweepParseLeases(stamp+100000);}expect(h.counters.get('platform').workUnits).toBe(0);expect(h.counters.get('platform').active).toBe(0);
  const next=await a.acquireParseLease({userId:'u1',workUnits:1,now:now+13*200000});await a.releaseParseLease(next);observations.push({name:'expiry-accounting-positive',cycles:12,active:0,workUnits:0});
 });
 it('positive: thrown counter fault rolls back expiry and retry recovers',async()=>{
  seed();lease('old',true);lease('healthy',false);h.failCounterDecrement=true;const a=await import('@/lib/parse-admission');await a.sweepParseLeases(now);expect(h.leases.get('old').status).toBe('ACTIVE');expect(h.counters.get('platform').active).toBe(2);await a.sweepParseLeases(now);expect(h.counters.get('platform').active).toBe(1);expect(h.counters.get('platform').workUnits).toBe(1);
  observations.push({name:'expiry-throw-rollback-positive',active:1,workUnits:1});
 });
 it('defect KR2: zero-row counter update still commits RELEASED',async()=>{
  const a=await import('@/lib/parse-admission');const one=await a.acquireParseLease({userId:'u1',workUnits:1,now});h.counters.get('platform').active=0;const released=await a.releaseParseLease(one);
  expect(released).toBe(true);expect(h.counters.get('platform').workUnits).toBe(1);expect([...h.leases.values()][0].status).toBe('RELEASED');
  observations.push({name:'release-count-zero-still-success',released,leaseStatus:'RELEASED',active:0,workUnits:1,mode:'counter divergence fault injection'});
 });
 it('defect KR2: return weight comes from caller instead of persisted lease',async()=>{
  const a=await import('@/lib/parse-admission');const one=await a.acquireParseLease({userId:'u1',workUnits:2,now});expect(await a.releaseParseLease({...one,workUnits:0})).toBe(true);expect(h.counters.get('platform').workUnits).toBe(2);
  observations.push({name:'release-uses-caller-weight',persistedWeight:2,suppliedWeight:0,remainingWeight:2,mode:'internal API integrity fault, not public client exploit proof'});
 });
 it('defect KR3: slow arrayBuffer outlives acquired lease and still starts after sweep',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner');
  r.__setParseRunnerHooks({workerFactory:()=>{const w=new EventEmitter() as any;w.terminate=async()=>{w.emit('exit',0);return 0;};h.workers.push(w);for(const x of h.workerWaiters)if(h.workers.length>=x.n)x.resolve();return w;}});
  const waitWorkers=(n:number)=>h.workers.length>=n?Promise.resolve():new Promise<void>(resolve=>h.workerWaiters.push({n,resolve}));const entered=latch();let resolveBytes!:(b:ArrayBuffer)=>void;
  const slow=Object.assign(new Blob(['Slow bytes'],{type:'text/plain'}),{name:'slow.txt',arrayBuffer:()=>{entered.resolve();return new Promise<ArrayBuffer>(r=>resolveBytes=r);}});
  const quick=Object.assign(new Blob(['Fast bytes'],{type:'text/plain'}),{name:'fast.txt'});const req=(f:Blob)=>({headers:new Headers({authorization:'Bearer offline'}),formData:async()=>new Map([['file',f]])}) as any;
  const {POST}=await import('@/app/api/studio/extract-text/route');const first=POST(req(slow));await entered.promise;const oldId=[...h.leases.keys()][0];await vi.advanceTimersByTimeAsync(100000);await a.sweepParseLeases(Date.now());expect(h.leases.get(oldId).status).toBe('EXPIRED');
  const second=POST(req(quick));await waitWorkers(1);resolveBytes(new TextEncoder().encode('Slow bytes').buffer);await waitWorkers(2);expect(h.counters.get('platform').active).toBe(1);
  for(const w of h.workers)w.emit('message',{envelope:'result',text:'Controlled parser output',usage:{}});const responses=await Promise.all([first,second]);expect(responses.map(x=>x.status)).toEqual([200,200]);
  observations.push({name:'arraybuffer-expired-request-starts',configuredCap:1,simultaneousWorkers:2,counterActiveBeforeCompletion:1,oldStatus:'EXPIRED',statuses:[200,200]});
 });
 it('defect KR4: actual late worker exit cannot recover quarantined occupancy',async()=>{
  const a=await import('@/lib/parse-admission'),r=await import('@/lib/parse-runner');let fake:any;
  r.__setParseRunnerHooks({terminateTimeoutMs:5,exitConfirmMs:5,workerFactory:()=>{fake=new EventEmitter();fake.terminate=()=>new Promise(()=>{});queueMicrotask(()=>fake.emit('message',{envelope:'result',text:'Controlled output',usage:{}}));return fake;}});
  const f=Object.assign(new Blob(['controlled'],{type:'text/plain'}),{name:'small.txt'}),{POST}=await import('@/app/api/studio/extract-text/route');const res=await POST({headers:new Headers({authorization:'offline'}),formData:async()=>new Map([['file',f]])} as any);expect(res.status).toBe(503);
  const row=[...h.leases.values()][0];expect(row.status).toBe('QUARANTINED');fake.emit('exit',0);await a.sweepParseLeases(Date.now()+200000);expect(h.counters.get('platform').active).toBe(1);expect(h.leases.get(row.id).status).toBe('QUARANTINED');expect(await a.releaseParseLease(row)).toBe(false);await expect(a.acquireParseLease({userId:'u1',workUnits:1,now:Date.now()+300000})).rejects.toMatchObject({code:'PARSE_BUSY'});
  observations.push({name:'late-exit-quarantine-no-recovery',response:503,exitEventObserved:true,workerMode:'Controlled EventEmitter lifecycle double, not real thread exit measurement',status:'QUARANTINED',remainingActive:1,nextAdmission:'PARSE_BUSY'});
 });
});
afterAll(()=>fs.writeFileSync(path.join(process.cwd(),'docs/reviews/R0-K1-implementation-review/admission-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'Current createPrismaBackend and actual route; isolated conditional Prisma models with serialized rollback transactions; controlled lifecycle workers',observations},null,2)));
