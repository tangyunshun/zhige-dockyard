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
describe('Production Prisma admission implementation with isolated condition-evaluating models',()=>{
 it('positive: real backend enforces cap, atomic rollback and single release',async()=>{
  const a=await import('@/lib/parse-admission');const input={userId:'u1',workUnits:1,now,limits:{platformMaxConcurrent:2,userMaxConcurrent:2}};const one=await a.acquireParseLease(input);await a.acquireParseLease(input);await expect(a.acquireParseLease(input)).rejects.toMatchObject({code:'PARSE_BUSY'});expect(h.counters.get('platform').active).toBe(2);expect(await a.releaseParseLease(one)).toBe(true);expect(await a.releaseParseLease(one)).toBe(false);expect(h.counters.get('platform').active).toBe(1);
  observations.push({name:'actual-backend-admission-positive',active:1,workUnits:h.counters.get('platform').workUnits});
 });
 it('defect K03: two sweepers return one expired lease twice and admit beyond true active cap',async()=>{
  seed();lease('old',true);lease('healthy',false);const both=latch(),allowA=latch(),allowB=latch();let arrivals=0;
  h.beforeLeaseUpdate=async({data}:any)=>{if(data.status==='EXPIRED'){arrivals++;if(arrivals===1){await both.promise;await allowA.promise;}else if(arrivals===2){both.resolve();await allowB.promise;}}};
  const a=await import('@/lib/parse-admission');const p=a.sweepParseLeases(now);const q=a.sweepParseLeases(now);await both.promise;allowA.resolve();await p;allowB.resolve();await q;
  expect(h.counters.get('platform').active).toBe(0);expect([...h.leases.values()].filter(r=>r.status==='ACTIVE').length).toBe(1);h.beforeLeaseUpdate=null;await a.acquireParseLease({userId:'u1',workUnits:1,now,limits:{platformMaxConcurrent:1,userMaxConcurrent:1}});
  expect([...h.leases.values()].filter(r=>r.status==='ACTIVE').length).toBe(2);
  observations.push({name:'double-sweep-capacity-underflow',sweeperArrivals:arrivals,counterActive:h.counters.get('platform').active,actualActive:2,configuredActiveCap:1,workUnits:h.counters.get('platform').workUnits});
 });
 it('defect K03: expiry leaves work units occupied and eventually blocks an empty platform',async()=>{
  const a=await import('@/lib/parse-admission');for(let i=0;i<12;i++){const stamp=now+i*200000;await a.acquireParseLease({userId:'u1',workUnits:1,now:stamp});await a.sweepParseLeases(stamp+100000);}
  expect(h.counters.get('platform').active).toBe(0);expect(h.counters.get('platform').workUnits).toBe(12);expect([...h.leases.values()].some(r=>r.status==='ACTIVE')).toBe(false);await expect(a.acquireParseLease({userId:'u1',workUnits:1,now:now+13*200000})).rejects.toMatchObject({code:'PARSE_BUSY'});
  observations.push({name:'expiry-work-units-leak',cycles:12,counterActive:0,actualActive:0,workUnits:12,nextAdmission:'PARSE_BUSY'});
 });
 it('defect K03: status commit followed by counter failure leaves unrecoverable active counter',async()=>{
  seed();lease('old',true);lease('healthy',false);h.failCounterDecrement=true;const a=await import('@/lib/parse-admission');await a.sweepParseLeases(now);await a.sweepParseLeases(now);
  expect(h.leases.get('old').status).toBe('EXPIRED');expect(h.counters.get('platform').active).toBe(2);expect([...h.leases.values()].filter(r=>r.status==='ACTIVE').length).toBe(1);
  observations.push({name:'sweep-partial-commit-no-recovery',oldStatus:h.leases.get('old').status,counterActive:2,actualActive:1});
 });
 it('defect K03: weighted lease release returns only one work unit',async()=>{
  const a=await import('@/lib/parse-admission');const r=await a.acquireParseLease({userId:'u1',workUnits:2,now});expect(await a.releaseParseLease(r)).toBe(true);expect(h.counters.get('platform').active).toBe(0);expect(h.counters.get('platform').workUnits).toBe(1);
  observations.push({name:'weighted-release-leak',acquiredWorkUnits:2,counterActive:0,remainingWorkUnits:1});
 });
 it('defect K01/K03: slow form-data outlives lease; expired request starts worker after capacity was reallocated',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const a=await import('@/lib/parse-admission');const {__setParseRunnerHooks}=await import('@/lib/parse-runner');
  __setParseRunnerHooks({workerFactory:()=>{const w=new EventEmitter() as any;w.terminate=async()=>{w.emit('exit',0);return 0;};h.workers.push(w);for(const x of h.workerWaiters)if(h.workers.length>=x.n)x.resolve();return w;}});
  const waitWorkers=(n:number)=>h.workers.length>=n?Promise.resolve():new Promise<void>(resolve=>h.workerWaiters.push({n,resolve}));
  const {POST}=await import('@/app/api/studio/extract-text/route');const entered=latch();let resolveForm!:(m:any)=>void;
  const f=Object.assign(new Blob(['Controlled upload body'],{type:'text/plain'}),{name:'small.txt'});
  const req=(delayed:boolean)=>({headers:new Headers({authorization:'Bearer offline'}),formData:()=>delayed?(entered.resolve(),new Promise(r=>resolveForm=r)):Promise.resolve(new Map([['file',f]]))}) as any;
  const first=POST(req(true));await entered.promise;const oldId=[...h.leases.keys()][0];await vi.advanceTimersByTimeAsync(100000);await a.sweepParseLeases(Date.now());expect(h.leases.get(oldId).status).toBe('EXPIRED');
  const second=POST(req(false));await waitWorkers(1);resolveForm(new Map([['file',f]]));await waitWorkers(2);expect(h.workers.length).toBe(2);expect(h.counters.get('platform').active).toBe(1);
  for(const w of h.workers)w.emit('message',{envelope:'result',text:'Controlled parser output',usage:{}});const responses=await Promise.all([first,second]);expect(responses.map(r=>r.status)).toEqual([200,200]);
  observations.push({name:'expired-request-starts-without-lease',configuredPlatformCap:1,simultaneousWorkers:2,oldLeaseStatus:h.leases.get(oldId).status,statuses:responses.map(r=>r.status),elapsedBeforeOriginalWorkerMs:100000});
 });
});
afterAll(()=>fs.writeFileSync(path.join(process.cwd(),'docs/reviews/R0-K1-independent-review/admission-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'actual createPrismaBackend implementation, no backend override; memory models evaluate WHERE/update/uniqueness; serialized rollback-capable transactions; sweep races use explicit barriers; no live DB',observations},null,2)));
