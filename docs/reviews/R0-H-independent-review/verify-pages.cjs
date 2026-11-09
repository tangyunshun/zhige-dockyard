// Execute the exact current component callback with closed fetch/state bindings. Not React DOM/browser.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const file='src/components/WorkspaceInternalLayoutV3.tsx',bytes=fs.readFileSync(file),source=bytes.toString('utf8');
const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='handleExecuteSimulation')callback=n.initializer.getText(tree);ts.forEachChild(n,visit);}visit(tree);assert.ok(callback);
const js=ts.transpileModule('exports.run='+callback,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
async function main(){const cases=[];
  for(const [status,code]of [[422,'MODEL_COST_NOT_TRUSTWORTHY'],[400,'MODEL_COST_EXCEEDS_BUDGET']]){
    const state={busy:[],toasts:[],fetches:[],successStateWrites:0};const exports={};const message='当前费用预算无法确认，本次未扣点。';
    const sandbox={exports,URLSearchParams,JSON,Number,String,Math,Date,console:{error(){}},quickSelectedCompId:'comp-1',quickInputMaterial:'Fixture text material',materialInputMode:'text',uploadedFileMeta:null,selectedAsset:null,
      componentCatalog:[{id:'comp-1',name:'Fixture component',inputMode:'text',contractReady:true,estimatedModelTokens:100}],quickFormData:{},workspaceType:'PERSONAL',isManager:true,restrictedComponentIds:[],workspaceId:'w1',isMemberView:false,availableTokenForUser:1000,refKnowledgeTitle:'',getAuthToken:()=> 'synthetic-token',
      toast:{error:m=>state.toasts.push({kind:'error',message:m}),success:m=>state.toasts.push({kind:'success',message:m})},setMaterialValidationError(){},setIsExecutingTask:v=>state.busy.push(v),
      setRecentTasks(){state.successStateWrites++;},setWorkspaceToken(){state.successStateWrites++;},setPersonalPayInfo(){throw Error('UNEXPECTED_PERSONAL_PAY');},setShowPersonalPayModal(){throw Error('UNEXPECTED_PERSONAL_PAY');},
      async fetch(url,options={}){state.fetches.push({url,method:options.method||'GET'});if(String(url).startsWith('/api/billing/estimate'))return {ok:true,json:async()=>({data:{points:100}})};
        assert.equal(url,'/api/studio');assert.equal(options.method,'POST');return {ok:false,status,json:async()=>({success:false,code,error:message})};}
    };
    vm.runInNewContext(js,sandbox,{filename:file});await exports.run();assert.deepEqual(state.busy,[true,false]);assert.equal(state.successStateWrites,0);assert.equal(state.toasts.length,1);assert.equal(state.toasts[0].kind,'error');assert.equal(state.toasts[0].message,message);assert.equal(state.fetches.length,2);cases.push({status,code,...state});
  }
  fs.writeFileSync('docs/reviews/R0-H-independent-review/page-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),cases,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),limits:'Actual handleExecuteSimulation callback via AST extraction; fetch/state bindings isolated. Not full component mounting, browser DOM or network.'},null,2));console.log('PASS actual Studio page callback: 2 cost-rejection cases, no false success and busy restored');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
