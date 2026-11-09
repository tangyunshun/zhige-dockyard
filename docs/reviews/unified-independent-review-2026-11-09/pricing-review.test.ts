import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('@/lib/security',()=>({requirePlatformPermission:vi.fn(async()=>({authorized:true,user:{id:'admin'}}))}));
vi.mock('@/lib/model-pricing',()=>({MAX_MARKUP_BPS:100000}));
vi.mock('@/lib/prisma',()=>({prisma:{
 modelpricing:{updateMany:vi.fn(async()=>({count:7})),count:vi.fn(async()=>7)},
 modelpricingperiod:{updateMany:vi.fn(async()=>({count:3}))},
 systemconfig:{findUnique:vi.fn(async()=>({value:'2000'})),upsert:vi.fn(async()=>({}))},
 operationlog:{create:vi.fn(async()=>{throw new Error('audit unavailable');})},
 $transaction:vi.fn(async(x:any)=>Promise.all(x)),
}}));
import{POST}from '@/app/api/admin/model-pricing/global-markup/route';
it('DEFECT: successful price updates report zero rows and audit failure is still success',async()=>{
 const r=await POST(new NextRequest('http://audit/pricing',{method:'POST',body:JSON.stringify({percent:20,scope:'all'})}));
 const body=await r.json();expect(r.status).toBe(200);expect(body.success).toBe(true);expect(body.data.modelRows).toBe(0);expect(body.data.periodRows).toBe(0);
});
