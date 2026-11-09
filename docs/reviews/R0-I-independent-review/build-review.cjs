const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const start=JSON.parse(fs.readFileSync('docs/reviews/R0-I-fix-snapshot/manifest.json','utf8'));
const end=JSON.parse(fs.readFileSync('docs/reviews/R0-I-fix-snapshot/after-hashes.json','utf8'));
const prior=JSON.parse(fs.readFileSync('docs/reviews/R0-H2-independent-review/manifest-verification.json','utf8'));
const sha256={};let comparableStart=0,protectedFiles=0;
for(const[p,v]of Object.entries(start.files)){if(hash(v.snapshotCopy)!==v.sha256)throw Error('Snapshot mismatch '+p);if(prior.sha256[p]){if(prior.sha256[p]!==v.sha256)throw Error('Prior mismatch '+p);comparableStart++;}sha256[v.snapshotCopy]=hash(v.snapshotCopy);}
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256After)throw Error('End mismatch '+p);sha256[p]=hash(p);}
for(const[p,v]of Object.entries(prior.sha256)){if(p.startsWith('src/')&&!(p in end)){if(hash(p)!==v)throw Error('Protected change '+p);protectedFiles++;sha256[p]=hash(p);}}
for(const p of ['src/lib/quota-cycle.ts','src/lib/workspace-byo-model.ts','src/lib/model-registry.ts','src/app/api/workspace/byo-model/test/route.ts','src/lib/billing/billing-config.ts','src/lib/billing/pricing-center.ts'])sha256[p]=hash(p);
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:Object.keys(start.files).length,comparableStart,endHashes:Object.keys(end).length,protectedFiles,sha256},null,2));
let harness=fs.readFileSync('src/app/api/__tests__/r0h-cost-admission.test.ts','utf8');
const marker='describe("R0-H2 纯准入函数';if(!harness.includes(marker))throw Error('Missing marker');harness=harness.slice(0,harness.indexOf(marker));
// Extend only the memory IO fake: record raw SQL attempts; never touch a real client.
const rawMarker='if (prop === "$transaction") {';if(!harness.includes(rawMarker))throw Error('Missing raw boundary marker');
harness=harness.replace(rawMarker,'if (prop === "$executeRawUnsafe" || prop === "$executeRaw" || prop === "$queryRawUnsafe" || prop === "$queryRaw") { return async (...args: unknown[]) => { rawIo.push({method: prop, args}); return prop.startsWith("$execute") ? 0 : []; }; }\n        '+rawMarker);
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.copyFileSync(start.files['src/app/api/studio/handler.ts'].snapshotCopy,path.join(dir,'baseline-handler.ts'));
console.log(JSON.stringify({startCopies:7,comparableStart,endHashes:7,protectedFiles}));
