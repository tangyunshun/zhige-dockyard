// Offline calculation from current pricing-center source. All imported IO explicitly unavailable.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const file='src/lib/billing/pricing-center.ts',source=fs.readFileSync(file,'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject={};
vm.runInNewContext(js,{exports:exportsObject,require(name){if(!['@/lib/prisma','@/lib/model-registry','./billing-config'].includes(name))throw Error('Unexpected import '+name);return new Proxy({},{get(){throw Error('IO unavailable in F12 baseline');}});},console},{filename:file});
const rows=[];
for(const rate of [0,1500]){
 const r=exportsObject.computeEstimatedPoints({deploymentId:'byo:synthetic',unit:{input:10000000,output:0},inputTokens:1000000,outputTokens:0,pricingSource:'USER_BYOK',priceKind:'BYOK_OFFICIAL',markupCoefficientBps:2000,byokServiceRateBps:rate,minPointsPerTask:0});
 const expected=rate===0?1000:1150;assert.equal(r.points,expected);
 rows.push({rateBps:rate,baseNominalPoints:1000,serviceOnlyNominalPoints:rate===0?0:150,currentNominalPoints:r.points,multiplierBps:r.snapshot.multiplierBps});
}
fs.writeFileSync('docs/reviews/R0-H2-independent-review/f12-baseline.json',JSON.stringify({capturedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),rows,limits:'Pure offline arithmetic only. Does not prove who pays the supplier or any production charge.'},null,2));
console.log('PASS F12 current-source offline arithmetic: 15% -> 1150 points on 1000 point base; 0% -> 1000. No IO.');
