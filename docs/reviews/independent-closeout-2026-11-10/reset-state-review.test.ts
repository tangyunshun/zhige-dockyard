import{it,expect,vi,beforeEach,afterEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({alias:false,claim:null as any,challengeId:'',writes:0,password:'OLD',failUser:false,failAdvance:false,tail:Promise.resolve()as Promise<any>}));
vi.mock('@/lib/prisma',()=>{
 const claim={
  findUnique:vi.fn(async()=>h.claim?structuredClone(h.claim):null),
  create:vi.fn(async({data}:any)=>{if(h.claim)throw Object.assign(new Error('unique'),{code:'P2002'});h.claim={...data};return structuredClone(h.claim);}),
  update:vi.fn(async({data}:any)=>{if(h.failAdvance&&data.status==='AUTH_CONSUMED'){h.failAdvance=false;throw new Error('fixture claim advance failed');}Object.assign(h.claim,data);return structuredClone(h.claim);}),
 };
 const db:any={passwordResetClaim:claim,
  user:{findFirst:vi.fn(async()=>({id:'u'})),update:vi.fn(async({data}:any)=>{if(h.failUser){h.failUser=false;throw new Error('fixture password write failed');}h.password=data.password;h.writes++;return{id:'u'};})},
 };
 Object.defineProperty(db,'passwordresetclaim',{get:()=>h.alias?claim:undefined});
 db.$transaction=(fn:any)=>{const r=h.tail.then(async()=>{const before={claim:structuredClone(h.claim),password:h.password,writes:h.writes};try{return await fn(db);}catch(e){Object.assign(h,before);throw e;}});h.tail=r.catch(()=>{});return r;};
 return{prisma:db};
});
vi.mock('@/lib/auth',()=>({hashPassword:vi.fn(async(s:string)=>'HASH:'+s)}));
vi.mock('@/lib/jwt-config',()=>({getJwtSecretKey:()=>new Uint8Array(32).fill(4)}));
vi.mock('jose',()=>({jwtVerify:vi.fn(async()=>({payload:{email:'fixture@example.com',purpose:'reset_password',challengeId:h.challengeId,jti:'grant-fixture'}}))}));
import{MemoryVerificationBackend,__setVerificationBackendForTest,__resetVerificationBackend}from '@/lib/verification-backend';
import{storeVerificationCode,verifyVerificationCode}from '@/lib/verification-codes';
import{POST}from '@/app/api/auth/reset-password/route';
const req=(password='fixture-password')=>new NextRequest('http://audit/reset',{method:'POST',body:JSON.stringify({resetToken:'verified-fixture',newPassword:password})});
beforeEach(async()=>{
 Object.assign(h,{alias:false,claim:null,writes:0,password:'OLD',failUser:false,failAdvance:false,tail:Promise.resolve()});
 __setVerificationBackendForTest(new MemoryVerificationBackend());
 await storeVerificationCode('email','fixture@example.com','reset-password','123456');
 h.challengeId=(await verifyVerificationCode('email','fixture@example.com','reset-password','123456')).challengeId!;
});
afterEach(()=>__resetVerificationBackend());
it('DEFECT: schema-derived passwordResetClaim delegate exists but route looks up passwordresetclaim and returns 503',async()=>{
 const r=await POST(req());expect(r.status).toBe(503);expect(h.writes).toBe(0);expect((await r.json()).code).toBe('RESET_CLAIM_NOT_READY');
});
it('POSITIVE BEHIND DELEGATE ALIAS: password write failure can retry after durable AUTH_CONSUMED state',async()=>{
 h.alias=true;h.failUser=true;expect((await POST(req())).status).toBe(500);expect(h.claim.status).toBe('AUTH_CONSUMED');
 expect((await POST(req())).status).toBe(200);expect(h.writes).toBe(1);
});
it('DEFECT BEHIND DELEGATE ALIAS: consumed OTP with failed AUTH_CONSUMED update is permanently stuck PENDING',async()=>{
 h.alias=true;h.failAdvance=true;
 expect((await POST(req())).status).toBe(500);expect(h.claim.status).toBe('PENDING');
 expect((await POST(req())).status).toBe(400);expect(h.writes).toBe(0);
});
it('DEFECT BEHIND DELEGATE ALIAS: concurrent AUTH_CONSUMED retries both commit different passwords',async()=>{
 h.alias=true;h.claim={id:'grant-fixture',userId:'u',challengeId:h.challengeId,status:'AUTH_CONSUMED'};
 const r=await Promise.all([POST(req('password-one')),POST(req('password-two'))]);
 expect(r.map(x=>x.status)).toEqual([200,200]);expect(h.writes).toBe(2);
});
