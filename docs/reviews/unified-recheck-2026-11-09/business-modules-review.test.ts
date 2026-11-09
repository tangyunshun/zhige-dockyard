import {it,expect,vi} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{}}));
import{parseBillingConfig}from '@/lib/billing/billing-config';
import{CostReservationService,MemoryReservationBackend,type AdmitInputs,type QuoteInput}from '@/lib/billing/cost-reservation';
import{computeMetrics,type RawCostFact}from '@/lib/metrics/value-cost-metrics';
import{collectPendingRecords}from '@/lib/operations/ops-readiness';
const input:AdmitInputs={pricing:{currency:'CNY',priceStatus:'VERIFIED',costInputMicrosPerMillion:1000,costOutputMicrosPerMillion:2000,costCacheReadMicrosPerMillion:0,costCacheWriteMicrosPerMillion:0,rules:null},contextLimit:100000,maxOutputTokens:1000,budgetPoints:5,markupRateBps:2000};
const q:QuoteInput={userId:'u1',workspaceId:'w1',paymentAccountId:'a1',contractId:'c1',priceVersionId:'v1',inputDigest:'INPUT-A',modelStrategy:'MODEL',executionScope:'STUDIO',validUntil:9999999999999,idempotencyKey:'SAME-KEY'};
it('POSITIVE: legitimate 20000 bps now remains unchanged',()=>{
 expect(parseBillingConfig([{key:'billing.markupCoefficientBps',value:'20000'}]).markupCoefficientBps).toBe(20000);
});
it('DEFECT IN UNWIRED MODULE: same key with different tenant and input receives original successful reservation',async()=>{
 const s=new CostReservationService(new MemoryReservationBackend(),{platformBudgetCapMicros:BigInt(100000000)});
 expect((await s.admitAndReserve(q,input)).ok).toBe(true);
 const b=await s.admitAndReserve({...q,userId:'u2',workspaceId:'w2',inputDigest:'INPUT-B'},input);
 expect(b.ok).toBe(true);if(b.ok)expect(b.reservation.quote.workspaceId).toBe('w1');
});
it('DEFECT IN UNWIRED MODULE: prepaid receipts are all reported as consumed service',()=>{
 const m=computeMetrics([],[{id:'paid',tenantId:'t',category:'PAID',amountMicros:BigInt(1000000),pseudoRevenue:false}],[],{tenantId:'t',windowStartMs:0,windowEndMs:100,tzOffsetMinutes:480,purchasedUnconsumedMicros:BigInt(900000)});
 expect(m.realCollectedMicros).toEqual({kind:'NUMBER',value:BigInt(1000000)});expect(m.consumedServiceMicros).toEqual(m.realCollectedMicros);
});
it('DEFECT IN UNWIRED MODULE: unknown fixed cost is omitted from profit incompleteness flag',()=>{
 const components=['MULTI_STEP','FAIL','RETRY','FILE','OCR','STORAGE','DOWNLOAD','PAYMENT','SUPPORT'] as const;
 const costs:RawCostFact[]=components.map((component,i)=>({id:String(i),tenantId:'t',component,costMicros:BigInt(0)}));
 const m=computeMetrics([],[{id:'fixed',tenantId:'t',category:'FIXED',amountMicros:null,pseudoRevenue:false}],costs,{tenantId:'t',windowStartMs:0,windowEndMs:100,tzOffsetMinutes:480,purchasedUnconsumedMicros:BigInt(0)});
 expect(m.fixedCostMicros.kind).toBe('UNKNOWN');expect(m.profitNotDeterminable).toBe(false);
});
it('DEFECT IN UNWIRED MODULE: no cross-tenant permission with null scope returns other tenant records',()=>{
 const records=[{businessId:'b',kind:'UNKNOWN_TASK' as const,reason:'fixture',status:'UNKNOWN' as const,retryCount:0,responsibleRole:'r',nextStep:'review',tenantId:'other'}];
 expect(collectPendingRecords(records,null,false)).toEqual(records);
});
