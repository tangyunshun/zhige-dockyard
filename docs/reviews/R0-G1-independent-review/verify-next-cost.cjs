// Original F11 evidence: actual cost helper and unmodified handler cost-gate AST block, not a full HTTP/execute replay.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hashes={};function read(p){const b=fs.readFileSync(p);hashes[p]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}
const file='src/app/api/studio/handler.ts',source=read(file),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
const found=[];function visit(n){if(ts.isIfStatement(n)){const c=n.expression.getText(tree);if(c==='modelPlan.pricing && resolvePricingSource(modelPlan.deploymentId) !== "USER_BYOK"')found.push(n);}ts.forEachChild(n,visit);}visit(tree);assert.equal(found.length,1);
const gate=found[0],gateSource=gate.getText(tree),helperFile='src/lib/component-cost-floor.ts';
const helperCode=ts.transpileModule(read(helperFile),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exp={};vm.runInNewContext(helperCode,{exports:exp,Math,Number,console,require(n){if(n==='@/lib/prisma')return {prisma:{}};if(n==='@/lib/billing/billing-config')return {loadBillingConfig:()=>{throw Error('UNEXPECTED_IO');}};throw Error('DEPENDENCY_DENIED '+n);}});
const compute=exp.computeCostFloorFromPricing;
function check(name,{pricing,rawCost=100,input=1000,output=0}){
  const env={modelPlan:{deploymentId:'platform-fixture',pricing},activeContract:{executionPlan:{steps:[{maxOutputTokens:output}]}},estimatedActualInput:input,rawCost,billingCfg:{markupCoefficientBps:0},
    computeCostFloorFromPricing:compute,resolvePricingSource:()=> 'PLATFORM',NextResponse:{json:(body,init)=>({httpStatus:init?.status||200,body})}};
  const run=vm.runInNewContext('(function(){'+gateSource+';return {httpStatus:200,body:{allowedByThisGate:true}};})',env);
  const result=run(),floor=compute(pricing,input,output,0);
  return {name,pricing,input,output,rawCost,computedFloorPoints:floor,result};
}
const cases=[
  check('known_cost_150_vs_fixed_charge_100_not_blocked',{pricing:{costInputMicrosPerMillion:1_500_000_000,costOutputMicrosPerMillion:1_000_000,markupRateBps:0}}),
  check('known_cost_201_vs_fixed_charge_100_blocked_control',{pricing:{costInputMicrosPerMillion:2_000_000_000,costOutputMicrosPerMillion:1_000_000,markupRateBps:0},input:1001}),
  check('missing_pricing_skips_gate',{pricing:null}),
  check('both_cost_prices_missing_skips_gate',{pricing:{costInputMicrosPerMillion:null,costOutputMicrosPerMillion:null}}),
  check('output_cost_missing_treated_as_zero',{pricing:{costInputMicrosPerMillion:1_000_000,costOutputMicrosPerMillion:null},output:5000}),
];
assert.equal(cases[0].computedFloorPoints,150);assert.equal(cases[0].result.httpStatus,200);assert.equal(cases[1].result.httpStatus,400);
for(const c of cases.slice(2))assert.equal(c.result.httpStatus,200);
for(const p of ['src/lib/point-rate.ts','src/lib/credit-service.ts','src/lib/model-pricing.ts','src/lib/model-adapter.ts','src/lib/billing/billing-config.ts','src/lib/billing/pricing-center.ts','src/components/WorkspaceInternalLayoutV3.tsx','docs/PROJECT-DEVELOPMENT-CHARTER.md'])read(p);
const outputExpression='(comp?.estimatedOutputTokens ?? 0) > 0\n                  ? comp.estimatedOutputTokens * 3\n                  : Number(process.env.MODEL_MAX_OUTPUT_TOKENS) || 2000';
assert.ok(source.includes(outputExpression));
const evidence={capturedAt:new Date().toISOString(),originalIssue:'F11 platform fixed-point compatibility cost admission',scope:'POST /api/studio action=simulate, actual REAL_MODEL execution branch; BYOK and real settlement are separate scopes.',
  costGateLocation:{line:tree.getLineAndCharacterOfPosition(gate.getStart(tree)).line+1},cases,
  staticFacts:{costGateThreshold:'projectedPoints > rawCost * 2',warningOnlyFloorCheck:source.includes('成本红线巡检（定价审核修复，只告警不阻断）'),
    preflightOutput:'sum of contract executionPlan.steps[].maxOutputTokens (missing -> 0)',adapterOutput:'catalog estimatedOutputTokens * 3, otherwise env/default 2000',
    preflightSystemPrompt:'unexpanded first-step template',actualSystemPrompt:'COST_BASELINE placeholder may be expanded before execute',
    monetaryMeaning:'Point face-value budget is not verified cash income, realized margin, or approved subsidy; do not infer profitability.'},sha256:hashes,
  limits:'Actual cost helper and exact AST-selected cost-gate statement executed with in-memory local bindings. Not full handler, no actual adapter/provider call, no DB/secret/env or paid operation. Missing-field case shows local gate bypass, not proof that every other request guard permits execution.'};
fs.writeFileSync('docs/reviews/R0-G1-independent-review/next-cost-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({originalIssue:evidence.originalIssue,gateLine:evidence.costGateLocation.line,cases:cases.map(c=>({name:c.name,floor:c.computedFloorPoints,status:c.result.httpStatus}))},null,2));
