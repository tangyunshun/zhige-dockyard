import{it,expect,vi,beforeEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({modelBps:2000,configBps:2000,periodBps:2000,version:1,auditFail:false,transactions:0}));
vi.mock('@/lib/security',()=>({requirePlatformPermission:vi.fn(async()=>({authorized:true,user:{id:'admin'}}))}));
vi.mock('@/lib/model-pricing',()=>({MAX_MARKUP_BPS:100000}));
vi.mock('@/lib/prisma',()=>{
 const defer=(run:()=>any)=>({then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)});
 return{prisma:{
  modelpricing:{updateMany:({data}:any)=>defer(()=>{h.modelBps=data.markupRateBps;h.version++;return{count:7};}),count:vi.fn(async()=>7)},
  modelpricingperiod:{updateMany:({data}:any)=>defer(()=>{h.periodBps=data.markupRateBps;return{count:3};})},
  systemconfig:{findUnique:vi.fn(async()=>({value:String(h.configBps)})),upsert:({update}:any)=>defer(()=>{h.configBps=Number(update.value);return{};})},
  operationlog:{create:()=>defer(()=>{if(h.auditFail)throw new Error('audit failure');return{};})},
  $transaction:async(ops:any[])=>{h.transactions++;const before={...h};try{return await Promise.all(ops);}catch(e){Object.assign(h,before);throw e;}},
 }};
});
import{POST}from '@/app/api/admin/model-pricing/global-markup/route';
const req=()=>new NextRequest('http://audit/markup',{method:'POST',body:JSON.stringify({percent:30,scope:'all'})});
beforeEach(()=>Object.assign(h,{modelBps:2000,configBps:2000,periodBps:2000,version:1,auditFail:false,transactions:0}));
it('POSITIVE: successful global update now reports actual row counts',async()=>{
 const r=await POST(req());const b=await r.json();expect(r.status).toBe(200);expect([b.data.modelRows,b.data.periodRows]).toEqual([7,3]);
});
it('POSITIVE: audit failure rolls back the whole sync (price/default/version unchanged, single transaction)',async()=>{
 h.auditFail=true;const r=await POST(req());expect(r.status).toBe(500);
 expect([h.modelBps,h.periodBps,h.configBps,h.version]).toEqual([2000,2000,2000,1]);
 expect(h.transactions).toBe(1);
});
