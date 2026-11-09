// Current-code evidence for original F08; all environment values and business records below are fixtures.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hashes={};
function read(file){const bytes=fs.readFileSync(file);hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');return bytes.toString('utf8');}
function load(file,stubs,env){
  const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,crypto,Date,Error,Headers,Response,process:{env:{...env}},console:{log(){},error(){},warn(){}},
    require(name){if(Object.hasOwn(stubs,name))return stubs[name];throw new Error('Dependency denied '+name);}}, {filename:file});
  return exports;
}
const clone=v=>structuredClone(v);
function setup(env){
  const state={wallet:0n,grants:[],ledger:[],writes:[],txCount:0,
    order:{id:'TR_fixture',userId:'u1',workspaceId:'personal',type:'TOKEN_RECHARGE',status:'PENDING',
      title:'fixture recharge',amount:1000,channel:'WECHAT_PAY',expiresAt:new Date(Date.now()+3600000),metadata:{points:100}}};
  function client(kind){const write=(table,method)=>state.writes.push({kind,table,method});return {
    billingrecord:{findUnique:async()=>clone(state.order),update:async({data})=>{write('billingrecord','update');Object.assign(state.order,clone(data));return clone(state.order);}},
    workspace:{findUnique:async()=>({id:'personal',type:'PERSONAL',name:'fixture'})},
    workspacequota:{findUnique:async()=>null},
    userwallet:{findUnique:async()=>({balance:state.wallet}),upsert:async({create,update})=>{write('userwallet','upsert');
      state.wallet=state.wallet===0n?create.balance:state.wallet+update.balance.increment;return {balance:state.wallet};}},
    pointgrant:{create:async({data})=>{write('pointgrant','create');state.grants.push(clone(data));return clone(data);},
      findMany:async({where})=>where.expiresAt?[]:clone(state.grants)},
    pointledger:{findFirst:async({where})=>clone(state.ledger.find(r=>r.idempotencyKey?.startsWith(where.idempotencyKey.startsWith))??null),
      create:async({data})=>{write('pointledger','create');state.ledger.push(clone(data));return clone(data);}},
  };}
  const prisma={...client('ROOT'),$transaction:async fn=>{state.txCount++;const before=clone(state);
    try{return await fn(client('TX'));}catch(e){Object.assign(state,before);throw e;}}};
  const gateway=load('src/lib/payment-gateway.ts',{},env);
  const expiry=load('src/lib/order-expiry.ts',{'@/lib/prisma':{prisma}},env);
  const credit=load('src/lib/credit-service.ts',{'@/lib/prisma':{prisma},'@prisma/client':{Prisma:{}},
    '@/lib/notifications-store':{addNotification:async()=>{}},'@/lib/workspace-readonly-guard':{assertWorkspaceWritable:async()=>{}},
    '@/lib/register-gift-config':{},'@/lib/points-notifications':{notifyGrantsExpired:async()=>{}}},env);
  const mock=load('src/app/api/payments/mock/confirm/route.ts',{'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}},
    '@/lib/prisma':{prisma},'@/lib/auth':{validateUser:async()=>({valid:true,user:{id:'u1'}})},
    '@/lib/credit-service':credit,'@/lib/payment-gateway':gateway,'@/lib/order-expiry':expiry,
    '@/lib/workspace-upgrade-service':{fulfillEnterpriseUpgradeFromOrder(){throw new Error('Unexpected upgrade branch');}}},env);
  return {state,gateway,mock};
}
const request=()=>({headers:new Headers(),nextUrl:new URL('http://isolated/?orderNo=TR_fixture'),json:async()=>({orderNo:'TR_fixture'})});
async function main(){
  const observations=[],controls=[];
  for(const value of ['mock',' MOCK ']){
    const env={NODE_ENV:'production',PAYMENT_MODE:value},c=setup(env);
    const mode=c.gateway.resolvePaymentMode();assert.equal(mode,'MOCK');
    const charge=await c.gateway.createCharge({orderNo:'TR_fixture',amountCents:1000,subject:'fixture',channel:'WECHAT_PAY'});
    assert.equal(charge.mode,'MOCK');assert.ok(charge.payUrl.startsWith('/user/pay/mock'));
    const get=await c.mock.GET(request());assert.equal(get.status,200);
    const post=await c.mock.POST(request());const body=await post.json();assert.equal(post.status,200);assert.equal(body.success,true);
    assert.equal(c.state.wallet,100n);assert.equal(c.state.order.status,'SUCCESS');
    observations.push({fixtureEnv:env,resolvedMode:mode,charge,getStatus:get.status,postStatus:post.status,
      wallet:c.state.wallet,grants:c.state.grants,ledger:c.state.ledger,order:c.state.order,writes:c.state.writes});
  }
  for(const env of [{NODE_ENV:'production',PAYMENT_MODE:'real'},{NODE_ENV:'production'},{NODE_ENV:'production',PAYMENT_MODE:'invalid'}]){
    const c=setup(env);assert.equal(c.gateway.resolvePaymentMode(),'REAL');
    const get=await c.mock.GET(request()),post=await c.mock.POST(request());
    assert.equal(get.status,403);assert.equal(post.status,403);assert.equal(c.state.writes.length,0);assert.equal(c.state.txCount,0);
    controls.push({fixtureEnv:env,mode:'REAL',getStatus:get.status,postStatus:post.status,writes:c.state.writes});
  }
  for(const env of [{NODE_ENV:'development',PAYMENT_MODE:'mock'},{NODE_ENV:'test'}]){
    const c=setup(env);assert.equal(c.gateway.resolvePaymentMode(),'MOCK');
    const post=await c.mock.POST(request());assert.equal(post.status,200);assert.equal(c.state.wallet,100n);
    controls.push({fixtureEnv:env,mode:'MOCK',postStatus:post.status,wallet:c.state.wallet});
  }
  for(const file of ['src/app/api/payments/create/route.ts','src/app/api/workspace/seat-addon/route.ts',
    'docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md'])read(file);
  const evidence={capturedAt:new Date().toISOString(),originalIssue:'F08 explicit MOCK in production',observations,controls,
    isolation:'Actual gateway resolve/createCharge, actual mock GET/POST, actual grantPoints/getBalanceSummary and order-expiry. Complete closed IO and synthetic process.env; no .env/secret/DB/provider/payment/network read or call. Order is preseeded memory fixture, not created through actual create POST.',
    limits:'Proves behavior if production is explicitly configured mock; actual deployed environment is unknown. Does not prove online incident, real currency loss or model execution. Mode REAL controls have no credentials and make no provider request.',sha256:hashes};
  fs.writeFileSync('docs/reviews/R0-D-independent-review/next-production-mock-verification.json',JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2));
  console.log(JSON.stringify({originalIssue:evidence.originalIssue,productionMockCases:observations.map(r=>({fixtureEnv:r.fixtureEnv,
    mode:r.resolvedMode,postStatus:r.postStatus,wallet:String(r.wallet),orderStatus:r.order.status})),controls:controls.length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
