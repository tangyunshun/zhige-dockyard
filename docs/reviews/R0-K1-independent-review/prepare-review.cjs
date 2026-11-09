const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,old=path.join(dir,'../R0-K-independent-review');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baseline=json(path.join(old,'manifest-verification.json'));
const files=Object.entries(baseline.sha256).map(([file,previousSHA256])=>({path:file,previousSHA256,currentSHA256:fs.existsSync(file)?hash(file):null}));
const changed=files.filter(x=>x.currentSHA256!==x.previousSHA256);
const historicalArtifacts=json(path.join(old,'artifact-sha256.json'));
const changedHistoricalArtifacts=Object.entries(historicalArtifacts.artifacts).filter(([name,expected])=>!fs.existsSync(path.join(old,name))||hash(path.join(old,name))!==expected).map(([name])=>name);
for(const name of ['handler-review.test.ts','admission-review.test.ts','parser-review.test.ts']){
 const source=fs.readFileSync(path.join(old,name),'utf8');
 fs.writeFileSync(path.join(dir,name),source.replaceAll('docs/reviews/R0-K-independent-review/','docs/reviews/R0-K1-independent-review/'));
}
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-K1-independent-review/*-review.test.ts"],fileParallelism:false,isolate:true,testTimeout:20000}});\n');
const record={capturedAt:new Date().toISOString(),baseline:'docs/reviews/R0-K-independent-review/manifest-verification.json',total:files.length,changed:changed.length,unchanged:files.length-changed.length,files,changedHistoricalArtifacts,delivery:{expectedReport:'docs/reviews/R0-K1-fix-report.md',reportExists:fs.existsSync('docs/reviews/R0-K1-fix-report.md'),expectedSnapshot:'docs/reviews/R0-K1-fix-snapshot',snapshotExists:fs.existsSync('docs/reviews/R0-K1-fix-snapshot')},userClarification:'IDE did not modify code; deleting issues is not a fix. Audit original KR1-KR7 and provide detailed implementation prompt.',reviewerBusinessSourceChanges:0};
fs.writeFileSync(path.join(dir,'version-comparison.json'),JSON.stringify(record,null,2)+'\n');
if(changed.length)throw Error('Unexpected new source version; reassess before rerunning old characterization cases');
console.log(JSON.stringify({total:record.total,changed:record.changed,changedHistoricalArtifacts,reportExists:record.delivery.reportExists,snapshotExists:record.delivery.snapshotExists}));
