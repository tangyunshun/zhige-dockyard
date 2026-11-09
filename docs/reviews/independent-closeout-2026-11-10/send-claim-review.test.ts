import{it,expect,vi,beforeEach,afterEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({budgets:new Map<string,any>(),claims:new Map<string,any>(),codes:[]as any[],failBudgetKey:''}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:false,error:'UNAUTHORIZED'}))}));
vi.mock('@/lib/mailer',()=>({sendMail:vi.fn(async()=>({ok:true,outcome:'accepted'})),buildVerificationEmailHtml:()=>'<html>fixture</html>'}));
import{PrismaVerificationBackend,__setVerificationBackendForTest,__resetVerificationBackend,__setVerificationModelsForTest,__resetVerificationModels}from '@/lib/verification-backend';
import{POST as send}from '@/app/api/auth/send-email-code/route';
const e=(code:string)=>Object.assign(new Error(code),{code});
function match(row:any,where:any):boolean{return Object.entries(where??{}).every(([k,v])=>{if(v&&typeof v==='object'){if('gt'in v)return Number(row[k])>Number((v as any).gt);if('gte'in v)return Number(row[k])>=Number((v as any).gte);}return row[k]===v;});}
function apply(row:any,data:any){for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&('increment'in v||'decrement'in v))row[k]+=((v as any).increment??-((v as any).decrement));else row[k]=v;}}
function model(rows:Map<string,any>,budget=false){return{
 findUnique:async({where}:any)=>rows.has(where.id)?structuredClone(rows.get(where.id)):null,
 findMany:async({where}:any)=>[...rows.values()].filter(r=>match(r,where)).map(r=>structuredClone(r)),
 create:async({data}:any)=>{if(rows.has(data.id))throw e('P2002');const r={status:'PENDING',...data};rows.set(r.id,r);return structuredClone(r);},
 update:async({where,data}:any)=>{if(budget&&h.failBudgetKey===where.id){h.failBudgetKey='';throw e('P5000');}const r=rows.get(where.id);if(!r||!match(r,where))throw e('P2025');apply(r,data);return structuredClone(r);},
 updateMany:async({where,data}:any)=>{let count=0;for(const r of rows.values())if(match(r,where)){apply(r,data);count++;}return{count};},
};}
let backend:PrismaVerificationBackend;
beforeEach(()=>{
 h.budgets=new Map();h.claims=new Map();h.codes=[];h.failBudgetKey='';
 const sms={findFirst:async()=>h.codes[0]??null,updateMany:async()=>({count:0}),create:async({data}:any)=>{const r={...data,createdAt:new Date()};h.codes.push(r);return r;}};
 __setVerificationModelsForTest(model(h.budgets,true),sms,model(h.claims));backend=new PrismaVerificationBackend();__setVerificationBackendForTest(backend);
});
afterEach(()=>{__resetVerificationModels();__resetVerificationBackend();});
const args=(target:string)=>({channel:'email'as const,target,purpose:'register'as const});
it('POSITIVE: identified duplicate failed result now leaves the other send reservation intact',async()=>{
 const a=await backend.admitSend(args('a@example.com'));await backend.admitSend(args('b@example.com'));
 await backend.onSendResult(args('a@example.com'),'failed',a.sendId);await backend.onSendResult(args('a@example.com'),'failed',a.sendId);
 expect(h.budgets.get('platform').count).toBe(1);expect(h.budgets.get('target:email:b@example.com').count).toBe(1);
});
it('DEFECT: REFUNDED is committed before failed counter release, so replay cannot finish refund',async()=>{
 const a=await backend.admitSend(args('a@example.com'));h.failBudgetKey='platform';
 await backend.onSendResult(args('a@example.com'),'failed',a.sendId);await backend.onSendResult(args('a@example.com'),'failed',a.sendId);
 expect(h.claims.get(a.sendId+':platform').status).toBe('REFUNDED');expect(h.budgets.get('platform').count).toBe(1);
});
it('DEFECT: legacy result without send identity can still refund another send platform reservation',async()=>{
 await backend.admitSend(args('a@example.com'));await backend.admitSend(args('b@example.com'));
 await backend.onSendResult(args('a@example.com'),'failed');await backend.onSendResult(args('a@example.com'),'failed');
 expect(h.budgets.get('platform').count).toBe(0);expect(h.budgets.get('target:email:b@example.com').count).toBe(1);
});
it('DEFECT: successful accepted mail leaves persisted send claims PENDING',async()=>{
 const r=await send(new NextRequest('http://audit/send',{method:'POST',body:JSON.stringify({email:'sent@example.com',type:'register'})}));
 expect(r.status).toBe(200);expect(h.claims.size).toBe(2);expect([...h.claims.values()].every(r=>r.status==='PENDING')).toBe(true);
});
