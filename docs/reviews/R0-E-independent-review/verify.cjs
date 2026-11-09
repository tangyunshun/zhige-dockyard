// Current-code evidence for original F08; all environment values and business records below are fixtures.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir='docs/reviews/R0-E-independent-review';
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
function setup(env,options={}){
  const state={wallet:0n,grants:[],ledger:[],writes:[],txCount:0,orderReads:0,providerCalls:[],provisionCalls:0,
    workspace:{id:'personal',ownerId:'u1',name:'fixture',type:'PERSONAL',status:'ACTIVE',plan:'PRO',planBillingCycle:'MONTH',planExpiresAt:new Date(Date.now()+30*86400000)},
    order:{id:'TR_fixture',userId:'u1',workspaceId:'personal',type:'TOKEN_RECHARGE',status:'PENDING',
      title:'fixture recharge',amount:1000,channel:'WECHAT_PAY',expiresAt:new Date(Date.now()+3600000),metadata:{points:100}}};
  function client(kind){const write=(table,method)=>state.writes.push({kind,table,method});return {
    billingrecord:{create:async({data})=>{write('billingrecord','create');state.order=clone(data);return clone(data);},findUnique:async()=>{state.orderReads++;return clone(state.order);},update:async({data})=>{write('billingrecord','update');Object.assign(state.order,clone(data));return clone(state.order);}},
    workspace:{findUnique:async()=>clone(state.workspace),findMany:async()=>[]},
    workspacemember:{findUnique:async()=>({role:'OWNER'})},
    workspaceplan:{findUnique:async()=>({key:'PRO',maxMembers:5,priceMonthly:2600})},
    user:{findUnique:async()=>({id:'u1',role:'USER',email:'fixture@example.test',membershipLevel:'FREE'})},
    membershiplevel:{findUnique:async()=>({id:'FREE',tokenPackDiscount:0,maxEnterpriseWorkspaces:1})},
    tokenpack:{findUnique:async()=>null,findFirst:async()=>null},
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
  const providers={
    '@/lib/payment/wechatpay':{createNativeOrder:async()=>{state.providerCalls.push('WX');return {ok:true,codeUrl:'weixin://fixture'};}},
    '@/lib/payment/alipay':{buildPagePayUrl:()=>{state.providerCalls.push('ALI');return {ok:true,url:'https://provider.invalid/fixture'};}},
  };
  const gateway=load('src/lib/payment-gateway.ts',providers,env);
  const expiry=load('src/lib/order-expiry.ts',{'@/lib/prisma':{prisma}},env);
  const credit=load('src/lib/credit-service.ts',{'@/lib/prisma':{prisma},'@prisma/client':{Prisma:{}},
    '@/lib/notifications-store':{addNotification:async()=>{}},'@/lib/workspace-readonly-guard':{assertWorkspaceWritable:async()=>{}},
    '@/lib/register-gift-config':{},'@/lib/points-notifications':{notifyGrantsExpired:async()=>{}}},env);
  const mock=load('src/app/api/payments/mock/confirm/route.ts',{'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}},
    '@/lib/prisma':{prisma},'@/lib/auth':{validateUser:async()=>({valid:true,user:{id:'u1'}})},
    '@/lib/credit-service':credit,'@/lib/payment-gateway':gateway,'@/lib/order-expiry':expiry,
    '@/lib/workspace-upgrade-service':{fulfillEnterpriseUpgradeFromOrder(){throw new Error('Unexpected upgrade branch');}}},env);
  const next={'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}}};
  const common={...next,crypto,'@/lib/prisma':{prisma},'@/lib/payment-gateway':gateway,'@/lib/order-expiry':expiry,
    '@/lib/auth':{validateUser:async()=>({valid:true,user:{id:'u1'}}),isAdminRole:()=>false},
    '@/lib/security':{requireWorkspaceMembership:async()=>true},
    '@/lib/workspace-readonly-guard':{assertWorkspaceWritable:async()=>{}}};
  const create=load('src/app/api/payments/create/route.ts',{...common,'@/lib/point-rate':{
    pointsToCents:p=>p*10,discountedCents:p=>p,formatDiscountLabel:()=>''}},env);
  const seat=load('src/app/api/workspace/seat-addon/route.ts',common,env);
  const upgrade=load('src/app/api/workspace/upgrade/route.ts',{...common,
    '@/constants/workspace-plans':{DEFAULT_WORKSPACE_PLAN:'STANDARD'},
    '@/lib/workspace-plan-service':{getWorkspacePlanStrict:async raw=>({ok:true,config:{
      name:raw==='STANDARD'?'free fixture':'paid fixture',priceMonthly:raw==='STANDARD'?0:1000,
      priceYearly:raw==='STANDARD'?0:12000,isActive:true}})},
    '@/lib/workspace-upgrade-service':{provisionEnterpriseUpgrade:async()=>{state.provisionCalls++;return {newWorkspaceId:'created-fixture',message:'fixture'};}}},env);
  const query=load('src/app/api/payments/order/route.ts',common,env);
  const fulfill=load('src/lib/payment/fulfill.ts',{'@/lib/prisma':{prisma},'@/lib/credit-service':credit,'@/lib/order-expiry':expiry},env);
  const notify=load('src/app/api/payments/notify/wechat/route.ts',{...next,
    '@/lib/payment/wechatpay':{verifyNotify:async()=>options.badSignature?{ok:false,error:'fixture bad signature'}:{ok:true,resource:{
      out_trade_no:state.order.id,trade_state:'SUCCESS',transaction_id:'fixture-transaction',amount:{total:1000}}},
      NOTIFY_RESPONSE:{success:{code:'SUCCESS',message:'fixture'}}},
    '@/lib/payment/fulfill':fulfill},env);
  return {state,gateway,mock,create,seat,upgrade,query,notify};
}
const request=()=>({headers:new Headers(),nextUrl:new URL('http://isolated/?orderNo=TR_fixture'),json:async()=>({orderNo:'TR_fixture'})});

const fullCredentials={WECHATPAY_APP_ID:'fixture',WECHATPAY_MCH_ID:'fixture',WECHATPAY_API_V3_KEY:'fixture',
  WECHATPAY_SERIAL_NO:'fixture',WECHATPAY_PRIVATE_KEY_PATH:'/fixture/not-read',PAYMENT_NOTIFY_HOST:'https://callback.invalid',
  ALIPAY_APP_ID:'fixture',ALIPAY_PRIVATE_KEY_PATH:'/fixture/not-read',ALIPAY_PUBLIC_KEY_PATH:'/fixture/not-read'};
const postReq=body=>({headers:new Headers({'x-user-id':'u1'}),json:async()=>body});
async function main(){
  const modes=[],blockedConfirm=[],blockedOrders=[],controls=[];
  for(const raw of ['mock',' MOCK ','Mock','mOcK'])for(const credentials of [false,true]){
    const env={NODE_ENV:'production',PAYMENT_MODE:raw,...(credentials?fullCredentials:{})},c=setup(env);
    assert.throws(()=>c.gateway.resolvePaymentMode(),e=>e.code==='PRODUCTION_MOCK_PAYMENT_DISABLED');
    for(const channel of ['WECHAT_PAY','ALIPAY'])
      await assert.rejects(c.gateway.createCharge({orderNo:'TR_fixture',amountCents:1000,subject:'fixture',channel}),
        e=>e.code==='PRODUCTION_MOCK_PAYMENT_DISABLED');
    assert.equal(c.state.providerCalls.length,0);assert.equal(c.state.writes.length,0);
    modes.push({raw,credentials,code:'PRODUCTION_MOCK_PAYMENT_DISABLED',providerCalls:c.state.providerCalls});
  }
  for(const type of ['TOKEN_RECHARGE','SEAT_ADDON','PLAN_UPGRADE']){
    const c=setup({NODE_ENV:'production',PAYMENT_MODE:'mock'});c.state.order.type=type;
    c.state.order.metadata.paymentMode='MOCK';
    const get=await c.mock.GET(request()),post=await c.mock.POST(request());
    for(const res of [get,post]){assert.equal(res.status,403);const body=await res.json();assert.equal(body.code,'PRODUCTION_MOCK_PAYMENT_DISABLED');}
    assert.equal(c.state.orderReads,0);assert.equal(c.state.writes.length,0);assert.equal(c.state.txCount,0);
    assert.equal(c.state.order.status,'PENDING');blockedConfirm.push({type,get:get.status,post:post.status,orderReads:0,writes:c.state.writes});
  }
  for(const kind of ['create','seat','upgrade']){
    const c=setup({NODE_ENV:'production',PAYMENT_MODE:'mock'});
    if(kind==='seat')c.state.workspace.type='ENTERPRISE';
    const body=kind==='create'?{workspaceId:'personal',points:100}:kind==='seat'?{workspaceId:'personal',seats:2}:
      {workspaceId:'personal',targetPlan:'PRO',billingCycle:'MONTH',option:'retain'};
    const res=await c[kind].POST(postReq(body));const data=await res.json();
    assert.equal(res.status,503);assert.equal(data.code,'PRODUCTION_MOCK_PAYMENT_DISABLED');
    assert.equal(c.state.writes.length,0);assert.equal(c.state.provisionCalls,0);assert.equal(c.state.providerCalls.length,0);
    blockedOrders.push({kind,status:res.status,code:data.code,writes:c.state.writes,providerCalls:c.state.providerCalls});
  }
  const free=setup({NODE_ENV:'production',PAYMENT_MODE:'mock'});
  const freeRes=await free.upgrade.POST(postReq({workspaceId:'personal',targetPlan:'STANDARD',billingCycle:'MONTH',option:'retain'}));
  const freeData=await freeRes.json();assert.equal(freeRes.status,200);assert.equal(freeData.free,true);assert.equal(free.state.provisionCalls,1);
  controls.push({scenario:'free_branch_preserved',status:freeRes.status,provisionCalls:free.state.provisionCalls});
  for(const env of [{NODE_ENV:'production',PAYMENT_MODE:'real'},{NODE_ENV:'production'},{NODE_ENV:'production',PAYMENT_MODE:'invalid'}]){
    const c=setup(env);assert.equal(c.gateway.resolvePaymentMode(),'REAL');
    const res=await c.mock.POST(request());assert.equal(res.status,403);assert.equal(c.state.writes.length,0);
    await assert.rejects(c.gateway.createCharge({orderNo:'TR_fixture',amountCents:1000,subject:'fixture',channel:'WECHAT_PAY'}));
    assert.equal(c.state.providerCalls.length,0);controls.push({scenario:'safe_real_without_credentials',fixtureEnv:env,mockStatus:res.status});
  }
  for(const env of [{NODE_ENV:'development',PAYMENT_MODE:'mock'},{NODE_ENV:'test'}]){
    const c=setup(env);assert.equal(c.gateway.resolvePaymentMode(),'MOCK');
    const res=await c.mock.POST(request());assert.equal(res.status,200);assert.equal(c.state.wallet,100n);
    const repeated=await c.mock.POST(request());assert.equal((await repeated.json()).alreadyProcessed,true);assert.equal(c.state.wallet,100n);
    controls.push({scenario:'nonproduction_real_grant_code',fixtureEnv:env,status:res.status,wallet:String(c.state.wallet)});
  }
  const real=setup({NODE_ENV:'production',PAYMENT_MODE:'real',...fullCredentials});
  for(const channel of ['WECHAT_PAY','ALIPAY']){
    const charge=await real.gateway.createCharge({orderNo:'TR_fixture',amountCents:1000,subject:'fixture',channel});
    assert.equal(charge.mode,'REAL');controls.push({scenario:'real_gateway_provider_IO_stub',channel,mode:charge.mode});
  }
  assert.deepEqual(real.state.providerCalls,['WX','ALI']);
  for(const badSignature of [false,true]){
    const c=setup({NODE_ENV:'production',PAYMENT_MODE:'mock'},{badSignature});
    const res=await c.notify.POST({headers:new Headers(),text:async()=>'fixture'});
    assert.equal(res.status,badSignature?401:200);assert.equal(c.state.wallet,badSignature?0n:100n);
    controls.push({scenario:'real_notify_actual_fulfill_and_grant',badSignature,status:res.status,wallet:String(c.state.wallet)});
  }
  const history=setup({NODE_ENV:'production',PAYMENT_MODE:'mock'});
  history.state.order.status='SUCCESS';history.state.order.metadata.paymentMode='MOCK';
  const response=await history.query.GET({headers:new Headers(),nextUrl:new URL('http://isolated/?orderNo=TR_fixture')});
  assert.equal(response.status,200);assert.equal(history.state.writes.length,0);
  assert.equal(history.state.order.metadata.paymentMode,'MOCK');controls.push({scenario:'history_read_unchanged',status:response.status});
  const manifest=JSON.parse(read('docs/reviews/R0-E-fix-snapshot/manifest.json'));
  const prior=JSON.parse(read('docs/reviews/R0-D-independent-review/next-production-mock-verification.json'));
  const snapshots=manifest.files.map(entry=>{
    const name=entry.path.replaceAll('/','__'),start='docs/reviews/R0-E-fix-snapshot/frozen-source/'+name,
      end='docs/reviews/R0-E-fix-snapshot/end-source/'+name+'.frozen';
    read(start);read(end);read(entry.path);
    return {file:entry.path,startMatchesManifest:hashes[start]===entry.startSha256,
      priorAuditMatch:prior.sha256[entry.path]?prior.sha256[entry.path]===hashes[start]:'not-recorded-in-that-audit',
      endMatchesManifest:hashes[end]===entry.endSha256,currentMatchesEnd:hashes[entry.path]===entry.endSha256};
  });
  assert.ok(snapshots.every(r=>r.startMatchesManifest&&r.endMatchesManifest&&r.currentMatchesEnd&&r.priorAuditMatch!==false));
  const oldAudit=JSON.parse(read('docs/reviews/R0-D-independent-review/verification.json'));
  const protectedChecks=['src/lib/credit-service.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/payment/fulfill.ts',
    'src/lib/payment-cashier-display.ts','src/lib/order-expiry.ts'].map(file=>{read(file);return {file,unchanged:hashes[file]===oldAudit.sha256[file]};});
  assert.ok(protectedChecks.every(r=>r.unchanged));
  read('src/app/api/__tests__/r0e-production-mock.test.ts');read('docs/reviews/R0-E-fix-report.md');
  const evidence={capturedAt:new Date().toISOString(),verdict:'PASS bounded R0-E production-mock stop-loss; freeze batch',
    modes,blockedConfirm,blockedOrders,controls,snapshots,protectedChecks,
    isolation:'Actual payment gateway, mock GET/POST, three paid-order routes, real grantPoints/getBalanceSummary, actual WX notify+fulfill+grant, read-only history GET. Identity, persistence, pricing/plan/provision and provider/verify IO are fixtures. Synthetic env only, no secrets/provider/DB/network.',
    limits:'Free branch invokes a provision fixture; full R0-A service covered by existing targeted regressions. Conditions exercised in memory, not deployed environment or actual MySQL. No shared source swapping; no actual payment or production readiness claim.',sha256:hashes};
  fs.writeFileSync(dir+'/verification.json',JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2));
  console.log(JSON.stringify({verdict:evidence.verdict,productionModeCases:modes.length,blockedOrderTypes:blockedConfirm.length,
    paidOrderRoutes:blockedOrders.length,controls:controls.length,snapshotPairs:snapshots.length,protectedFiles:protectedChecks.length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

