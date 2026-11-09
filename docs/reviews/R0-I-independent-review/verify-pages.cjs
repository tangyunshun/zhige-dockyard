// Execute current UI source with closed IO. No React DOM or real requests.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const observations=[];
async function admin(){
 const file='src/app/admin/models/byok-service-rate.tsx',source=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const states=[1500,15,false,'20',true,false];let index=0;const requests=[],toasts=[];
 const ConfirmDialog=()=>{},exports={};const jsx=(type,props)=>({type,props});
 const sandbox={exports,console,fetch:async(url,opts={})=>{requests.push({url,method:opts.method||'GET'});return {ok:true,status:200,json:async()=>({success:true,data:{byokServiceRateBps:2000,percent:20}})};},require(name){
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='react')return {useState:()=>{const n=index++;return [states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v;}]},useCallback:f=>f,useEffect:()=>{}};
  if(name==='@/utils/auth')return {getAuthToken:()=> 'synthetic-token'};
  if(name==='@/components/Toast')return {useToast:()=>({success:m=>toasts.push({kind:'success',message:m}),error:m=>toasts.push({kind:'error',message:m})})};
  if(name==='@/components/ConfirmDialog')return {ConfirmDialog};
  if(name==='lucide-react')return {Percent:'Percent',RefreshCw:'RefreshCw'};
  throw Error('Unexpected UI import '+name);
 }};
 vm.runInNewContext(js,sandbox,{filename:file});const tree=exports.ByokServiceRateSync({});const text=[],dialogs=[];
 function visit(n){if(n==null)return;if(typeof n==='string'){text.push(n);return;}if(Array.isArray(n)){n.forEach(visit);return;}if(n.type===ConfirmDialog)dialogs.push(n.props);if(n.props)visit(n.props.children);}
 visit(tree);assert.equal(dialogs.length,1);const dialog=dialogs[0];assert.equal(dialog.isOpen,true);
 assert.ok(text.some(t=>t.includes('任务调用当前暂停')),'pause footer exists');
 assert.ok(text.some(t=>t.includes('实时生效')),'conflicting immediate-effect badge is still visible');
 assert.ok(dialog.message.includes('实时重新折算'),'current confirmation still promises billing recalculation');
 assert.ok(dialog.warnings.some(t=>t.includes('立即对全部自带模型')),'current confirmation still promises immediate settlement effect');
 await dialog.onConfirm();assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.ok(toasts.some(t=>t.kind==='success'));
 observations.push({case:'I-ADMIN-COPY',sourceSha256:hash(file),pauseFooter:text.filter(t=>t.includes('当前暂停')),badge:text.filter(t=>t.includes('实时生效')),confirmMessage:dialog.message,warnings:dialog.warnings,requests,toasts,limits:'Actual component returned JSX and onConfirm callback with state/fetch stubs; not browser DOM. Shows contradictory wording, not real setting changes.'});
}
async function studio(){
 const file='src/components/WorkspaceInternalLayoutV3.tsx',source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='handleExecuteSimulation')callback=n.initializer.getText(tree);ts.forEachChild(n,visit);}visit(tree);assert.ok(callback);
 const js=ts.transpileModule('exports.run='+callback,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 for(const mode of ['quote-pause','post-pause','quote-unavailable']){
  const state={busy:[],toasts:[],fetches:[],successWrites:0,paymentModals:0};const exports={};const message='自带模型任务调用暂停：收费口径待确认，本次未扣点、未调用模型。';
  const sandbox={exports,URLSearchParams,JSON,Number,String,Math,Date,console:{error(){}},quickSelectedCompId:'comp-1',quickInputMaterial:'Fixture text material',materialInputMode:'text',uploadedFileMeta:null,selectedAsset:null,componentCatalog:[{id:'comp-1',name:'Fixture component',inputMode:'text',contractReady:true,estimatedModelTokens:100}],quickFormData:{},workspaceType:'PERSONAL',isManager:true,restrictedComponentIds:[],workspaceId:'w1',isMemberView:false,availableTokenForUser:0,refKnowledgeTitle:'',getAuthToken:()=> 'synthetic-token',toast:{error:m=>state.toasts.push({kind:'error',message:m}),success:m=>state.toasts.push({kind:'success',message:m})},setMaterialValidationError(){},setIsExecutingTask:v=>state.busy.push(v),setRecentTasks(){state.successWrites++;},setWorkspaceToken(){state.successWrites++;},setPersonalPayInfo(){state.paymentModals++;},setShowPersonalPayModal(){state.paymentModals++;},async fetch(url,opts={}){
   state.fetches.push({url,method:opts.method||'GET'});
   if(String(url).startsWith('/api/billing/estimate')){if(mode==='quote-unavailable')throw Error('Synthetic quote failure');return {ok:true,json:async()=>mode==='quote-pause'?{success:true,data:{blocked:true,canExecute:false,code:'BYOK_BILLING_POLICY_UNCONFIRMED',message,points:null,yuan:null}}:{success:true,data:{points:100}}};}
   assert.equal(url,'/api/studio');return {ok:false,status:409,json:async()=>({success:false,code:'BYOK_BILLING_POLICY_UNCONFIRMED',error:message})};
  }};
  vm.runInNewContext(js,sandbox,{filename:file});await exports.run();assert.equal(state.busy.at(-1),false);assert.equal(state.successWrites,0);assert.equal(state.paymentModals,0);assert.equal(state.toasts.length,1);assert.equal(state.toasts[0].kind,'error');assert.equal(state.toasts[0].message,message);assert.equal(state.fetches.filter(r=>r.method==='POST').length,mode==='quote-pause'?0:1);
  observations.push({case:mode,sourceSha256:hash(file),...state,limits:'Actual Studio callback with closed IO. Quote failure falls through to server pause, without a payment prompt or false success.'});
 }
}
(async()=>{await admin();await studio();fs.writeFileSync('docs/reviews/R0-I-independent-review/page-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),observations},null,2));console.log('PASS reproduction: conflicting administrator confirmation; PASS 3 Studio rejection controls. No real IO.');})().catch(e=>{console.error(e);process.exitCode=1;});
