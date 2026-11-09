const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),dir=__dirname;
const start=JSON.parse(fs.readFileSync('docs/reviews/R0-J-fix-snapshot/manifest.json','utf8')),end=JSON.parse(fs.readFileSync('docs/reviews/R0-J-fix-snapshot/after-hashes.json','utf8'));
const prior=JSON.parse(fs.readFileSync('docs/reviews/R0-J-preflight/verification-results.json','utf8')),protectedPrior=JSON.parse(fs.readFileSync('docs/reviews/R0-I2-independent-review/manifest-verification.json','utf8'));
const sha256={},preflightReferenceDrift=[];for(const[p,v]of Object.entries(start.files)){if(hash(v.snapshotCopy)!==v.sha256Start)throw Error('Start copy mismatch '+p);if(prior.sha256[p]!==v.sha256Start)preflightReferenceDrift.push({file:p,declaredStart:v.sha256Start,currentPreflightHash:prior.sha256[p]});sha256[v.snapshotCopy]=hash(v.snapshotCopy);}
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256After)throw Error('End mismatch '+p);sha256[p]=hash(p);}
let protectedFiles=0;for(const[p,v]of Object.entries({...protectedPrior.sha256,...prior.sha256})){if(!(p in end)){if(hash(p)!==v)throw Error('Protected source changed '+p);sha256[p]=hash(p);protectedFiles++;}}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:4,endHashes:5,protectedFiles,preflightReferenceDrift,sha256},null,2));
const p='src/app/api/__tests__/r0j-storage.test.ts',source=fs.readFileSync(p,'utf8');const ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let harness=ast.statements.filter(n=>!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='describe')).map(n=>n.getFullText(ast)).join('').replaceAll('\r\n','\n');
function replace(a,b){if(!harness.includes(a))throw Error('Missing injection point '+a.slice(0,50));harness=harness.replace(a,b);}
replace('return { tables, writes, rawSql, setRawGate, getRawGate: () => rawGateVal, unlinkFail };','return { tables, writes, rawSql, setRawGate, getRawGate: () => rawGateVal, unlinkFail, afterQuotaRead: null as any, beforeUnlink: null as any, createDocFail: false, writeThenThrow: false, docDeleteFail: false };');
replace('for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];\n        return out;','for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];\n        if(name === "workspacequota" && h.afterQuotaRead){const f=h.afterQuotaRead;h.afterQuotaRead=null;f();}\n        return out;');
replace('record("ROOT", name, "create");','record("ROOT", name, "create"); if(name === "document" && h.createDocFail)throw Error("synthetic document create failure");');
replace('record("ROOT", name, "delete");','record("ROOT", name, "delete"); if(name === "document" && h.docDeleteFail)throw Error("synthetic document delete failure");');
replace('const gate = h.getRawGate();','h.rawSql.push(sql); const gate = h.getRawGate();');
replace('memFiles.set(p, data);','memFiles.set(p, data); if(h.writeThenThrow)throw Error("synthetic uncertain write after bytes persisted");');
replace('unlink: async (p: string) => {','unlink: async (p: string) => { if(h.beforeUnlink) await h.beforeUnlink(p);');
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+'\n'+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J-independent-review/*.test.ts"],isolate:true,fileParallelism:false,testTimeout:60000}});\n');
console.log(JSON.stringify({startCopies:4,endHashes:5,protectedFiles,harness:'Existing IO fixture with describe suites removed; added fault injection only. Actual handlers and services unchanged.'}));
