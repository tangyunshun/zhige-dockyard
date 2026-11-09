import{it,expect,vi,beforeEach,afterEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({sessions:0}));
vi.mock('@/lib/prisma',()=>({prisma:{
 user:{findFirst:vi.fn(async()=>({id:'fixture-user',status:'active',role:'USER',phone:'13800138000',email:'fixture@example.com',name:'fixture',lastLoginAt:null,sessionToken:null})),findUnique:vi.fn(async()=>({allowMultiDevice:false})),update:vi.fn(async({data}:any)=>{if(data.sessionToken)h.sessions++;return{};})},
 userdevice:{findMany:vi.fn(async()=>[]),updateMany:vi.fn(async()=>({count:0})),create:vi.fn(async()=>({}))},
 operationlog:{create:vi.fn(async()=>({}))},loginhistory:{create:vi.fn(async()=>({}))},
}}));
vi.mock('@/lib/jwt-config',()=>({getJwtSecretKey:()=>new Uint8Array(32).fill(8)}));
vi.mock('@/lib/session-cache',()=>({sessionCache:new Map()}));
vi.mock('@/lib/account-deletion',()=>({maybeFinalizeDeletionIfDue:vi.fn(async()=>false)}));
import{MemoryVerificationBackend,__setVerificationBackendForTest,__resetVerificationBackend}from '@/lib/verification-backend';
import{storeSmsCode}from '@/lib/sms-store';
import{POST}from '@/app/api/auth/login-sms/route';
const req=()=>new NextRequest('http://audit/login-sms',{method:'POST',body:JSON.stringify({phone:'13800138000',smsCode:'123456',rememberMe:false})});
beforeEach(async()=>{h.sessions=0;__setVerificationBackendForTest(new MemoryVerificationBackend());await storeSmsCode('13800138000','123456','login');});
afterEach(()=>__resetVerificationBackend());
it('POSITIVE: sequential replay after login is denied',async()=>{
 expect((await POST(req())).status).toBe(200);expect((await POST(req())).status).toBe(400);expect(h.sessions).toBe(1);
});
it('POSITIVE: concurrent requests yield at most one valid session via atomic consumption',async()=>{
 const r=await Promise.all([POST(req()),POST(req())]);
 expect(r.filter(x=>x.status===200).length).toBe(1);expect(h.sessions).toBe(1);
});
