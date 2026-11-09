// Reconstruct in memory only, to check that the reviewed edits explain the prior/current hashes.
// This does not create or claim any original start snapshot and never writes business source.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest-verification.json'),'utf8')).startHashReferences;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');const result=[];
function check(p,s,description){const candidates=[s,s.replaceAll('\n','\r\n'),s.replace(/\n+$/,'\n'),s.replace(/\n+$/,'\n\n')];const match=candidates.find(c=>digest(c)===prior[p]);if(!match)throw Error('Unexplained difference '+p+' candidateBytes='+Buffer.byteLength(s));result.push({file:p,priorSha256:prior[p],matched:true,description,method:'In-memory inverse of reviewed changes; hash matched previous independent review. Not an original captured snapshot.'});}
let p='src/app/api/billing/estimate/route.ts',s=read(p);
s=s.replace(/\? await resolveDefaultDeployment\(\{\n\s+workspaceId,\n\s+requiredCapabilities,\n\s+userId: auth\.user\.id,\n\s+readOnlyResolution: true,[^\n]*\n\s+\}\)/,'? await resolveDefaultDeployment({ workspaceId, requiredCapabilities, userId: auth.user.id })');
check(p,s,'Only default branch adds server-side read-only flag');
p='src/lib/model-registry.ts';s=read(p).replace(/  \/\*\* \[R0-I2\][^\n]*\n  readOnlyResolution\?: boolean;\n/,'').replace(/const byoPlan = await tryResolveWorkspaceByoDefault\(params\.workspaceId, requiredCaps, params\.userId, \{\n\s+readOnly: params\.readOnlyResolution === true,\n\s+\}\);/,'const byoPlan = await tryResolveWorkspaceByoDefault(params.workspaceId, requiredCaps, params.userId);');
check(p,s,'Only default resolver parameter and forwarding added');
p='src/lib/workspace-byo-model.ts';s=read(p).replace(/  \/\*\* \[R0-I2\][^\n]*\n  opts\?: \{ readOnly\?: boolean \},\n/,'').replace('await ensureByoShareWithMembersColumn({ readOnly: opts?.readOnly === true });','await ensureByoShareWithMembersColumn();');
check(p,s,'Only optional helper parameter and forwarding added');
p='src/app/api/__tests__/r0h-cost-admission.test.ts';const marker='describe("R0-H2 纯准入函数';const old=fs.readFileSync('docs/reviews/R0-I1-independent-review/review.test.ts','utf8');const now=fs.readFileSync(p,'utf8');
const oldCases=fs.readFileSync('docs/reviews/R0-I1-independent-review/cases.txt','utf8');if(!old.endsWith(oldCases))throw Error('Old prefix evidence boundary missing');
s=old.slice(0,old.length-oldCases.length)+now.slice(now.indexOf(marker));let count=0;
s=s.replaceAll('expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);',()=>++count===1?'expect(h.rawSql.some((s) => s.startsWith("ALTER"))).toBe(false);':'expect(h.rawSql.some((s) => s.startsWith("ALTER") || s.startsWith("INSERT") || s.startsWith("UPDATE") || s.startsWith("DELETE"))).toBe(false);');
if(count!==2)throw Error('Unexpected changed assertion count '+count);
check(p,s,'Only raw SQL classifier/self-check added and two write assertions corrected');
fs.writeFileSync(path.join(__dirname,'difference-verification.json'),JSON.stringify({capturedAt:new Date().toISOString(),results:result,sourceFilesWritten:0},null,2));console.log('PASS 4 exact prior hashes reconstructed in memory; reviewed changes fully explain source differences.');
