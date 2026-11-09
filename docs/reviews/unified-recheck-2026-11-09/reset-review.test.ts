import {it,expect,vi,beforeEach,afterEach}from 'vitest';
import{NextRequest}from 'next/server';
const h=vi.hoisted(()=>({writes:0}));
vi.mock('@/lib/prisma',()=>({prisma:{user:{findFirst:vi.fn(async()=>({id:'u'})),update:vi.fn(async()=>{h.writes++;return{};})}}}));
vi.mock('@/lib/auth',()=>({hashPassword:vi.fn(async()=> 'fake-hash')}));
vi.mock('@/lib/jwt-config',()=>({getJwtSecretKey:()=>new Uint8Array(32).fill(7)}));
import{MemoryVerificationBackend,__setVerificationBackendForTest,__resetVerificationBackend}from '@/lib/verification-backend';
import{storeVerificationCode}from '@/lib/verification-codes';
import{POST as verify}from '@/app/api/auth/verify-email-code/route';
import{POST as reset}from '@/app/api/auth/reset-password/route';
const base=1700000000000;
const req=(body:unknown)=>new NextRequest('http://audit/auth',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{h.writes=0;vi.useFakeTimers();vi.setSystemTime(base);__setVerificationBackendForTest(new MemoryVerificationBackend());});
afterEach(()=>{__resetVerificationBackend();vi.useRealTimers();});
it('POSITIVE: same reset token cannot be used twice without a new challenge',async()=>{
 await storeVerificationCode('email','fixture@example.com','reset-password','123456');
 const token=(await(await verify(req({email:'fixture@example.com',code:'123456'}))).json()).resetToken;
 const a=await reset(req({resetToken:token,newPassword:'fixture-password'}));const b=await reset(req({resetToken:token,newPassword:'fixture-password'}));
 expect([a.status,b.status]).toEqual([200,400]);expect(h.writes).toBe(1);
});
it('POSITIVE: an already-used signed reset token cannot consume a later challenge',async()=>{
 await storeVerificationCode('email','fixture@example.com','reset-password','123456');
 const token=(await(await verify(req({email:'fixture@example.com',code:'123456'}))).json()).resetToken;
 expect((await reset(req({resetToken:token,newPassword:'first-password'}))).status).toBe(200);
 vi.setSystemTime(base+61000);await storeVerificationCode('email','fixture@example.com','reset-password','654321');
 // 旧 token 绑定的是已消费的 challenge A，不得借新签发的 challenge B 恢复改密权。
 expect((await reset(req({resetToken:token,newPassword:'second-password'}))).status).toBe(400);
 expect(h.writes).toBe(1);
 // 新 challenge B 未被旧 token 误消费：用 B 核验后签出的新 token 仍可正常改密。
 const tokenB=(await(await verify(req({email:'fixture@example.com',code:'654321'}))).json()).resetToken;
 expect((await reset(req({resetToken:tokenB,newPassword:'third-password'}))).status).toBe(200);
 expect(h.writes).toBe(2);
});
