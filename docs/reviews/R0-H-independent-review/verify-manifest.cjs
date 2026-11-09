const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha256={};function read(p){const b=fs.readFileSync(p);sha256[p]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}
const manifest=JSON.parse(read('docs/reviews/R0-H-fix-snapshot/manifest.json')),after=JSON.parse(read('docs/reviews/R0-H-fix-snapshot/after-hashes.json'));
const before=JSON.parse(read('docs/reviews/R0-G1-independent-review/next-cost-verification.json'));
for(const [p,f]of Object.entries(manifest.files)){read(f.snapshotCopy);assert.equal(sha256[f.snapshotCopy],f.sha256);assert.equal(f.sha256,before.sha256[p]);}
for(const [p,f]of Object.entries(after)){read(p);assert.equal(sha256[p],f.sha256After);}
const last=JSON.parse(read('docs/reviews/R0-G1-independent-review/verification.json'));
const protectedFiles=['src/app/api/cron/workspace-subscription-expire/route.ts','src/app/api/system/maintenance/route.ts','src/lib/maintenance.ts','src/lib/credit-service.ts','src/lib/payment-gateway.ts','src/lib/payment/fulfill.ts','src/lib/payment/seat-addon-fulfill.ts','src/lib/security.ts','src/middleware.ts','src/app/admin/maintenance/page.tsx'];
for(const p of protectedFiles){read(p);assert.equal(sha256[p],last.sha256[p]);}
for(const p of ['src/lib/point-rate.ts','src/lib/component-cost-floor.ts','src/lib/model-pricing.ts','src/lib/model-adapter.ts','src/lib/billing/billing-config.ts','src/lib/billing/pricing-center.ts','src/components/WorkspaceInternalLayoutV3.tsx']){read(p);assert.equal(sha256[p],before.sha256[p]);}
read('docs/reviews/R0-H-fix-report.md');
fs.writeFileSync('docs/reviews/R0-H-independent-review/manifest-verification.json',JSON.stringify({capturedAt:new Date().toISOString(),startCopies:1,currentEndHashes:3,protectedFiles:protectedFiles.length+7,sha256},null,2));
console.log('PASS start/end hashes and 17 protected pricing/accounting/payment/maintenance/cron/page files');
