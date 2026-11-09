// Current component execution with synthetic state and fetch; no DOM or real IO.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const file='src/app/admin/models/byok-service-rate.tsx',source=fs.readFileSync(file,'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function run(success){
 const states=[1500,15,false,'20',true,false];let index=0;const requests=[],toasts=[],ConfirmDialog=()=>{},exports={},jsx=(type,props)=>({type,props});
 vm.runInNewContext(js,{exports,console,fetch:async(url,opts={})=>{requests.push({url,method:opts.method||'GET'});return {ok:success,status:success?200:500,json:async()=>success?{success:true,data:{byokServiceRateBps:2000,percent:20}}:{success:false,error:'Synthetic save failure'}};},require(name){
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='react')return {useState:()=>{const n=index++;return [states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v;}]},useCallback:f=>f,useEffect:()=>{}};
  if(name==='@/utils/auth')return {getAuthToken:()=> 'synthetic-token'};
  if(name==='@/components/Toast')return {useToast:()=>({success:m=>toasts.push({kind:'success',message:m}),error:m=>toasts.push({kind:'error',message:m})})};
  if(name==='@/components/ConfirmDialog')return {ConfirmDialog};
  if(name==='lucide-react')return {Percent:'Percent',RefreshCw:'RefreshCw'};
  throw Error('Unexpected import '+name);
 }},{filename:file});
 const tree=exports.ByokServiceRateSync({}),text=[],dialogs=[];
 function visit(n){if(n==null)return;if(typeof n==='string'){text.push(n);return;}if(Array.isArray(n)){n.forEach(visit);return;}if(n.type===ConfirmDialog)dialogs.push(n.props);if(n.props)visit(n.props.children);}visit(tree);
 assert.equal(dialogs.length,1);const dialog=dialogs[0];assert.equal(dialog.isOpen,true);assert.ok(text.some(t=>t.includes('任务暂停 · 仅保存配置')));
 for(const phrase of ['实时生效','实时重新折算','立即对全部自带模型']){assert.ok(!text.join(' ').includes(phrase));assert.ok(!dialog.message.includes(phrase));assert.ok(!dialog.warnings.some(w=>w.includes(phrase)));}
 assert.ok(dialog.message.includes('保存不会恢复调用或启动收费'));assert.ok(dialog.message.includes('恢复需单独授权'));
 await dialog.onConfirm();assert.equal(requests.filter(r=>r.method==='POST').length,1);
 if(success){assert.ok(toasts.some(t=>t.kind==='success'&&t.message.includes('仅保存配置')&&t.message.includes('仍暂停')));}else{assert.ok(toasts.some(t=>t.kind==='error'&&t.message==='Synthetic save failure'));assert.ok(!toasts.some(t=>t.kind==='success'));}
 return {case:success?'save success':'save failure',badge:text.filter(t=>t.includes('任务暂停 ·')),confirmMessage:dialog.message,warnings:dialog.warnings,requests,toasts};
}
(async()=>{const observations=[await run(true),await run(false)];fs.writeFileSync('docs/reviews/R0-I1-independent-review/admin-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),observations,limits:'Actual component JSX/confirmation callbacks with synthetic hooks/fetch; no browser DOM or real configuration write.'},null,2));console.log('PASS independent administrator card/confirmation/success/failure: wording consistent in 2 controlled scenarios.');})().catch(e=>{console.error(e);process.exitCode=1;});
