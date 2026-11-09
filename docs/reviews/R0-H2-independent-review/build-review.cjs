const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = __dirname;
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prior = JSON.parse(fs.readFileSync('docs/reviews/R0-H1-independent-review/manifest-verification.json', 'utf8'));
const start = JSON.parse(fs.readFileSync('docs/reviews/R0-H2-fix-snapshot/manifest.json', 'utf8'));
const end = JSON.parse(fs.readFileSync('docs/reviews/R0-H2-fix-snapshot/after-hashes.json', 'utf8'));
const protectedPaths = Object.keys(prior.sha256).filter(p => p.startsWith('src/') && !(p in end));
const sha256 = {};
for (const [p, fact] of Object.entries(start.files)) {
  if (hash(fact.snapshotCopy) !== fact.sha256 || prior.sha256[p] !== fact.sha256) throw Error('Start mismatch: ' + p);
  sha256[fact.snapshotCopy] = hash(fact.snapshotCopy);
}
for (const [p, fact] of Object.entries(end)) {
  if (hash(p) !== fact.sha256After) throw Error('End mismatch: ' + p);
  sha256[p] = hash(p);
}
for (const p of protectedPaths) {
  if (hash(p) !== prior.sha256[p]) throw Error('Protected change: ' + p);
  sha256[p] = hash(p);
}
for (const p of ['src/lib/model-registry.ts','src/lib/model-default-resolver.ts','src/lib/billing/pricing-center.ts','src/lib/billing/billing-config.ts']) {
  if(fs.existsSync(p)) sha256[p] = hash(p);
}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:Object.keys(start.files).length,endHashes:Object.keys(end).length,protectedFiles:protectedPaths.length,sha256},null,2));
const current = fs.readFileSync('src/app/api/__tests__/r0h-cost-admission.test.ts','utf8');
const marker = 'describe("R0-H2 纯准入函数';
if (!current.includes(marker)) throw Error('Test harness marker missing');
fs.writeFileSync(path.join(dir,'review.test.ts'), current.slice(0,current.indexOf(marker)) + fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
console.log(JSON.stringify({startCopies:3,endHashes:4,protectedFiles:protectedPaths.length,generated:'review.test.ts'}));
