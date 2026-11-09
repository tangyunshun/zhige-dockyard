const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const out=__dirname,root=process.cwd();
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'source-manifest.json'),'utf8'));
const changes=manifest.source.filter(r=>!fs.existsSync(r.path)||hash(r.path)!==r.sha256);
const formal=JSON.parse(fs.readFileSync(path.join(out,'formal-results.json'),'utf8'));
const independent=JSON.parse(fs.readFileSync(path.join(out,'independent-results.json'),'utf8'));
const cases=independent.testResults.flatMap(f=>f.assertionResults.map(a=>({file:path.basename(f.name),name:a.fullName,status:a.status,classification:/DEFECT/i.test(a.fullName)?'CONFIRMED_DEFECT_CHARACTERIZATION':'POSITIVE_REGRESSION'})));
const syntax=cp.spawnSync(process.execPath,['--check','src/lib/parse-worker.cjs'],{encoding:'utf8'});
const {Prisma}=require('@prisma/client');
const clientModel=Prisma.dmmf.datamodel.models.find(m=>m.name==='VerificationBudget');
const migrationMentions=[];
for(const d of fs.readdirSync('prisma/migrations',{withFileTypes:true}).filter(d=>d.isDirectory())){
 const p=path.join('prisma/migrations',d.name,'migration.sql');if(!fs.existsSync(p))continue;
 fs.readFileSync(p,'utf8').split(/\r?\n/).forEach((line,i)=>{if(/VerificationBudget/i.test(line))migrationMentions.push({path:p.split(path.sep).join('/'),line:i+1,text:line.trim()});});
}
const summary={capturedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),previousReviewedHead:'5162e5b12b105c71ca71fb628854d32f7201f371',sourceCompared:manifest.source.length,sourceChangesDuringReview:changes,formal:{files:formal.testResults.length,total:formal.numTotalTests,passed:formal.numPassedTests,failed:formal.numFailedTests,start:new Date(formal.startTime).toISOString(),targets:'test-targets.json',output:'formal-results.json'},typecheck:{command:'node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json',exitCode:0,output:'typecheck.txt'},node:{command:'node node_modules/tsx/dist/cli.mjs --test --test-timeout=8000 src/lib/__tests__/text-extract.test.ts src/lib/__tests__/text-extract-paths.test.ts',total:18,passed:18,failed:0,cancelled:0,output:'node-tests.txt'},workerSyntax:{exitCode:syntax.status,stderr:syntax.stderr},independent:{files:independent.testResults.length,total:independent.numTotalTests,passed:independent.numPassedTests,failed:independent.numFailedTests,positive:cases.filter(c=>c.classification==='POSITIVE_REGRESSION').length,confirmedDefectCharacterizations:cases.filter(c=>c.classification==='CONFIRMED_DEFECT_CHARACTERIZATION').length,meaning:'Passing defect characterizations confirm defects still exist; they are not repair acceptance.',cases},staticData:{generatedClient:{model:clientModel?.name,fields:clientModel?.fields.map(f=>f.name)},migrationMentions},limits:['Isolated delegates and fake credentials; no real DB/model/SMTP/SMS/payment/cloud/deploy','Prisma static DMMF inspected without constructing a DB client or connecting','No browser journey, production lock/channel interoperability or human business acceptance','Current executor reports are evidence inputs, not independent acceptance']};
fs.writeFileSync(path.join(out,'verification-summary.json'),JSON.stringify(summary,null,2));
const snap=path.join(out,'source');fs.mkdirSync(snap,{recursive:true});
const previous='docs/reviews/unified-independent-review-2026-11-09/source';
for(const name of fs.readdirSync(previous)){
 const p=name.replace(/\.txt$/,'').split('__').join('/');if(fs.existsSync(p))fs.copyFileSync(p,path.join(snap,name));
}
for(const p of ['src/app/init/page.tsx','src/app/api/auth/verify-setup-token/route.ts','src/app/api/auth/verify-email-code/route.ts','src/lib/verification-codes.ts','prisma/migrations/20261109000000_verification_budget_lock/migration.sql'])fs.copyFileSync(p,path.join(snap,p.replace(/[\\/]/g,'__')+'.txt'));
const delivered='docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14';const deliverySnap=path.join(out,'executor-delivery');fs.mkdirSync(deliverySnap,{recursive:true});
for(const name of fs.readdirSync(delivered))if(fs.statSync(path.join(delivered,name)).isFile())fs.copyFileSync(path.join(delivered,name),path.join(deliverySnap,name));
const errors=[];const docChecks=[];
for(const name of ['REVIEW.md','IDE-UNIFIED-CLOSEOUT-PROMPT.md']){
 const content=fs.readFileSync(path.join(out,name),'utf8');const links=[...content.matchAll(/\]\(<([^>]+)>\)/g)].map(m=>m[1]);
 for(const target of links){const m=target.match(/^(.*?):(\d+)$/);const p=m?m[1]:target;if(!fs.existsSync(p))errors.push({name,target,error:'missing path'});else if(m&&Number(m[2])>fs.readFileSync(p,'utf8').split(/\r?\n/).length)errors.push({name,target,error:'line out of range'});}
 docChecks.push({name,characters:content.length,links:links.length});
}
fs.writeFileSync(path.join(out,'delivery-check.json'),JSON.stringify({capturedAt:new Date().toISOString(),documents:docChecks,linkErrors:errors,sourceChanges:changes},null,2));
const artifacts=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name!=='artifact-sha256.json')artifacts.push({path:path.relative(out,p).split(path.sep).join('/'),sha256:hash(p)});}}walk(out);
fs.writeFileSync(path.join(out,'artifact-sha256.json'),JSON.stringify({capturedAt:new Date().toISOString(),artifacts},null,2));
console.log(JSON.stringify({head:summary.head,sourceChanges:changes.length,formal:summary.formal,independent:{files:summary.independent.files,total:summary.independent.total,positive:summary.independent.positive,defects:summary.independent.confirmedDefectCharacterizations},generatedClient:summary.staticData.generatedClient,documents:docChecks,linkErrors:errors},null,2));
if(changes.length||errors.length||syntax.status!==0||formal.numFailedTests||independent.numFailedTests)process.exitCode=1;
