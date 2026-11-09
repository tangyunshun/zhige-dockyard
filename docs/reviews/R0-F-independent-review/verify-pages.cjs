// Execute the actual admin handler and confirmation callback; hooks/fetch/JSX are isolated.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const file='src/app/admin/maintenance/page.tsx',bytes=fs.readFileSync(file),results=[];
function harness(response) {
  const slots=[],effects=[],fetches=[],toasts=[];let cursor=0,effectIndex=0,initial=true,handlers;
  const hooks={useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;
    return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useEffect(fn){if(initial)effects.push(fn);effectIndex++;}};
  const body=()=>({success:true,maintenanceMode:response==='success'&&fetches.some(f=>f.method==='POST'),maintenanceMessage:'fixture message',estimatedMinutes:'30',schedules:[],releases:[],currentVersion:'v1.0.0'});
  const sandbox={exports:{},console:{error(){},log(){}},Date,Math,setTimeout,clearTimeout,
    async fetch(url,opts={}) {const method=opts.method||'GET';fetches.push({url,method,body:opts.body?JSON.parse(opts.body):undefined});
      if(method==='GET')return {ok:true,json:async()=>body()};
      if(response==='network')throw Error('fixture network failure');
      const ok=response==='success';return {ok,status:ok?200:response==='denied'?403:500,json:async()=>ok?body():{error:response==='denied'?'FORBIDDEN':'操作处理失败，请稍后重试'}};
    },
    require(name){
      if(name==='react')return hooks;
      if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
      if(name==='next/navigation')return {useRouter:()=>({push(){}})};
      if(name==='@/components/Toast')return {useToast:()=>Object.fromEntries(['success','error','warning'].map(level=>[level,message=>toasts.push({level,message})]))};
      if(name==='@/utils/auth')return {getAuthToken:()=> 'fixture-admin'};
      if(name==='@/hooks/useEscapeKey')return {useEscapeKey(){}};
      if(name==='@/components/ConfirmDialog')return {ConfirmDialog:'ConfirmDialog'};
      if(name==='@/components/admin/LoadErrorBanner')return {__esModule:true,default:'LoadErrorBanner'};
      if(name==='lucide-react')return new Proxy({},{get:()=> 'Icon'});
      throw Error('DEPENDENCY_DENIED '+name);
    },
  };
  const source=bytes.toString('utf8');assert.equal((source.match(/^  return \(/gm)||[]).length,1);
  const instrumented=source.replace(/^  return \(/m,'  globalThis.__review = { handleToggleMaintenance, handleSaveMessage, confirmDialog, maintenanceMode, saving };\n  return (');
  const js=ts.transpileModule(instrumented,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(js,sandbox,{filename:file});
  function render(){cursor=0;effectIndex=0;sandbox.exports.default();handlers=sandbox.__review;initial=false;return handlers;}
  async function flush(){for(let i=0;i<8;i++)await new Promise(setImmediate);return render();}
  return {render,flush,effects,fetches,toasts,get h(){return handlers;}};
}
async function main(){
  for(const response of ['denied','auditFailure','network','success']) {
    const h=harness(response);h.render();for(const effect of h.effects)effect();await h.flush();assert.equal(h.h.maintenanceMode,false);
    h.h.handleToggleMaintenance(true);h.render();assert.equal(h.h.confirmDialog.isOpen,true);assert.equal(h.fetches.filter(f=>f.method==='POST').length,0);
    await h.h.confirmDialog.onConfirm();await h.flush();
    assert.equal(h.fetches.filter(f=>f.method==='POST').length,1);assert.equal(h.h.maintenanceMode,response==='success');assert.equal(h.h.saving,false);
    if(response==='success'){assert.equal(h.toasts.filter(t=>t.level==='success').length,1);assert.equal(h.fetches.filter(f=>f.method==='GET').length,2);}
    else {assert.equal(h.toasts.filter(t=>t.level==='success').length,0);assert.equal(h.toasts.filter(t=>t.level==='error').length,1);assert.equal(h.fetches.filter(f=>f.method==='GET').length,1);}
    results.push({scenario:response,confirmationPrecedesWrite:true,maintenanceMode:h.h.maintenanceMode,fetches:h.fetches,toasts:h.toasts});
  }
  const result={capturedAt:new Date().toISOString(),results,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),limits:'Actual component handler and stored onConfirm executed with hook/JSX/fetch stubs. In-memory source instrumentation exposes lexical handlers; business file never edited. Not browser, DOM or real auth/network.'};
  fs.writeFileSync('docs/reviews/R0-F-independent-review/page-verification.json',JSON.stringify(result,null,2));console.log('PASS actual admin confirmation/handler: 4 scenarios; no browser or network');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
