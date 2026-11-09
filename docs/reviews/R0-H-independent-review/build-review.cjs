// Reuse the IDE's closed-IO fixtures without editing its tests or business source.
const fs=require('node:fs'),assert=require('node:assert/strict');
const path='src/app/api/__tests__/r0h-cost-admission.test.ts',s=fs.readFileSync(path,'utf8');
const end=s.indexOf('describe("R0-H 纯准入函数');assert.ok(end>0);
fs.writeFileSync('docs/reviews/R0-H-independent-review/review.test.ts',s.slice(0,end)+fs.readFileSync('docs/reviews/R0-H-independent-review/cases.txt','utf8'));
