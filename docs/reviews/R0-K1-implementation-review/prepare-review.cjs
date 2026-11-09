const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,old='docs/reviews/R0-K-independent-review';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prior=json(old+'/manifest-verification.json'),files={...prior.sha256};
files['src/app/api/__tests__/r0k1-fixes.test.ts']=null;
const versions=[];
fs.mkdirSync(path.join(dir,'source'),{recursive:true});
for(const [file,previousSHA256] of Object.entries(files)){
 const currentSHA256=hash(file);const changed=currentSHA256!==previousSHA256;
 if(changed)fs.copyFileSync(file,path.join(dir,'source',file.replaceAll('/','__').replaceAll('[','(').replaceAll(']',')')+'.txt'));
 versions.push({path:file,previousSHA256,currentSHA256,changed,newToTrackedManifest:previousSHA256===null});
}
fs.writeFileSync(path.join(dir,'version-comparison.json'),JSON.stringify({capturedAt:new Date().toISOString(),files:versions,changedExisting:versions.filter(x=>x.changed&&!x.newToTrackedManifest).map(x=>x.path),protectedUnchanged:versions.filter(x=>!x.changed).length,reportExists:fs.existsSync('docs/reviews/R0-K1-fix-report.md'),snapshotExists:fs.existsSync('docs/reviews/R0-K1-fix-snapshot')},null,2)+'\n');
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-K1-implementation-review/*-review.test.ts","src/app/api/__tests__/r0k1-fixes.test.ts"],fileParallelism:false,isolate:true,testTimeout:20000}});\n');
const source=fs.readFileSync('src/app/api/__tests__/r0j3-recovery-close.test.ts','utf8'),ast=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
const fixture=ast.statements.filter(n=>{if(!ts.isExpressionStatement(n)||!ts.isCallExpression(n.expression))return true;const call=n.expression;if(call.expression.getText(ast)==='describe')return false;if(call.expression.getText(ast)==='vi.mock'&&call.arguments[0]?.text==='@/lib/text-extract')return false;return true;}).map(n=>n.getFullText(ast)).join('');
fs.writeFileSync(path.join(dir,'handler-fixture.txt'),fixture);
const admission=fs.readFileSync(old+'/admission-review.test.ts','utf8');
fs.writeFileSync(path.join(dir,'admission-fixture.txt'),admission.slice(0,admission.indexOf("describe('Production Prisma")));
console.log(JSON.stringify({changed:versions.filter(x=>x.changed).map(x=>x.path),protectedUnchanged:versions.filter(x=>!x.changed).length}));
