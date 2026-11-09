const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const errors=[];
for(const name of ['REVIEW.md','IDE-UNIFIED-REPAIR-PROMPT.md']){
 const content=fs.readFileSync(path.join(__dirname,name),'utf8');
 const links=[...content.matchAll(/\]\(<([^>]+)>\)/g)].map(m=>m[1]);
 for(const target of links){
  const m=target.match(/^(.*?):(\d+)$/);const file=m?m[1]:target;
  if(!fs.existsSync(file))errors.push({name,target,error:'missing path'});
  else if(m&&Number(m[2])>fs.readFileSync(file,'utf8').split(/\r?\n/).length)errors.push({name,target,error:'line out of range'});
 }
 console.log(JSON.stringify({name,characters:content.length,links:links.length}));
}
const syntax=cp.spawnSync(process.execPath,['--check','src/lib/parse-worker.cjs'],{encoding:'utf8'});
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'source-manifest.json'),'utf8'));
const changed=manifest.source.filter(r=>!fs.existsSync(r.path)||crypto.createHash('sha256').update(fs.readFileSync(r.path)).digest('hex')!==r.sha256);
const result={capturedAt:new Date().toISOString(),linkErrors:errors,workerSyntax:{exitCode:syntax.status,stderr:syntax.stderr},sourceChanges:changed};
fs.writeFileSync(path.join(__dirname,'delivery-check.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));if(errors.length||changed.length||syntax.status!==0)process.exitCode=1;
