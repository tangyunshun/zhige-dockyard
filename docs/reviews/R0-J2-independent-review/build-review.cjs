const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const start=JSON.parse(fs.readFileSync('docs/reviews/R0-J2-fix-snapshot/manifest.json','utf8')),endDoc=JSON.parse(fs.readFileSync('docs/reviews/R0-J2-fix-snapshot/after-hashes.json','utf8')),end=endDoc.files,prior=JSON.parse(fs.readFileSync('docs/reviews/R0-J1-independent-review/manifest-verification.json','utf8'));
const sha256={};let copies=0,protectedFiles=0;const missingDeclaredNew=[];
for(const[p,v]of Object.entries(start.files)){if(v.isNew){if(!fs.existsSync(p))missingDeclaredNew.push(p);continue;}if(hash(v.snapshotCopy)!==v.sha256Start||prior.sha256[p]!==v.sha256Start)throw Error('Start mismatch '+p);sha256[v.snapshotCopy]=hash(v.snapshotCopy);copies++;}
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256End)throw Error('End mismatch '+p);sha256[p]=hash(p);}
for(const[p,v]of Object.entries(prior.sha256)){if((p.startsWith('src/')||p.startsWith('prisma/'))&&!(p in end)){if(hash(p)!==v)throw Error('Protected changed '+p);sha256[p]=hash(p);protectedFiles++;}}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:copies,endHashes:Object.keys(end).length,protectedFiles,missingDeclaredNew,sha256,fileStoreUnchanged:end['src/lib/file-store.ts'].sha256End===end['src/lib/file-store.ts'].sha256Start},null,2));
const p='src/app/api/__tests__/r0j2-storage-close.test.ts',source=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let harness=ast.statements.filter(n=>!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='describe')).map(n=>n.getFullText(ast)).join('').replaceAll('\r\n','\n');
function replace(a,b){if(!harness.includes(a))throw Error('Missing injection '+a.slice(0,60));harness=harness.replace(a,b);}
replace('tables, writes, unlinkFail, createFail,','tables, writes, unlinkFail, createFail, beforeUnlink:null as any, writeThenThrow:false, failReleaseOnce:false, missingOpDelegate:false, failConfirm:false, failDocDelete:false,');
replace('const norm = sql.replace(/\\s+/g, " ");','const norm = sql.replace(/\\s+/g, " "); if(h.failReleaseOnce&&norm.includes("storageUsed` = `storageUsed` -")){h.failReleaseOnce=false;throw Error("synthetic release write failed");}');
replace('record(name, "update");','record(name, "update"); if(name===\'storageoperation\'&&h.failConfirm)throw Error(\'synthetic confirm failed\');');
replace('record(name, "delete");','record(name, "delete"); if(name===\'document\'&&h.failDocDelete)throw Error(\'synthetic document cleanup failed\');');
replace('get: (_t, prop: string) => {','get: (_t, prop: string) => { if(prop===\'storageoperation\'&&h.missingOpDelegate)return undefined;');
replace('memFiles.set(p, data);','memFiles.set(p, data); if(h.writeThenThrow)throw Error("synthetic write response lost after persistence");');
replace('unlink: async (p: string) => {','unlink: async (p: string) => { if(h.beforeUnlink)await h.beforeUnlink(p);');
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+'\n'+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'paths.test.ts'),fs.readFileSync('docs/reviews/R0-J1-independent-review/paths.test.ts','utf8').replaceAll('R0-J1-independent-review','R0-J2-independent-review'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J2-independent-review/*.test.ts"],isolate:true,fileParallelism:false,testTimeout:60000}});\n');
console.log(JSON.stringify({startCopies:copies,endHashes:Object.keys(end).length,protectedFiles,missingDeclaredNew}));
