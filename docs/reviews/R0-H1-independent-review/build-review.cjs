// Audit only: create a closed-IO review fixture in this directory, never edit business source/tests.
const fs=require('node:fs'),assert=require('node:assert/strict');
const s=fs.readFileSync('src/app/api/__tests__/r0h-cost-admission.test.ts','utf8'),end=s.indexOf('describe("R0-H1 纯准入函数');assert.ok(end>0);
fs.writeFileSync('docs/reviews/R0-H1-independent-review/review.test.ts',s.slice(0,end)+fs.readFileSync('docs/reviews/R0-H1-independent-review/cases.txt','utf8'));
