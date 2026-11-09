const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = process.cwd();
const out = __dirname;
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const writeJson = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
const relative = p => path.relative(root, p).split(path.sep).join('/');
const manifest = readJson(path.join(out, 'source-manifest.json'));
const current = manifest.source.map(row => ({path:row.path, sha256:fs.existsSync(row.path) ? sha(row.path) : null}));
const drift = current.filter((row,i) => row.sha256 !== manifest.source[i].sha256);
const baselinePaths = new Set(manifest.source.map(row=>row.path));
function findSource(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?findSource(path.join(dir,e.name)):/\.(ts|tsx|cjs|prisma|sql)$/.test(e.name)?[relative(path.join(dir,e.name))]:[]);}
const addedSourceFiles = [...findSource(path.join(root,'src')),...findSource(path.join(root,'prisma'))].filter(p=>!baselinePaths.has(p));
const head = cp.execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
const fingerprint = crypto.createHash('sha256').update(JSON.stringify([...current].sort((a,b)=>a.path.localeCompare(b.path)))).digest('hex');
const p14 = path.join(root,'docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14');
const delivered = readJson(path.join(p14,'final-manifest.json'));
const deliveryHashes = Object.entries(delivered.changedFiles).map(([p,v]) => ({path:p, reported:v.sha256, actual:fs.existsSync(p)?sha(p):null}));
const deliveryMismatches = deliveryHashes.filter(row=>row.reported!==row.actual);
fs.mkdirSync(path.join(out,'executor-delivery'),{recursive:true});
for(const entry of fs.readdirSync(p14,{withFileTypes:true})) {
  if(entry.isFile() && /\.(md|json)$/.test(entry.name)) fs.copyFileSync(path.join(p14,entry.name),path.join(out,'executor-delivery',entry.name));
}
const selected = new Set(readJson(path.join(out,'source-changes.json')).map(row=>row.path));
for(const p of ['prisma/schema.prisma','src/app/auth/login/page.tsx','src/lib/parse-admission.ts','src/lib/parse-runner.ts','src/lib/payment/fulfill.ts','src/lib/verification-backend.ts','src/lib/verification-codes.ts','src/lib/billing/cost-reservation.ts','src/lib/billing/execution-orchestration.ts','src/lib/billing/refund-basis.ts','src/lib/billing/entitlement-read-guard.ts','src/lib/tenant/enterprise-lifecycle.ts','src/lib/journey/first-value-journey.ts','src/lib/operations/ops-readiness.ts','src/lib/metrics/value-cost-metrics.ts']) selected.add(p);
for(const p of selected) {
  if(!fs.existsSync(p)) continue;
  const dest=path.join(out,'source',p);
  fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(p,dest);
}
function filesUnder(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const migrations=filesUnder(path.join(root,'prisma/migrations')).filter(p=>p.endsWith('.sql'));
const models=['VerificationBudget','VerificationSendClaim','PasswordResetClaim'];
let generatedModels=[]; let generatedClientError=null;
try { generatedModels=require(path.join(root,'node_modules/@prisma/client')).Prisma.dmmf.datamodel.models.map(m=>m.name); }
catch(e){generatedClientError=String(e.message);}
const schema=fs.readFileSync(path.join(root,'prisma/schema.prisma'),'utf8');
const modelEvidence=models.map(name=>({name,inSchema:new RegExp('model\\s+'+name+'\\s*\\{').test(schema),inLocalGeneratedClient:generatedModels.includes(name),migrationFiles:migrations.filter(p=>fs.readFileSync(p,'utf8').includes(name)).map(relative)}));
const summarize = name => {
  const v=readJson(path.join(out,name));
  return {files:v.testResults.length,total:v.numTotalTests,passed:v.numPassedTests,failed:v.numFailedTests,pending:v.numPendingTests,success:v.success,failures:v.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>({file:relative(f.name),test:a.fullName,messages:a.failureMessages})))};
};
const independentRaw=readJson(path.join(out,'independent-results.json'));
const assertions=independentRaw.testResults.flatMap(f=>f.assertionResults);
const syntax=cp.spawnSync(process.execPath,['--check','src/lib/parse-worker.cjs'],{encoding:'utf8'});
fs.writeFileSync(path.join(out,'worker-syntax.txt'),syntax.stdout+syntax.stderr);
const summary={
  reviewedAt:new Date().toISOString(),baselineHead:manifest.head,currentHead:head,versionKind:'UNCOMMITTED_WORKTREE_ON_BASELINE',sourceFiles:current.length,sourceWorktreeSha256:fingerprint,sourceDrift:drift,addedSourceFiles,
  identityScope:'SHA256 of sorted path/hash rows for source-manifest.json coverage (src, prisma, selected project config); audit artifacts separately hashed; not a claim of all untracked workspace bytes',
  sourceChangesSincePriorSnapshot:readJson(path.join(out,'source-changes.json')).length,
  executorManifest:{reportedFiles:deliveryHashes.length,mismatches:deliveryMismatches},
  formal:summarize('formal-results.json'),parseRetry:summarize('parse-targeted-retry.json'),independent:{...summarize('independent-results.json'),defectCharacterizations:assertions.filter(a=>/DEFECT/i.test(a.fullName)).length,positiveRegressions:assertions.filter(a=>!/DEFECT/i.test(a.fullName)).length},
  strictTypecheck:{exitCode:0,command:'node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json',outputFile:'typecheck.txt',note:'Exit status observed in this review; not inferred only from empty output'},
  nodeTests:{passed:18,failed:0,cancelled:0,exitCode:0,outputFile:'node-tests.txt'},workerSyntax:{exitCode:syntax.status,outputFile:'worker-syntax.txt'},
  databaseEvidence:{method:'schema text, migration SQL text, static local generated Prisma DMMF; never instantiated a client or connected',models:modelEvidence,generatedClientError},
  conclusion:'FAILED_ORIGINAL_SCOPE_CLOSEOUT',realExternalIOExecuted:false,
  limitations:['No real database concurrency, migration, payment signature interoperability, SMTP, supplier model, browser journey, cost/profit or human acceptance validation.','DEFECT tests assert reproduced wrong current behavior; passed characterization is not repaired acceptance.','Reset latent-state tests add an explicitly documented wrong-delegate alias to reach logic behind current 503.','First formal failure retained; standalone retry success does not replace it.']
};
writeJson('verification-summary.json',summary);
const linkChecks=[];
for(const name of ['REVIEW.md','IDE-UNIFIED-FINISH-PROMPT.md']) {
  const content=fs.readFileSync(path.join(out,name),'utf8');
  for(const match of content.matchAll(/\]\(<([^>]+)>\)/g)) {
    let target=match[1]; const lineMatch=target.match(/:(\d+)$/); const line=lineMatch?Number(lineMatch[1]):null;
    if(lineMatch) target=target.slice(0,-lineMatch[0].length);
    const exists=fs.existsSync(target); const lineValid=!line || (exists&&fs.readFileSync(target,'utf8').split(/\r?\n/).length>=line);
    linkChecks.push({document:name,target,line,exists,lineValid});
  }
}
const check={sourceDrift:drift,addedSourceFiles,headMatches:head===manifest.head,linkCount:linkChecks.length,brokenLinks:linkChecks.filter(v=>!v.exists||!v.lineValid),independentAllPassed:summary.independent.success,parseRetryAllPassed:summary.parseRetry.success,workerSyntaxExitCode:syntax.status,executorManifestMismatches:deliveryMismatches};
writeJson('delivery-check.json',check);
writeJson('artifact-sha256.json',filesUnder(out).filter(p=>path.basename(p)!=='artifact-sha256.json').map(p=>({path:path.relative(out,p).split(path.sep).join('/'),sha256:sha(p)})));
console.log(JSON.stringify({sourceFiles:current.length,sourceDrift:drift.length,sourceWorktreeSha256:fingerprint,executorManifestFiles:deliveryHashes.length,executorManifestMismatches:deliveryMismatches,formal:{...summary.formal,failures:summary.formal.failures.map(f=>({file:f.file,test:f.test}))},parseRetry:summary.parseRetry,independent:summary.independent,databaseEvidence:summary.databaseEvidence,deliveryCheck:check,artifactCount:filesUnder(out).length},null,2));
if(drift.length||addedSourceFiles.length||head!==manifest.head||check.brokenLinks.length||!summary.independent.success||!summary.parseRetry.success||syntax.status!==0) process.exitCode=1;
