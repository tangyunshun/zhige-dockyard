import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{}}));
import{PrismaVerificationBackend,__setVerificationModelsForTest,__resetVerificationModels,__setVerificationBackendForTest,__resetVerificationBackend,VERIFY_POLICY}from '@/lib/verification-backend';
import{storeVerificationCode,verifyVerificationCode,consumeVerificationCode}from '@/lib/verification-codes';
const base=1700000000000;
let rows:Map<string,any>,codes:any[],backend:PrismaVerificationBackend;
const err=(code:string)=>Object.assign(new Error(code),{code});
function match(row:any,where:any):boolean{return Object.entries(where).every(([k,v])=>{
  if(v&&typeof v==='object'&&!Array.isArray(v)&&('gt'in v||'gte'in v||'lt'in v||'lte'in v)){
    if('gt'in v)return Number(row[k])>Number(v.gt);
    if('gte'in v)return Number(row[k])>=Number(v.gte);
    if('lt'in v)return Number(row[k])<Number(v.lt);
    if('lte'in v)return Number(row[k])<=Number(v.lte);
  }
  return row[k]===v;
});}
function apply(row:any,data:any){for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&('increment'in v||'decrement'in v))row[k]+=((v as any).increment??-((v as any).decrement));else row[k]=v;}}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(base);rows=new Map();codes=[];
 const budget={
  findUnique:async({where}:any)=>rows.has(where.id)?{...rows.get(where.id)}:null,
  // 忠实模拟 id 主键唯一：并发冷启动只有一笔 create 成功，其余抛 P2002。
  create:async({data}:any)=>{if(rows.has(data.id))throw err('P2002');rows.set(data.id,{...data});return{...data};},
  upsert:async({where,create,update}:any)=>{if(!rows.has(where.id))rows.set(where.id,{...create});else apply(rows.get(where.id),update);return{...rows.get(where.id)};},
  update:async({where,data}:any)=>{const r=rows.get(where.id);if(!r||!match(r,where))throw err('P2025');apply(r,data);return{...r};},
 };
 const sms={
  findFirst:async({where}:any)=>{const r=[...codes].reverse().find(r=>match(r,where));return r?{...r}:null;},
  create:async({data}:any)=>{const r={...data,createdAt:new Date()};codes.push(r);return{...r};},
  updateMany:async({where,data}:any)=>{let count=0;for(const r of codes)if(match(r,where)){apply(r,data);count++;}return{count};},
 };
 __setVerificationModelsForTest(budget,sms);backend=new PrismaVerificationBackend();__setVerificationBackendForTest(backend);
});
afterEach(()=>{__resetVerificationModels();__resetVerificationBackend();vi.useRealTimers();});
it('POSITIVE: sequential resend now enforces sixty seconds',async()=>{
 expect((await storeVerificationCode('email','seq@example.com','register','123456')).ok).toBe(true);
 expect((await storeVerificationCode('email','seq@example.com','register','654321')).status).toBe(429);
});
it('POSITIVE: cold-start race admits exactly one and counts it once (no double-admit, budget==admitted)',async()=>{
 const args={channel:'email' as const,target:'race@example.com',purpose:'register' as const};
 const r=await Promise.all([backend.admitSend(args),backend.admitSend(args)]);
 expect(r[0].ok).toBe(true);
 expect(r[1].ok).toBe(false);
 expect(r[1].status).toBe(429);
 expect(rows.get('platform').count).toBe(1);
 expect(rows.get('target:email:race@example.com').count).toBe(1);
});
it('POSITIVE: five wrong attempts lock verification so the correct code is rejected',async()=>{
 await storeVerificationCode('email','lock@example.com','reset-password','123456');
 for(let i=0;i<5;i++)await verifyVerificationCode('email','lock@example.com','reset-password','wrong');
 expect(Number(rows.get('target:email:lock@example.com').lockedUntil)).toBeGreaterThan(base);
 expect((await verifyVerificationCode('email','lock@example.com','reset-password','123456')).valid).toBe(false);
});
it('POSITIVE: expired challenge cannot be consumed',async()=>{
 await storeVerificationCode('email','expiry@example.com','reset-password','123456');
 vi.setSystemTime(base+VERIFY_POLICY.codeExpiryMs+1);
 expect((await verifyVerificationCode('email','expiry@example.com','reset-password','123456')).valid).toBe(false);
 expect((await consumeVerificationCode('email','expiry@example.com','reset-password')).ok).toBe(false);
});
it('POSITIVE: expired daily window resets count to 1 (not increment), and a later send within the new window succeeds',async()=>{
 rows.set('target:email:daily@example.com',{id:'target:email:daily@example.com',count:10,windowStart:base-VERIFY_POLICY.dailyWindowMs-1,lastSentAt:base-100000,failCount:0,lockedUntil:0,version:1});
 const args={channel:'email' as const,target:'daily@example.com',purpose:'register' as const};
 expect((await backend.admitSend(args)).ok).toBe(true);expect(rows.get('target:email:daily@example.com').count).toBe(1);
 vi.setSystemTime(base+60001);expect((await backend.admitSend(args)).ok).toBe(true);expect(rows.get('target:email:daily@example.com').count).toBe(2);
});
it('POSITIVE: repeated failed-rollback never drives budget below zero',async()=>{
 const args={channel:'email' as const,target:'failed@example.com',purpose:'register' as const};
 await backend.admitSend(args);await backend.onSendResult(args,'failed');await backend.onSendResult(args,'failed');
 expect(rows.get('platform').count).toBe(0);expect(rows.get('target:email:failed@example.com').count).toBe(0);
});
