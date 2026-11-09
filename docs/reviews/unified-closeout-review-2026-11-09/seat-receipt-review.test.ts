import{it,expect,vi,beforeEach}from 'vitest';
const h=vi.hoisted(()=>({orders:new Map<string,any>(),workspace:null as any,tail:Promise.resolve()as Promise<any>}));
function eq(a:any,b:any){return a instanceof Date&&b instanceof Date?a.getTime()===b.getTime():a===b;}
function matches(row:any,where:any):boolean{return Object.entries(where??{}).every(([k,v])=>{if(v&&typeof v==='object'&&!(v instanceof Date)){if('notIn'in v)return!(v as any).notIn.includes(row[k]);if('gte'in v)return row[k]>=(v as any).gte;if('gt'in v)return row[k]>(v as any).gt;}return eq(row[k],v);});}
function apply(row:any,data:any){for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&'increment'in v)row[k]+=(v as any).increment;else row[k]=v;}}
vi.mock('@/lib/prisma',()=>{
 const billing={
  findUnique:async({where}:any)=>structuredClone(h.orders.get(where.id)??null),
  findFirst:async()=>null,
  create:async({data}:any)=>{if(h.orders.has(data.id))throw Object.assign(new Error('unique'),{code:'P2002'});h.orders.set(data.id,structuredClone(data));return structuredClone(data);},
  updateMany:async({where,data}:any)=>{let count=0;for(const row of h.orders.values())if(matches(row,where)){apply(row,data);count++;}return{count};},
  update:async({where,data}:any)=>{const row=h.orders.get(where.id);apply(row,data);return structuredClone(row);},
 };
 const workspace={findUnique:async()=>structuredClone(h.workspace),updateMany:async({where,data}:any)=>{if(!matches(h.workspace,where))return{count:0};apply(h.workspace,data);return{count:1};}};
 const db:any={billingrecord:billing,workspace};
 db.$transaction=(fn:any)=>{const r=h.tail.then(async()=>{const before={orders:structuredClone(h.orders),workspace:structuredClone(h.workspace)};try{return await fn(db);}catch(e){h.orders=before.orders;h.workspace=before.workspace;throw e;}});h.tail=r.catch(()=>{});return r;};
 return{prisma:db};
});
vi.mock('@/lib/order-expiry',()=>({isOrderExpired:()=>false}));
vi.mock('@/lib/credit-service',()=>({grantPoints:vi.fn(async()=>{throw new Error('not recharge');})}));
import{fulfillPaidOrder}from '@/lib/payment/fulfill';
beforeEach(()=>{
 h.orders=new Map();h.tail=Promise.resolve();
 h.workspace={id:'w',type:'ENTERPRISE',status:'ACTIVE',extraSeats:0,plan:'STANDARD',planBillingCycle:'YEAR',planExpiresAt:new Date('2099-01-01')};
 for(const id of ['A','B'])h.orders.set(id,{id,userId:'u',workspaceId:'w',type:'SEAT_ADDON',title:'fixture',status:'PENDING',channel:'WECHAT_PAY',currency:'CNY',amount:1000,expiresAt:new Date('2098-01-01'),metadata:{seats:2,planKey:'STANDARD',billingCycle:'YEAR',expiresAt:h.workspace.planExpiresAt.toISOString()}});
});
const input=(orderNo:string)=>({orderNo,paymentMethod:'WECHAT_PAY',paymentMode:'REAL',remark:'fixture',gatewayTransactionId:'SAME-TXN',gatewayAmountCents:1000,merchantContext:'merchant-fixture'});
it('POSITIVE: same seat order repeat adds seats once',async()=>{
 expect((await fulfillPaidOrder(input('A'))).status).toBe('FULFILLED');expect((await fulfillPaidOrder(input('A'))).status).toBe('ALREADY_PROCESSED');expect(h.workspace.extraSeats).toBe(2);
});
it('DEFECT: same receipt fulfills two different seat orders and adds four seats',async()=>{
 const r=await Promise.all([fulfillPaidOrder(input('A')),fulfillPaidOrder(input('B'))]);expect(r.map(x=>x.status)).toEqual(['FULFILLED','FULFILLED']);expect(h.workspace.extraSeats).toBe(4);
});
it('DEFECT: REAL seat order can fulfill without gateway transaction identifier',async()=>{
 const r=await fulfillPaidOrder({...input('A'),gatewayTransactionId:undefined});expect(r.status).toBe('FULFILLED');expect(h.workspace.extraSeats).toBe(2);
});
