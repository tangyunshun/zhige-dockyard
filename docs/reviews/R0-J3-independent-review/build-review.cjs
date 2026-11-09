const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const dir = __dirname, hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const start = JSON.parse(fs.readFileSync('docs/reviews/R0-J3-fix-snapshot/manifest.json','utf8'));
const end = JSON.parse(fs.readFileSync('docs/reviews/R0-J3-fix-snapshot/after-hashes.json','utf8'));
const prior = JSON.parse(fs.readFileSync('docs/reviews/R0-J2-independent-review/manifest-verification.json','utf8'));
const sha256 = {}; let copies = 0, protectedFiles = 0;
for (const [p,v] of Object.entries(start.files)) {
  if (hash(v.snapshotCopy) !== v.sha256Start || prior.sha256[p] !== v.sha256Start) throw Error('Start mismatch '+p);
  sha256[v.snapshotCopy] = hash(v.snapshotCopy); copies++;
}
for (const [p,v] of Object.entries(end.files)) { if(hash(p)!==v.sha256End)throw Error('End mismatch '+p); sha256[p]=hash(p); }
for (const [p,v] of Object.entries(prior.sha256)) {
  if ((p.startsWith('src/') || p.startsWith('prisma/')) && !(p in end.files)) {
    if(hash(p)!==v)throw Error('Protected changed '+p);sha256[p]=hash(p);protectedFiles++;
  }
}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies:copies,endHashes:Object.keys(end.files).length,protectedFiles,sha256},null,2));
const p='src/app/api/__tests__/r0j3-recovery-close.test.ts', source=fs.readFileSync(p,'utf8'),ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
let harness=ast.statements.filter(n=>!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='describe')).map(n=>n.getFullText(ast)).join('').replaceAll('\r\n','\n');
function inject(a,b){if(!harness.includes(a))throw Error('Missing injection '+a);harness=harness.replace(a,b);}
inject('tables, writes, unlinkFail, createFail, deleteFail, updateFail,','tables, writes, unlinkFail, createFail, deleteFail, updateFail, beforeUnlink: null as any, afterDocDelete: null as any, beforeOpRead: null as any, beforeOpCreate: null as any,');
inject('findUnique: async ({ where, select }: any) => {','findUnique: async ({ where, select }: any) => { if(name === "storageoperation" && h.beforeOpRead) await h.beforeOpRead(where);');
inject('create: async ({ data }: any) => {','create: async ({ data }: any) => { if(name === "storageoperation" && h.beforeOpCreate) await h.beforeOpCreate(data);');
inject('      return { count };\n    },\n    upsert:', '      if(name === "document" && h.afterDocDelete) await h.afterDocDelete({where,count});\n      return { count };\n    },\n    upsert:');
inject('unlink: async (p: string) => {','unlink: async (p: string) => { if(h.beforeUnlink) await h.beforeUnlink(p);');
inject('  seedWorkspace();\n});','  h.beforeUnlink=null; h.afterDocDelete=null; h.beforeOpRead=null; h.beforeOpCreate=null;\n  seedWorkspace();\n});');
fs.writeFileSync(path.join(dir,'review.test.ts'),harness+'\n'+fs.readFileSync(path.join(dir,'cases.txt'),'utf8'));
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-J3-independent-review/review.test.ts"],isolate:true,fileParallelism:false,testTimeout:15000}});\n');
fs.writeFileSync(path.join(dir,'verify-ui.cjs'),fs.readFileSync('docs/reviews/R0-J3-fix-snapshot/verify-r0j3-ui-callbacks.cjs','utf8'));
console.log(JSON.stringify({startCopies:copies,endHashes:Object.keys(end.files).length,protectedFiles}));
