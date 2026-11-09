const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
let payment = fs.readFileSync('src/app/api/__tests__/r0x-payment-facts.test.ts','utf8');
payment += `
describe('Independent defect characterizations: payment facts',()=>{
 it('DEFECT: concurrent different orders using same transaction both fulfill',async()=>{
  seedRecharge('A');seedRecharge('B');
  const input=(orderNo:string)=>({orderNo,paymentMethod:'WECHAT_PAY',paymentMode:'REAL',remark:'fixture',gatewayTransactionId:'SAME',gatewayAmountCents:1000});
  const results=await Promise.all([fulfillPaidOrder(input('A')),fulfillPaidOrder(input('B'))]);
  expect(results.map(r=>r.status)).toEqual(['FULFILLED','FULFILLED']);expect(state.grantPointsCalls).toBe(2);
 });
 it('DEFECT: channel mismatch ALIPAY receipt fulfills WECHAT_PAY order',async()=>{
  seedRecharge('A');const r=await fulfillPaidOrder({orderNo:'A',paymentMethod:'ALIPAY',paymentMode:'REAL',remark:'fixture',gatewayTransactionId:'OTHER-CHANNEL',gatewayAmountCents:1000});
  expect(r.status).toBe('FULFILLED');expect(state.grantPointsCalls).toBe(1);
 });
 it('DEFECT: pending REAL recharge without transaction or amount still fulfills',async()=>{
  seedRecharge('A');const r=await fulfillPaidOrder({orderNo:'A',paymentMethod:'WECHAT_PAY',paymentMode:'REAL',remark:'fixture'});
  expect(r.status).toBe('FULFILLED');expect(state.grantPointsCalls).toBe(1);
 });
 it('DEFECT: signed-source decimal with extra precision is rounded into an accepted amount',async()=>{
  seedRecharge('A');state.aliForm={out_trade_no:'A',trade_no:'PRECISION',trade_status:'TRADE_SUCCESS',total_amount:'10.004'};
  const r=await alipayNotifyPOST(new NextRequest('http://audit/notify',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
  expect(r.status).toBe(200);expect(state.grantPointsCalls).toBe(1);
 });
 it('DEFECT: later receipt overwrites earlier pending receipt for a cancelled order',async()=>{
  seedRecharge('A','CANCELLED');const input=(id:string)=>({orderNo:'A',paymentMethod:'WECHAT_PAY',paymentMode:'REAL',remark:'fixture',gatewayTransactionId:id,gatewayAmountCents:1000});
  await fulfillPaidOrder(input('FIRST'));await fulfillPaidOrder(input('SECOND'));
  expect(state.orders.A.metadata.pendingReceipt.gatewayTransactionId).toBe('SECOND');
 });
});`;
fs.writeFileSync(path.join(out,'payment-review.test.ts'),payment);
let admission = fs.readFileSync('docs/reviews/R0-K1-followup-review/admission-review.test.ts','utf8');
admission=admission.slice(0,admission.indexOf(" it('defect KR2:"));
admission += `
 it('positive: release uses persisted weight even if caller weight differs',async()=>{
  const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:2,now});
  expect(await a.releaseParseLease({...l,workUnits:0})).toBe(true);expect(h.counters.get('platform').workUnits).toBe(0);
 });
 it('positive: zero-row counter update rolls back RELEASED',async()=>{
  const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:1,now});h.counters.get('platform').active=0;
  expect(await a.releaseParseLease(l)).toBe(false);expect([...h.leases.values()][0].status).toBe('ACTIVE');
 });
 it('DEFECT: elapsed age alone releases QUARANTINED lease without exit evidence',async()=>{
  const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:1,now});await a.quarantineParseLease(l,'worker never exited');
  await a.sweepParseLeases(now+100000);expect(h.counters.get('platform').active).toBe(0);expect([...h.leases.values()][0].status).toBe('RELEASED');
 });
 it('DEFECT: expired ACTIVE sweep commits terminal state despite zero-row counter miss',async()=>{
  const a=await import('@/lib/parse-admission');const l=await a.acquireParseLease({userId:'u1',workUnits:1,now});h.counters.get('platform').active=0;
  await a.sweepParseLeases(now+100000);expect([...h.leases.values()][0].status).toBe('EXPIRED');expect(h.counters.get('platform').workUnits).toBe(1);
 });
});`;
fs.writeFileSync(path.join(out,'admission-review.test.ts'),admission);
console.log('Prepared audit-only payment/admission fixtures; no runtime or old evidence edits.');
