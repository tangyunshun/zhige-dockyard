const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,root=process.cwd(),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prior=JSON.parse(fs.readFileSync('docs/reviews/R0-I1-independent-review/manifest-verification.json','utf8'));
const end=JSON.parse(fs.readFileSync('docs/reviews/R0-I2-fix-snapshot/after-hashes.json','utf8'));
const current={},startHashReferences={};let protectedFiles=0;
for(const[p,v]of Object.entries(end)){if(hash(p)!==v.sha256After)throw Error('End mismatch '+p);current[p]=hash(p);if(prior.sha256[p]){if(v.sha256Start!==prior.sha256[p])throw Error('Start reference mismatch '+p);startHashReferences[p]=v.sha256Start;}}
for(const[p,v]of Object.entries(prior.sha256)){if(p.startsWith('src/')&&!(p in end)){if(hash(p)!==v)throw Error('Protected source changed '+p);current[p]=hash(p);protectedFiles++;}}
const snap='docs/reviews/R0-I2-fix-snapshot',manifestPresent=fs.existsSync(path.join(snap,'manifest.json'));
function filesIn(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesIn(path.join(p,e.name)):[path.join(p,e.name)]);}
const deliveryFiles=filesIn(snap);
fs.writeFileSync(path.join(dir,'manifest-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),endHashes:5,startHashReferences,protectedFiles,sha256:current,deliveryManifestPresent:manifestPresent,deliveryFiles,limits:'Start hash references match prior independent evidence; no delivered start copies or manifest found. Not equivalent to recovering exact pre-change source.'},null,2));
const source=fs.readFileSync('src/app/api/__tests__/r0h-cost-admission.test.ts','utf8'),marker='describe("R0-H2 纯准入函数';if(!source.includes(marker))throw Error('Missing harness boundary');
const prefix=source.slice(0,source.indexOf(marker));
let cases=fs.readFileSync('docs/reviews/R0-I1-independent-review/cold-cases.txt','utf8').replaceAll('R0-I1-independent-review','R0-I2-independent-review');
cases=cases.replace("deploymentId:'byo'","deploymentId:coldFixture.pref||'byo'");
cases=cases.replace("const writes=h.rawSql.filter(s=>/^EXEC\\s+(ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE)\\b/i.test(s));","const writes=h.rawSql.filter(s=>/^EXEC\\s/i.test(s)||/^QUERY\\s+(ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|RENAME|REPLACE)\\b/i.test(s));");
cases=cases.replace("expect(body.data.yuan).toBeNull();","expect(body.data.yuan).toBeNull();expect(body.data.blocked).toBe(true);expect(body.data.canExecute).toBe(false);");
cases=cases.replace("Expected write count reproduces current defect, not acceptance.","Current-version positive acceptance; all paths require zero writes.");
const base=[
{mode:'explicit',query:'&deploymentId=byo:w1',defaultId:'byo:w1',personal:false},
{mode:'space-default',query:'',defaultId:'byo:w1',personal:false},
{mode:'auto-default',query:'&deploymentId=auto',defaultId:'byo:w1',personal:false},
{mode:'personal-legacy',query:'',defaultId:'dep-1',personal:true,pref:'byo'},
{mode:'personal-canonical',query:'',defaultId:'dep-1',personal:true,pref:'byo:w1'}];
for(const b of base)for(const fail of [false,true]){const fixture={...b,mode:b.mode+(fail?'-missing':''),fail,status:fail?503:200,exec:0};fs.writeFileSync(path.join(dir,`cold-${fixture.mode}.test.ts`),prefix+'\nconst coldFixture='+JSON.stringify(fixture)+';\n'+cases);}
fs.writeFileSync(path.join(dir,'vitest.review.config.ts'),'import {defineConfig} from "vitest/config";import path from "node:path";export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-I2-independent-review/cold-*.test.ts"],isolate:true,fileParallelism:false,testTimeout:60000}});\n');
console.log(JSON.stringify({protectedFiles,endHashes:5,startHashReferences:Object.keys(startHashReferences).length,manifestPresent,deliveryFiles,coldFiles:10}));
