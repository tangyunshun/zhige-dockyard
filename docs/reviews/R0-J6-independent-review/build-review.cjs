const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const root='docs/reviews/R0-J6-fix-snapshot/',prior=json('docs/reviews/R0-J5-independent-review/manifest-verification.json'),start=json(root+'start-manifest.json'),end=json(root+'end-manifest.json');
const sha256={},startCopies=[],endCopies=[],changed=[],unchanged=[];
for(const x of start.files.filter(x=>x.status==='existing')){if(hash(root+x.snapshot)!==x.sha256||prior.sha256[x.path]!==x.sha256)throw Error('Start mismatch '+x.path);startCopies.push({path:x.path,sha256:x.sha256});}
for(const x of end.files.filter(x=>x.endSha256)){if(hash(x.path)!==x.endSha256||hash(root+x.endSnapshot)!==x.endSha256)throw Error('End mismatch '+x.path);sha256[x.path]=hash(x.path);endCopies.push({path:x.path,sha256:x.endSha256});}
for(const x of end.unchangedVerified){const copy=root+'end-source/'+x.path.replaceAll('/','__')+'.snapshot.txt';if(hash(x.path)!==x.sha256||hash(copy)!==x.sha256)throw Error('Unchanged end copy mismatch '+x.path);endCopies.push({path:x.path,sha256:x.sha256,unchanged:true});}
for(const[p,v]of Object.entries(prior.sha256)){if(!p.startsWith('src/')&&!p.startsWith('prisma/'))continue;sha256[p]=hash(p);if(sha256[p]===v)unchanged.push(p);else changed.push(p);}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies,endCopies,changed,unchanged,sha256},null,2));
// Prior independent harness has actual module imports and memory IO boundaries; only old defect targets change.
let s=fs.readFileSync('docs/reviews/R0-J5-independent-review/review.test.ts','utf8').replaceAll('R0-J5-independent-review','R0-J6-independent-review');
const a="expect(rb.status).toBe(500);expect(bb.code).toBe('STORAGE_RELEASE_DRIFT');";
if(!s.includes(a))throw Error('Missing old concurrent target');
s=s.replace(a,"expect(rb.status).toBe(200);expect(bb.data.pendingCleared).toBe(true);expect(bb.code).toBeUndefined();");
const count='expect(body.storage.pendingCount).toBe(0);';if(s.split(count).length!==3)throw Error('Unexpected pending count targets');
s=s.replaceAll(count,'expect(body.storage.pendingCount).toBe(1);').replaceAll('characterization:','acceptance:').replaceAll('-characterization','-positive');
fs.writeFileSync(path.join(dir,'review.test.ts'),s+'\n'+fs.readFileSync(path.join(dir,'extra-cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J6-independent-review/review.test.ts"],fileParallelism:false,isolate:true,testTimeout:15000}});\n');
fs.writeFileSync(path.join(dir,'verify-ui.cjs'),fs.readFileSync('docs/reviews/R0-J5-independent-review/verify-ui.cjs','utf8'));
console.log(JSON.stringify({startCopies:startCopies.length,endCopies:endCopies.length,changed,unchanged:unchanged.length}));
