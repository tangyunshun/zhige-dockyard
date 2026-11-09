const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,old='docs/reviews/R0-parallel-four-batches-2026-11-08';
const read=p=>fs.readFileSync(p,'utf8'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tasks=[
 {n:1,owner:'A',file:old+'/01-A-F14.md',source:'F14 / R0-K1',deps:[]},
 {n:2,owner:'B',file:old+'/02-B-F15.md',source:'F15',deps:[]},
 {n:3,owner:'A',file:old+'/03-A-F16.md',source:'F16',deps:[1]},
 {n:4,owner:'B',file:old+'/04-B-INTEGRATION.md',source:'R0 integration',deps:[1,2,3]},
 {n:5,owner:'A',file:path.join(dir,'05-A-PAYMENT-FACTS.md'),source:'R1 / original 7.1-7.3,12',deps:[4]},
 {n:6,owner:'B',file:path.join(dir,'06-B-QUOTE-BUDGET.md'),source:'R2 / original 6,7.4,9 / CF-F05',deps:[4]},
 {n:7,owner:'A',file:path.join(dir,'07-A-SOURCE-REFUND-ENTITLEMENT.md'),source:'R1 / original 6.1,7.2 / CF-F04,F09',deps:[5,6]},
 {n:8,owner:'B',file:path.join(dir,'08-B-TASK-ATTEMPT-RECOVERY.md'),source:'R2 / original 7.4,9',deps:[5,6],contractGate:'Financial API contract from7 required before dependent integration'},
 {n:9,owner:'A',file:path.join(dir,'09-A-ENTERPRISE-LIFECYCLE.md'),source:'R4 / original8.1 and4.2 / CF-F01,F02,F03,F07,F08,F11',deps:[7,8]},
 {n:10,owner:'B',file:path.join(dir,'10-B-FIRST-VALUE.md'),source:'R3 / original5,6.1',deps:[7,8],contractGate:'Enterprise API contract from9 required before dependent UI'},
 {n:11,owner:'A',file:path.join(dir,'11-A-OPERATIONS-READINESS.md'),source:'R5 / original8.2,12,13 / CF-F06',deps:[9,10]},
 {n:12,owner:'B',file:path.join(dir,'12-B-VALUE-COST-METRICS.md'),source:'R5 / original6.2,10',deps:[9,10]},
 {n:13,owner:'A',file:path.join(dir,'13-A-INTEGRATION.md'),source:'Original9,13 / CF-F10',deps:[5,6,7,8,9,10,11,12]},
 {n:14,owner:'B',file:path.join(dir,'14-B-FINAL-VERIFICATION.md'),source:'Original12 and charter acceptance map',deps:[13]},
];
if(tasks.length!==14||tasks.some((x,i)=>x.n!==i+1||x.deps.some(n=>n>=x.n)))throw Error('Invalid finite dependency order');
const core=['00-MASTER.md','COMMON-RULES.md','DECISION-GATES.md','SCOPE-MAP.md'];
for(const name of [...core,'HANDOFF-REGISTER.md']){const s=read(path.join(dir,name));if(s.includes('\ufffd')||!s.trim())throw Error('Invalid document '+name);}
for(const task of tasks){const text=read(task.file);if(text.includes('\ufffd')||!text.trim())throw Error('Invalid prompt '+task.n);}
const intro=owner=>`# ${owner?'AGI-'+owner+'完整执行队列':'全部14批完整指令合订本'}\n\n生成于2026-11-08。先读下列最新总控/共同规则/决策门/范围表，再顺序执行${owner?'本AGI自有批次':'对应本人批次'}。这是指令包，不是已完成或验收报告。\n\n前四批正文原样保留，原四批共同规则仅用于1–4。用户现已要求全部后续开发后统一审核，第4批的最终送审等待改为中间交付；最终送审在14。旧正文中与此冲突的排程语句按本最新总控执行，其他安全/业务约束不变。不得同时执行同一AGI的多批，依赖和文件交棒必须满足。\n\n`;
const common=core.map(name=>'\n\n---\n\n'+read(path.join(dir,name))).join('')+'\n\n---\n\n# 前四批专用共同约束（仅1–4）\n\n'+read(old+'/COMMON-RULES.md');
const render=task=>'\n\n---\n\n# 批次 '+task.n+' / 执行AGI-'+task.owner+' / 原方案 '+task.source+'\n\n原件：'+task.file.replaceAll('\\','/')+'\n\n'+read(task.file);
fs.writeFileSync(path.join(dir,'ALL-INSTRUCTIONS.md'),intro(null)+common+tasks.map(render).join(''));
for(const owner of ['A','B'])fs.writeFileSync(path.join(dir,'AGI-'+owner+'-QUEUE.md'),intro(owner)+common+tasks.filter(x=>x.owner===owner).map(render).join(''));
const evidencePaths=['docs/PROJECT-DEVELOPMENT-CHARTER.md','docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md','docs/code-facts-2026-11-05/REPORT.md','src/app/api/payments/notify/wechat/route.ts','src/app/api/payments/notify/alipay/route.ts','src/lib/model-cost-admission.ts','src/lib/token-settlement-service.ts','src/app/api/open/v1/execute/route.ts'];
const evidence={capturedAt:new Date().toISOString(),kind:'Complete original-roadmap dispatch package; not implementation or new code acceptance',reviewerBusinessSourceChanges:0,taskCount:14,existingTasks:4,newTaskNumbers:tasks.filter(x=>x.n>4).map(x=>x.n),originalPlanCoverage:['R0','R1','R2','R3','R4','R5','original4.2/code-facts F01-F12','original5-14'],tasks:tasks.map(x=>({...x,file:x.file.replaceAll('\\','/'),sha256:hash(x.file)})),sourcePreflight:evidencePaths.map(file=>({path:file,sha256:hash(file)})),limits:['No implementation or tests run this turn','No real DB, vendor, model, payment, secrets, migration or deployment','No external AGI dispatch or receipt observed','Existing active development not source-frozen by this planning package','Commercial decisions and production evidence remain gated; no profitability guarantee'],schemaOwnership:'A1 then B4;5-12 fragments only;A13 final integration',finalIndependentReview:'After14 final same-version handoff in this chat',skills:['D:/agents-skills/dispatch-accept-verify/SKILL.md','D:/agents-skills/evidence-before-done/SKILL.md']};
fs.writeFileSync(path.join(dir,'planning-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
for(const [name,selected]of [['ALL-INSTRUCTIONS.md',tasks],['AGI-A-QUEUE.md',tasks.filter(x=>x.owner==='A')],['AGI-B-QUEUE.md',tasks.filter(x=>x.owner==='B')]]){
const data=read(path.join(dir,name));for(const t of selected)if(!data.includes(render(t)))throw Error('Aggregate omitted or altered task '+t.n);}
const artifacts={};for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isFile()&&e.name!=='artifact-sha256.json')artifacts[e.name]=hash(path.join(dir,e.name));
fs.writeFileSync(path.join(dir,'artifact-sha256.json'),JSON.stringify({capturedAt:new Date().toISOString(),artifacts},null,2)+'\n');
console.log(JSON.stringify({tasks:tasks.length,newPrompts:10,A:tasks.filter(x=>x.owner==='A').map(x=>x.n),B:tasks.filter(x=>x.owner==='B').map(x=>x.n),aggregateCharacters:read(path.join(dir,'ALL-INSTRUCTIONS.md')).length,artifacts:Object.keys(artifacts).length,businessSourceChanges:0,externalMessagesSent:0}));
