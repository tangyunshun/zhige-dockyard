const fs=require('node:fs'),path=require('node:path');const dir=__dirname;
for(const name of ['handler','admission'])fs.writeFileSync(path.join(dir,name+'-review.test.ts'),fs.readFileSync(path.join(dir,name+'-fixture.txt'),'utf8')+'\n'+fs.readFileSync(path.join(dir,name+'-cases.txt'),'utf8'));
const formal=fs.readFileSync('docs/reviews/R0-K-independent-review/formal-copy.test.ts','utf8').replaceAll('R0-K-independent-review','R0-K1-implementation-review');
fs.writeFileSync(path.join(dir,'formal-review.test.ts'),formal);
for(const name of ['r0j-storage','r0j2-storage-close','r0j3-recovery-close']){
 const original=fs.readFileSync('src/app/api/__tests__/'+name+'.test.ts','utf8');
 const mock='\nvi.mock("@/lib/parse-admission",()=>({acquireParseLease:vi.fn(async(input:any)=>({leaseId:"isolated-parse",claimToken:"isolated-token",instanceId:"offline",userId:input.userId,workUnits:input.workUnits})),releaseParseLease:vi.fn(async()=>true),quarantineParseLease:vi.fn(async()=>{}),sweepParseLeases:vi.fn(async()=>0)}));\n';
 fs.writeFileSync(path.join(dir,'frozen-'+name+'-review.test.ts'),original+mock);
}
