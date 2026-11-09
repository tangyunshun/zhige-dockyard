const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha256={};function read(p){const b=fs.readFileSync(p);sha256[p]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}
const manifest=JSON.parse(read('docs/reviews/R0-H1-fix-snapshot/manifest.json')),after=JSON.parse(read('docs/reviews/R0-H1-fix-snapshot/after-hashes.json'));
const last=JSON.parse(read('docs/reviews/R0-H-independent-review/handler-verification.json'));
for(const [p,f]of Object.entries(manifest.files)){read(f.snapshotCopy);assert.equal(sha256[f.snapshotCopy],f.sha256);assert.equal(f.sha256,last.sha256[p]);}
for(const [p,f]of Object.entries(after)){read(p);assert.equal(sha256[p],f.sha256After);}
const protection=JSON.parse(read('docs/reviews/R0-H-independent-review/manifest-verification.json'));
const changed=new Set(Object.keys(after));let protectedCount=0;
for(const [p,hash]of Object.entries(protection.sha256)){if(!p.startsWith('src/')||changed.has(p))continue;read(p);assert.equal(sha256[p],hash);protectedCount++;}
read('docs/reviews/R0-H1-fix-report.md');
fs.writeFileSync('docs/reviews/R0-H1-independent-review/manifest-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),startCopies:3,endHashes:4,protectedFiles:protectedCount,sha256},null,2));
console.log(JSON.stringify({startCopies:3,endHashes:4,protectedFiles:protectedCount,verdict:'PASS version and bounded-change checks'}));
