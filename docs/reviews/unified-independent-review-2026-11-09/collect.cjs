const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const out = __dirname;
const root = process.cwd();
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir,e.name);
    if(e.isDirectory()) walk(p);
    else if(/\.(ts|tsx|cjs|prisma|sql)$/.test(p)) files.push(p);
  }
}
walk(path.join(root,'src')); walk(path.join(root,'prisma'));
for(const p of ['package.json','tsconfig.json','next.config.js','vitest.config.ts']) if(fs.existsSync(p)) files.push(path.resolve(p));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rows = files.map(p=>({path:path.relative(root,p).split(path.sep).join('/'),sha256:hash(p)}));
const names=['billing/cost-reservation','billing/execution-orchestration','billing/refund-basis','billing/entitlement-read-guard','journey/first-value-journey','metrics/value-cost-metrics','operations/ops-readiness','tenant/enterprise-lifecycle'];
const imports=Object.fromEntries(names.map(n=>[n,[]]));
for(const p of files.filter(p=>/\.(ts|tsx)$/.test(p))) {
  fs.readFileSync(p,'utf8').split(/\r?\n/).forEach((s,i)=>{ for(const n of names) if(s.includes(n)) imports[n].push({path:path.relative(root,p).split(path.sep).join('/'),line:i+1,text:s.trim()}); });
}
const manifest={capturedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source:rows,imports};
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(out,'import-evidence.json'),JSON.stringify(imports,null,2));
console.log(JSON.stringify({head:manifest.head,sourceFiles:rows.length,imports:Object.fromEntries(names.map(n=>[n,{production:imports[n].filter(x=>!x.path.includes('__tests__')).length,tests:imports[n].filter(x=>x.path.includes('__tests__')).length}]))},null,2));
