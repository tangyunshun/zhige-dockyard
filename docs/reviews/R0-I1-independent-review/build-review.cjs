const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const start=JSON.parse(fs.readFileSync('docs/reviews/R0-I1-fix-snapshot/manifest.json','utf8'));
const end=JSON.parse(fs.readFileSync('docs/reviews/R0-I1-fix-snapshot/after-hashes.json','utf8'));
const prior=JSON.parse(fs.readFileSync('docs/reviews/R0-I-independent-review/manifest-verification.json','utf8'));
const sha256={};let protectedFiles=0;
for(const[p,v]of Object.entries(start.files)){if(hash(v.snapshotCopy)!==v.sha256 || prior.sha256[p]!==v.sha256)throw Error('Start/prior mismatch '+p);sha256[v.snapshotCopy]=hash(v.snapshotCopy);}
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256After)throw Error('End mismatch '+p);sha256[p]=hash(p);}
for(const[p,v]of Object.entries(prior.sha256)){if(p.startsWith('src/')&&!(p in end)){if(hash(p)!==v)throw Error('Protected source change '+p);protectedFiles++;sha256[p]=hash(p);}}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:6,endHashes:6,protectedFiles,sha256},null,2));
const source=fs.readFileSync('src/app/api/__tests__/r0h-cost-admission.test.ts','utf8'),marker='describe("R0-H2 纯准入函数';
if(!source.includes(marker))throw Error('Harness marker missing');const prefix=source.slice(0,source.indexOf(marker));
fs.writeFileSync(path.join(dir,'review.test.ts'),prefix+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.copyFileSync(start.files['src/app/api/studio/handler.ts'].snapshotCopy,path.join(dir,'baseline-handler.ts'));
const cold=fs.readFileSync(path.join(dir,'cold-cases.txt'),'utf8');
for(const fixture of [
 {mode:'explicit',query:'&deploymentId=byo:w1',defaultId:'byo:w1',personal:false,fail:false,status:200,exec:0},
 {mode:'explicit-missing',query:'&deploymentId=byo:w1',defaultId:'byo:w1',personal:false,fail:true,status:503,exec:0},
 {mode:'space-default',query:'',defaultId:'byo:w1',personal:false,fail:false,status:200,exec:1},
 {mode:'auto-default',query:'&deploymentId=auto',defaultId:'byo:w1',personal:false,fail:false,status:200,exec:1},
 {mode:'personal-default',query:'',defaultId:'dep-1',personal:true,fail:false,status:200,exec:1},
])fs.writeFileSync(path.join(dir,`cold-${fixture.mode}.test.ts`),prefix+'\nconst coldFixture='+JSON.stringify(fixture)+';\n'+cold);
console.log(JSON.stringify({startCopies:6,endHashes:6,protectedFiles,isolatedColdFiles:5}));
