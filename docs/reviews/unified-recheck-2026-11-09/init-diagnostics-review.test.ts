import{it,expect,vi,beforeEach,afterEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({users:[]as any[],claimed:false,authorized:false,reads:0,tail:Promise.resolve()as Promise<any>}));
vi.mock('@/lib/prisma',()=>{
 const prisma:any={
  user:{count:vi.fn(async()=>h.users.length),create:vi.fn(async({data}:any)=>{const row={id:'fixture-admin',...data};h.users.push(row);return row;})},
  systemconfig:{create:vi.fn(async()=>{if(h.claimed)throw Object.assign(new Error('unique'),{code:'P2002'});h.claimed=true;return{};})},
  workspacequota:{findMany:vi.fn(async()=>{h.reads++;return[];})},workspacemember:{findMany:vi.fn(async()=>{h.reads++;return[];})},
 };
 prisma.$transaction=(fn:any)=>{const r=h.tail.then(async()=>{const users=structuredClone(h.users),claimed=h.claimed;try{return await fn(prisma);}catch(e){h.users=users;h.claimed=claimed;throw e;}});h.tail=r.catch(()=>{});return r;};
 return{prisma};
});
vi.mock('@/lib/auth',()=>({hashPassword:vi.fn(async()=> 'fake-hash'),validatePasswordStrength:vi.fn(()=>({valid:true}))}));
vi.mock('@/lib/security',()=>({requirePlatformPermission:vi.fn(async()=>({authorized:h.authorized,errorResponse:new Response('{}',{status:403})}))}));
import{POST as init}from '@/app/api/auth/init-admin/route';
import{POST as setup}from '@/app/api/auth/verify-setup-token/route';
import{GET as debug}from '@/app/api/health/debug-test01/route';
const req=(body:unknown)=>new NextRequest('http://audit/init',{method:'POST',body:JSON.stringify(body)});
const wizardBody={name:'fixture',email:'fixture@example.com',phone:'',password:'fixture-password'};
async function grant():Promise<string>{
 const r=await setup(req({token:'FAKE-SETUP-ONLY'}));
 expect(r.status).toBe(200);
 const b=await r.json();
 expect(b.success).toBe(true);
 expect(typeof b.initToken).toBe('string');
 return b.initToken as string;
}
beforeEach(()=>{h.users=[];h.claimed=false;h.authorized=false;h.reads=0;h.tail=Promise.resolve();vi.stubEnv('SETUP_TOKEN','FAKE-SETUP-ONLY');});
afterEach(()=>vi.unstubAllEnvs());
it('POSITIVE: no initialization credential denies administrator creation',async()=>{
 const r=await init(req({name:'fixture',password:'fixture-password'}));
 expect(r.status).toBe(403);expect(h.users.length).toBe(0);
});
it('POSITIVE: forged or wrong-purpose credential is denied',async()=>{
 expect((await init(req({...wizardBody,initToken:'FAKE-INIT-ONLY'}))).status).toBe(403);
 expect((await init(req({...wizardBody,initToken:'a.b'}))).status).toBe(403);
 expect(h.users.length).toBe(0);
});
it('POSITIVE: concurrent valid wizard authorization gives at most one creation under unique transactional delegate',async()=>{
 const t=await grant();
 const r=await Promise.all([init(req({...wizardBody,initToken:t})),init(req({...wizardBody,initToken:t}))]);
 expect(r.map(x=>x.status).sort()).toEqual([200,400]);expect(h.users.length).toBe(1);
});
it('POSITIVE: the real wizard flow completes; setup alone grants no creation; replay is rejected',async()=>{
 // 只验证第一步、不带授权直接创建 → 有明确提示且拒绝
 const setupRes=await setup(req({token:'FAKE-SETUP-ONLY'}));
 expect(setupRes.status).toBe(200);
 const missing=await init(req(wizardBody));
 expect(missing.status).toBe(403);
 expect((await missing.json()).message).toContain('授权');
 expect(h.users.length).toBe(0);
 // 合法向导：第一步取得授权 → 第二步携带 → 创建成功
 const t=await grant();
 const created=await init(req({...wizardBody,initToken:t}));
 expect(created.status).toBe(200);expect(h.users.length).toBe(1);
 // 旧授权重放：不可二次创建
 const replay=await init(req({...wizardBody,initToken:t}));
 expect(replay.status).toBe(400);expect(h.users.length).toBe(1);
});
it('POSITIVE: denied health debug performs no private-data query',async()=>{
 const r=await debug(new Request('http://audit/health/debug'));expect(r.status).toBe(403);expect(h.reads).toBe(0);
});
