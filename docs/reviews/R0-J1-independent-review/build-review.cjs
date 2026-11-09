const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const start=JSON.parse(fs.readFileSync('docs/reviews/R0-J1-fix-snapshot/manifest.json','utf8')),end=JSON.parse(fs.readFileSync('docs/reviews/R0-J1-fix-snapshot/after-hashes.json','utf8')),prior=JSON.parse(fs.readFileSync('docs/reviews/R0-J-independent-review/manifest-verification.json','utf8'));
const sha256={};let copies=0,protectedFiles=0;const missingDeclaredNew=[];
for(const[p,v]of Object.entries(start.files)){if(v.isNew){if(!fs.existsSync(p))missingDeclaredNew.push(p);continue;}if(hash(v.snapshotCopy)!==v.sha256Start||prior.sha256[p]!==v.sha256Start)throw Error('Start mismatch '+p);sha256[v.snapshotCopy]=hash(v.snapshotCopy);copies++;}
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256After)throw Error('End mismatch '+p);sha256[p]=hash(p);}
for(const[p,v]of Object.entries(prior.sha256)){if((p.startsWith('src/')||p.startsWith('prisma/'))&&!(p in end)){if(hash(p)!==v)throw Error('Protected changed '+p);sha256[p]=hash(p);protectedFiles++;}}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:copies,endHashes:Object.keys(end).length,protectedFiles,missingDeclaredNew,sha256,clearDataUnchanged:end['src/app/api/workspace/clear-data/route.ts'].sha256After===end['src/app/api/workspace/clear-data/route.ts'].sha256Start},null,2));
const p='src/app/api/__tests__/r0j-storage.test.ts',source=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let harness=ast.statements.filter(n=>!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='describe')).map(n=>n.getFullText(ast)).join('').replaceAll('\r\n','\n');
function replace(a,b){if(!harness.includes(a))throw Error('Missing injection '+a.slice(0,50));harness=harness.replace(a,b);}
replace('return { tables, writes, rawSql, setRawGate, getRawGate: () => rawGateVal, unlinkFail };','return { tables, writes, rawSql, setRawGate, getRawGate: () => rawGateVal, unlinkFail, beforeUnlink:null as any, createDocFail:false,writeThenThrow:false,strictOpId:false,failOpCreate:false,failOpUpdate:false,missingOpDelegate:false };');
replace('record("ROOT", name, "create");',`record("ROOT", name, "create");
 if(name==='document'&&h.createDocFail)throw Error('synthetic document create failure');
 if(name==='storageoperation'){
  if(h.failOpCreate)throw Error('synthetic operation create failed');
  if(h.strictOpId&&!data.id)throw Object.assign(Error('Argument id is missing, required by storageoperation schema'),{name:'PrismaClientValidationError'});
  if(rows().some(r=>r.opId===data.opId))throw Object.assign(Error('synthetic unique opId violation'),{code:'P2002'});
 }`);
replace('record("ROOT", name, "update");','record("ROOT", name, "update"); if(name===\'storageoperation\'&&h.failOpUpdate)throw Error(\'synthetic operation update failed\');');
replace('get: (_t, prop: string) => {',`get: (_t, prop: string) => {
 if(prop==='storageoperation'&&h.missingOpDelegate)return undefined;
 if(prop==='$transaction')return async(fn:any)=>{const run=async()=>{const snap=structuredClone(h.tables);try{return await fn(makePrisma());}catch(e){h.tables=snap;throw e;}};const pending=txQueue.then(run,run);txQueue=pending.catch(()=>{});return pending;};`);
replace('const gate = h.getRawGate();','h.rawSql.push(sql); const gate = h.getRawGate();');
replace('memFiles.set(p, data);','memFiles.set(p, data); if(h.writeThenThrow)throw Error("synthetic uncertain write after persistence");');
replace('unlink: async (p: string) => {','unlink: async (p: string) => { if(h.beforeUnlink)await h.beforeUnlink(p);');
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+'\n'+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J1-independent-review/*.test.ts"],isolate:true,fileParallelism:false,testTimeout:60000}});\n');
console.log(JSON.stringify({startCopies:copies,endHashes:Object.keys(end).length,protectedFiles,missingDeclaredNew}));
