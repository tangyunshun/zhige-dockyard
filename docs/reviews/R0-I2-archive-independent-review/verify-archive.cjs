const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const base='docs/reviews/R0-I2-fix-snapshot',old=JSON.parse(fs.readFileSync('docs/reviews/R0-I2-independent-review/manifest-verification.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8')),end=JSON.parse(fs.readFileSync(path.join(base,'after-hashes.json'),'utf8'));
if(manifest.reconstruction.status!=='RECOVERED_AFTER_REVIEW'||manifest.reconstruction.originalStartSnapshotMissing!==true)throw Error('Recovery origin not declared');
if(!Number.isFinite(Date.parse(manifest.capturedAtReal)))throw Error('Invalid actual generation time');
const copies=[];for(const[p,expected]of Object.entries(old.startHashReferences)){const f=manifest.files[p];if(!f)throw Error('Missing file entry '+p);const actual=hash(f.archiveCopy);if(actual!==expected||f.expectedStartSha256!==expected||f.actualSha256!==expected)throw Error('Copy mismatch '+p);copies.push({source:p,copy:f.archiveCopy,sha256:actual,bytes:fs.statSync(f.archiveCopy).size,match:true});}
const current=[];for(const[p,v]of Object.entries(end)){const actual=hash(p);if(actual!==v.sha256After)throw Error('Current delivery changed '+p);current.push({source:p,sha256:actual,match:true});}
let protectedFiles=0;for(const[p,expected]of Object.entries(old.sha256)){if(hash(p)!==expected)throw Error('Previous accepted version changed '+p);if(!(p in end))protectedFiles++;}
const report=fs.readFileSync('docs/reviews/R0-I2-fix-report.md','utf8');for(const text of ['RECOVERED_AFTER_REVIEW','原开工快照缺失','未执行真实回滚','归档已补交待核对'])if(!report.includes(text))throw Error('Report must clarify '+text);
const newer='src/app/api/__tests__/r0i2-cold-quote.test.ts';if(end[newer].sha256Start!=='(本批新增文件)')throw Error('New file origin unclear');
const result={checkedAt:new Date().toISOString(),verdict:'R0-I2_ARCHIVE_ACCEPTED',closedIssue:'I2-ARCHIVE-MISSING',copies,current,protectedFiles,reusedEvidence:{source:'docs/reviews/R0-I2-independent-review/validation-results.json',reason:'All 29 accepted source hashes unchanged',formalTests:407,independentColdTests:10,typecheckExitCode:0,rerun:false},limits:'Independent file reads and SHA256 verification only; no rollback, database, provider or payment access.'};
fs.writeFileSync(path.join(__dirname,'verification-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({verdict:result.verdict,startCopies:copies.length,currentFiles:current.length,protectedFiles}));
