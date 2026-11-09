const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const dir=__dirname,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const root='docs/reviews/R0-J5-fix-snapshot/',prior=JSON.parse(fs.readFileSync('docs/reviews/R0-J4-independent-review/manifest-verification.json','utf8'));
const start=JSON.parse(fs.readFileSync(root+'start-manifest.json','utf8').replace(/^\uFEFF/,'')),end=JSON.parse(fs.readFileSync(root+'end-manifest.json','utf8').replace(/^\uFEFF/,''));
const sha256={},startCopies=[],endCopies=[],changed=[],unchanged=[];
for(const x of start.files.filter(x=>x.status==='existing')){if(hash(root+x.snapshot)!==x.sha256||prior.sha256[x.path]!==x.sha256)throw Error('Start mismatch '+x.path);startCopies.push({path:x.path,hash:x.sha256});}
for(const x of end.files.filter(x=>x.endSha256)){if(hash(x.path)!==x.endSha256||hash(root+x.endSnapshot)!==x.endSha256)throw Error('End mismatch '+x.path);sha256[x.path]=hash(x.path);endCopies.push({path:x.path,hash:x.endSha256});}
for(const[p,v]of Object.entries(prior.sha256)){if(!p.startsWith('src/')&&!p.startsWith('prisma/'))continue;sha256[p]=hash(p);if(sha256[p]===v)unchanged.push(p);else changed.push(p);}
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),startCopies,endCopies,changed,unchanged,sha256},null,2));
// Reuse the inspected AST fixture extraction/injection machinery, with all output redirected here.
const old=fs.readFileSync('docs/reviews/R0-J4-independent-review/build-review.cjs','utf8');
const section=old.slice(old.indexOf("const p='src/app/api/__tests__/r0j3-recovery-close.test.ts'"),old.lastIndexOf('console.log(')).replaceAll('R0-J4-independent-review','R0-J5-independent-review');
new Function('require','__dirname','dir','fs','path','ts',section)(require,__dirname,dir,fs,path,ts);
const fixturePath=path.join(dir,'review.test.ts');let fixture=fs.readFileSync(fixturePath,'utf8');
const matchStart='for (const [k, v] of Object.entries(where || {})) {';
if(!fixture.includes(matchStart))throw Error('Missing compound-key fixture injection');
fixture=fixture.replace(matchStart,matchStart+'\n    if(k==="userId_workspaceId" && v && typeof v==="object"){for(const[f,fv]of Object.entries(v))if(row[f]!==fv)return false;continue;}');
fs.writeFileSync(fixturePath,fixture);
console.log(JSON.stringify({startCopies:startCopies.length,endCopies:endCopies.length,changed,unchanged:unchanged.length}));
