const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const root='docs/reviews/R0-K-fix-snapshot/',start=json(root+'start-manifest.json'),end=json(root+'end-manifest.json'),baseline=json('docs/reviews/R0-J6-independent-review/next-batch-baseline.json'),prior=json('docs/reviews/R0-J6-independent-review/manifest-verification.json');
const sha256={},starts=[],ends=[],changed=[],unchanged=[];
for(const x of start.files.filter(x=>x.status==='existing')){if(hash(root+x.snapshot)!==x.sha256)throw Error('Start copy mismatch '+x.path);if(baseline.sha256[x.path]&&baseline.sha256[x.path]!==x.sha256)throw Error('Prior baseline mismatch '+x.path);starts.push({path:x.path,sha256:x.sha256,matchedPrior:!!baseline.sha256[x.path]});}
const copyName=p=>p.replaceAll('/','__').replaceAll('[','(').replaceAll(']',')')+'.snapshot.txt';
for(const x of [...end.modifiedExisting,...end.newFiles,...end.unchangedVerified]){const expected=x.endSha256||x.sha256;if(!expected)continue;if(hash(x.path)!==expected)throw Error('Current end mismatch '+x.path);const copy=root+'end-source/'+copyName(x.path);if(hash(copy)!==expected)throw Error('End copy mismatch '+x.path);sha256[x.path]=expected;ends.push({path:x.path,sha256:expected});}
for(const[p,v]of Object.entries(prior.sha256)){if(!p.startsWith('src/')&&!p.startsWith('prisma/'))continue;sha256[p]=hash(p);if(sha256[p]===v)unchanged.push(p);else changed.push(p);}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),starts,ends,changedPreviouslyTracked:changed,unchangedPreviouslyTracked:unchanged,sha256},null,2));
// Author tests are copied unchanged except their staging path, to preserve any existing .next artifact.
let formal=fs.readFileSync('src/app/api/__tests__/r0k-parse-resource.test.ts','utf8');
const stage='path.join(process.cwd(), ".next", "server", "src", "lib", "parse-worker.cjs")';if(!formal.includes(stage))throw Error('Missing staging path');
formal=formal.replace(stage,'path.join(process.cwd(), "docs", "reviews", "R0-K-independent-review", "staged", "parse-worker.cjs")');
fs.writeFileSync(path.join(dir,'formal-copy.test.ts'),formal);
const p='src/app/api/__tests__/r0j3-recovery-close.test.ts',source=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let fixture=ast.statements.filter(n=>{
 if(!ts.isExpressionStatement(n)||!ts.isCallExpression(n.expression))return true;const call=n.expression;
 if(call.expression.getText(ast)==='describe')return false;
 if(call.expression.getText(ast)==='vi.mock'&&call.arguments[0]?.text==='@/lib/text-extract')return false;
 return true;
}).map(n=>n.getFullText(ast)).join('');
fs.writeFileSync(path.join(dir,'handler-review.test.ts'),fixture+'\n'+fs.readFileSync(path.join(dir,'handler-cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-K-independent-review/*.test.ts"],fileParallelism:false,isolate:true,testTimeout:20000}});\n');
console.log(JSON.stringify({startCopies:starts.length,endCopies:ends.length,changedPreviouslyTracked:changed,protectedUnchanged:unchanged.length}));
