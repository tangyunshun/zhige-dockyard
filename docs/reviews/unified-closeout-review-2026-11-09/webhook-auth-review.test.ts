import{it,expect,vi}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({authCalls:0}));
vi.mock('@/lib/prisma',()=>({prisma:{
 user:{findUnique:vi.fn(async()=>({id:'u',status:'active',role:'USER'}))},
 $queryRawUnsafe:vi.fn(async()=>[]),
 webhooksubscription:{findMany:vi.fn(async()=>[{id:'hook',url:'https://fixture.invalid',secret:'FAKE-WEBHOOK-SECRET',events:'[]',active:true}])},
}}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>{h.authCalls++;return{valid:false,error:'FORCED_LOGOUT'};})}));
import{GET}from '@/app/api/webhooks/route';
it('DEFECT: trusted identity header skips complete session validation and exposes webhook material after forced logout',async()=>{
 const r=await GET(new NextRequest('http://audit/webhooks',{headers:{'x-user-id':'u',authorization:'Bearer still-signed-fixture'}}));
 expect(r.status).toBe(200);expect(h.authCalls).toBe(0);expect(JSON.stringify(await r.json())).toContain('FAKE-WEBHOOK-SECRET');
});
