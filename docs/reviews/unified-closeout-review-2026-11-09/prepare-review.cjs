const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const out=__dirname;
const ref=path.join(out,'reference');fs.mkdirSync(ref,{recursive:true});
for(const p of ['docs/reviews/full-plan-dispatch-2026-11-08/SCOPE-MAP.md','docs/reviews/full-plan-dispatch-2026-11-08/ALL-INSTRUCTIONS.md','docs/reviews/full-plan-dispatch-2026-11-08/DECISION-GATES.md']){
 fs.writeFileSync(path.join(ref,path.basename(p)),cp.execFileSync('git',['show','6724345:'+p]));
}
const prev='docs/reviews/unified-recheck-2026-11-09';
const oldHashes=JSON.parse(fs.readFileSync(path.join(prev,'artifact-sha256.json'),'utf8')).artifacts;
const altered=[];for(const row of oldHashes.filter(x=>x.path.endsWith('.test.ts'))){const p=path.join(prev,row.path);if(!fs.existsSync(p))altered.push({path:row.path,state:'missing'});else{const hash=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(hash!==row.sha256)altered.push({path:row.path,oldSHA256:row.sha256,currentSHA256:hash});}}
fs.writeFileSync(path.join(out,'prior-audit-alterations.json'),JSON.stringify(altered,null,2));
for(const file of ['admission-review.test.ts','business-modules-review.test.ts'])fs.copyFileSync(path.join(prev,file),path.join(out,file));
for(const file of ['r0y-payment-u04.test.ts','r0l3-verification-fixes.test.ts','r0g-security.test.ts','r0z-init-wizard.test.ts','r0u-auth-challenge.test.ts','r0e-byo-dest.test.ts','r0d-global-markup.test.ts','r0f-mailer.test.ts']){
 const source=fs.readFileSync(path.join('src/app/api/__tests__',file),'utf8');
 const auditName=({
 'r0y-payment-u04.test.ts':'payment-review.test.ts','r0l3-verification-fixes.test.ts':'verification-review.test.ts',
 'r0g-security.test.ts':'security-positive.test.ts','r0z-init-wizard.test.ts':'init-positive.test.ts',
 'r0u-auth-challenge.test.ts':'auth-positive.test.ts','r0e-byo-dest.test.ts':'byo-review.test.ts',
 'r0d-global-markup.test.ts':'pricing-review.test.ts','r0f-mailer.test.ts':'mailer-review.test.ts'
 })[file];
 let text=source;
 if(auditName==='payment-review.test.ts')text+=`
describe('Independent payment boundary checks',()=>{
 it('DEFECT: concurrent late receipts overwrite one another despite sequential preservation',async()=>{
  seed('A',{status:'CANCELLED'});
  const r=await Promise.all([fulfillPaidOrder(real('A',{gatewayTransactionId:'LATE-1'})),fulfillPaidOrder(real('A',{gatewayTransactionId:'LATE-2'}))]);
  expect(r.every(x=>x.ok)).toBe(true);
  const m=state.orders.A.metadata;
  const seen=[m.pendingReceipt?.gatewayTransactionId,...(m.receiptConflicts??[]).map((x:any)=>x.gatewayTransactionId)];
  expect(new Set(seen.filter(Boolean)).size).toBe(1);
 });
 it('DEFECT: second different receipt for SUCCESS order is acknowledged without preserving its fact',async()=>{
  seed('A',{status:'SUCCESS',metadata:{gatewayTransactionId:'FIRST'}});const before=JSON.stringify(state.orders);
  const r=await fulfillPaidOrder(real('A',{gatewayTransactionId:'SECOND'}));
  expect(r).toMatchObject({ok:true,status:'ALREADY_PROCESSED'});expect(JSON.stringify(state.orders)).toBe(before);
 });
});`;
 if(auditName==='verification-review.test.ts')text+=`
it('DEFECT: repeated failed callback steals another active send platform reservation',async()=>{
 const a={channel:'email' as const,target:'a@example.com',purpose:'register' as const};
 const b={channel:'email' as const,target:'b@example.com',purpose:'register' as const};
 await backend.admitSend(a);await backend.admitSend(b);await backend.onSendResult(a,'failed');await backend.onSendResult(a,'failed');
 expect(rows.get('platform').count).toBe(0);expect(rows.get('target:email:b@example.com').count).toBe(1);
});
it('DEFECT: locked challenge remains consumable even though verification has been locked',async()=>{
 await storeVerificationCode('email','locked-consume@example.com','reset-password','123456');
 const v=await verifyVerificationCode('email','locked-consume@example.com','reset-password','123456');
 for(let i=0;i<5;i++)await verifyVerificationCode('email','locked-consume@example.com','reset-password','wrong');
 expect((await consumeVerificationCode('email','locked-consume@example.com','reset-password',v.challengeId)).ok).toBe(true);
});
it('DEFECT: unreadable failure-lock table does not fail closed during verification',async()=>{
 await storeVerificationCode('email','fault@example.com','reset-password','123456');
 const m=await import('@/lib/verification-backend');const sms=m.getSmsCodeModel();
 __setVerificationModelsForTest({findUnique:async()=>{throw err('P2021');}},sms);
 expect((await verifyVerificationCode('email','fault@example.com','reset-password','123456')).valid).toBe(true);
});`;
 if(auditName==='byo-review.test.ts')text+=`
it('DEFECT: query change is discarded when choosing whether to reuse saved key',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://original.example/Private/V1?tenant=other',apiKey:''})}));
 expect(h.sent).toMatchObject({baseUrl:'https://original.example/Private/V1?tenant=other',apiKey:'FAKE-SAVED-KEY'});
});`;
 if(auditName==='mailer-review.test.ts')text+=`
it('DEFECT: unrelated mailbox suffix is mistaken for accepted target',async()=>{
 h.send.mockResolvedValue({accepted:['malice@example.com'],rejected:[]});
 expect(await sendMail({to:'alice@example.com',subject:'fixture',text:'fixture'})).toMatchObject({ok:true,outcome:'accepted'});
});
it('DEFECT: missing recipient confirmation fields still becomes accepted',async()=>{
 h.send.mockResolvedValue({});expect(await sendMail({to:'fixture@example.com',subject:'fixture',text:'fixture'})).toMatchObject({ok:true,outcome:'accepted'});
});`;
 if(auditName==='pricing-review.test.ts'){
  text=text.replace('transactions: 0 }','transactions: 0, auditDetails: null as any }');
  text=text.replace('create: () => defer(() => { if (h.auditFail)', 'create: ({data}:any) => defer(() => { h.auditDetails=data.details; if (h.auditFail)');
  text+=`
it('DEFECT: response counts are correct but committed audit still reports zero modified rows',async()=>{
 const r=await POST(new NextRequest('http://audit/markup',{method:'POST',body:JSON.stringify({percent:30,scope:'all'})}));
 const b=await r.json();expect([b.data.modelRows,b.data.periodRows]).toEqual([7,3]);
 expect([(h as any).auditDetails.modelRows,(h as any).auditDetails.periodRows]).toEqual([0,0]);
});`;
 }
 fs.writeFileSync(path.join(out,auditName),text);
}
console.log(JSON.stringify({priorAuditTestsAltered:altered.length,referencesRecoveredIntoNewDirectory:3}));
