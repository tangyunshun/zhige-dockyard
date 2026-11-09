const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prior=JSON.parse(fs.readFileSync('docs/reviews/R0-J3-independent-review/manifest-verification.json','utf8'));
const sha256={},changedSinceJ3=[],snapshots=[];let unchanged=0;
for(const[p,v]of Object.entries(prior.sha256))if(p.startsWith('src/')||p.startsWith('prisma/')){const current=hash(p);sha256[p]=current;if(current!==v)changedSinceJ3.push({path:p,prior:v,current});else unchanged++;}
const newTest='src/app/api/__tests__/r0j4-storage-fixes.test.ts';sha256[newTest]=hash(newTest);
for(const p of ['src/lib/storage-quota.ts','src/app/api/studio/handler.ts','src/app/api/workspace/clear-data/route.ts']){
 const name=p.replaceAll('/','__')+'.snapshot.txt';
 const start='docs/reviews/R0-J4-fix-snapshot/frozen-source/'+name,end='docs/reviews/R0-J4-fix-snapshot/end-source/'+name;
 snapshots.push({path:p,startHash:hash(start),endHash:hash(end),endMatchesCurrent:hash(end)===hash(p),startMatchesLastAudit:hash(start)===prior.sha256[p]});
}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),sha256,changedSinceJ3,unchangedPreviouslyTrackedSources:unchanged,snapshots,newTestHash:hash(newTest),limits:'J4 report provides 3 start/end text pairs, no machine-readable manifest or timestamp; their start state differs from last independent audit. Current whole delta is audited, not just the reported 20-line session.'},null,2));
const p='src/app/api/__tests__/r0j3-recovery-close.test.ts',source=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let harness=ast.statements.filter(n=>!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='describe')).map(n=>n.getFullText(ast)).join('').replaceAll('\r\n','\n');
function inject(a,b){if(!harness.includes(a))throw Error('Missing injection '+a);harness=harness.replace(a,b);}
inject('tables, writes, unlinkFail, createFail, deleteFail, updateFail,','tables, writes, unlinkFail, createFail, deleteFail, updateFail, beforeUnlink:null as any, afterDocDelete:null as any, beforeOpRead:null as any, beforeOpFirst:null as any, beforeOpMany:null as any, beforeOpCreate:null as any,');
inject('findUnique: async ({ where, select }: any) => {','findUnique: async ({ where, select }: any) => { if(name==="storageoperation" && h.beforeOpRead)await h.beforeOpRead(where);');
inject('findFirst: async ({ where, select }: any) => {','findFirst: async ({ where, select }: any) => { if(name==="storageoperation" && h.beforeOpFirst)await h.beforeOpFirst(where);');
inject('findMany: async ({ where, select }: any) =>\n      rows().filter((r) => matchRow(r, where)).map((r) => (select ? selectFields(r, select) : { ...r })),','findMany: async ({ where, select }: any) => { if(name==="storageoperation" && h.beforeOpMany)await h.beforeOpMany(where);return rows().filter((r)=>matchRow(r,where)).map((r)=>(select?selectFields(r,select):{...r})); },');
inject('create: async ({ data }: any) => {','create: async ({ data }: any) => { if(name==="storageoperation" && h.beforeOpCreate)await h.beforeOpCreate(data);');
inject('      return { count };\n    },\n    upsert:', '      if(name==="document" && h.afterDocDelete)await h.afterDocDelete({where,count});\n      return { count };\n    },\n    upsert:');
inject('unlink: async (p: string) => {','unlink: async (p: string) => { if(h.beforeUnlink)await h.beforeUnlink(p);');
inject('  seedWorkspace();\n});','  h.beforeUnlink=null;h.afterDocDelete=null;h.beforeOpRead=null;h.beforeOpFirst=null;h.beforeOpMany=null;h.beforeOpCreate=null;\n  seedWorkspace();\n});');
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+'\n'+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J4-independent-review/review.test.ts"],fileParallelism:false,isolate:true,testTimeout:15000}});\n');
fs.writeFileSync(path.join(dir,'verify-ui.cjs'),fs.readFileSync('docs/reviews/R0-J3-independent-review/verify-ui.cjs','utf8'));
console.log(JSON.stringify({changedSinceJ3:changedSinceJ3.map(x=>x.path),unchangedPreviouslyTrackedSources:unchanged,snapshots}));
