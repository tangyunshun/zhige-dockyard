const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname;
const json=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const versions=json('version-comparison.json'),results=json('independent-results.json');
for(const row of versions.files){if(hash(row.path)!==row.currentSHA256)throw Error('Source changed: '+row.path);}
if(results.numTotalTests!==18||results.numPassedTests!==18||results.numFailedTests!==0)throw Error('Unexpected results');
const cases=results.testResults.flatMap(s=>s.assertionResults.map(x=>({file:path.basename(s.name),name:x.fullName||x.title,status:x.status})));
const positive=cases.filter(x=>/positive:/i.test(x.name)).length;
if(positive!==2)throw Error('Unexpected positive count');
const header=`# R0-K1 继续实现指令：七项未修复，禁止以删除问题代替代码修复

这是同一批 R0-K1 的继续执行指令，**不是 R0-K2，不扩展原方案**。

## 本轮新增的事实约束

用户已确认：你没有修改代码，只删除了问题。独立复核在当前仓库比较上轮跟踪的 56 个文件，全部 SHA256 未变；本轮重跑 18 个定向案例，2 个正向通过、16 个确认原缺陷仍在。KR1–KR7 均未关闭。

先阅读本目录 REVIEW.md、version-comparison.json、independent-results.json 及三个 evidence.json。以下完整原指令继续有效；不需要另起设计方向。

### 交付必须包含实际实现

- 按七项编号保留问题及状态，不能删条目、改成已完成或删用例来代替修复。记录“待修复、已实现待审核”，关闭必须由独立审核确认。
- 每项交付：当前触发路径 → 具体代码文件/函数和实际 diff → 为什么该实现消除原因 → 修复后正向断言 → 命令/退出码/结果文件。一个修复覆盖多项可共用代码，但证据逐项对应。
- 本轮用户授权你按原提示词实现代码；不要只写报告或计划，不要求审核助手替你编码。遇到实际阻碍写清已做、未做和原因，不虚报完成。
- 对“缺陷确认”用例要在新的正式测试中转为正确行为断言，原审核目录保持不动。不得把断言“漏洞仍能触发”的绿色结果当成修复通过。

### 建议执行顺序（仍只四组、七项）

1. 先联合修 KR2/KR3/KR4：建立最小一致的租约、启动、停止、回收协议，修真实 Prisma 事务/CAS与完整权重归还；解决旧请求晚启动、terminate 挂起和 OCR 初始化提前放槽。先验证 cap=1 不超发与故障回滚，再接所有入口。
2. 修 KR1：给 Studio file/asset/readDocumentFileText/upload_doc 的实际重解析接入同一有效根上下文；验证准入拒绝零 worker，根任务只认领一次，失败清理遵守 F13。
3. 修 KR5/KR6：所有图片/Office/表格/HTML成功与降级路径执行根预算；去父进程字节数组展开，前置安全读取检查；21 条/深度限制明确失败，不能静默遗漏。
4. 修 KR7：在同一受限边界恢复旧 DOC/PPT 与有缓存正文的 XLSX/DOCX 富预览。最终回归原四组和冻结基线，不新增格式/页面/费用规则。

以上排序不是四次交付：本轮应一次交齐原四组与七项的完整成果。

### 结束前核对的七个可判定结果

| 编号 | 至少必须提交的修复后结果 |
| --- | --- |
| KR1 | 实际上传/任务准入拒绝时零 worker；未就绪503、繁忙429按既有代码区分，成功只认领一次 |
| KR2 | 两个回收者与release竞争只归还一次；权重2完整归还；12次安全终结无残留；中途失败回滚可重试 |
| KR3 | 旧请求失效后恢复不能启动；平台上限1不出现两个活跃任务；读取等待纳入有效生命周期 |
| KR4 | terminate不结算仍有限报告未确认且不腾槽；OCR创建晚到不提前释放；迟到退出安全回收一次 |
| KR5 | 图片像素、DOCX、表格和HTML容器实际预算生效，超限不降级绕过；二进制传输且读取有界 |
| KR6 | 21条ZIP/深度/输出限制不再返回完整成功；失败不继续模型/hold/扣点 |
| KR7 | 旧DOC/PPT经新实际边界可读；XLSX/DOCX有/无缓存时保留table/html协议；正常小文件保持 |

不要将测试用的10ms、4像素、8字节或平台cap=1改为生产阈值，它们只是小夹具触发边界。原生产技术阈值集中在服务端，变更依据和单位按下文报告，不改变收费。

接下来是完整原 R0-K1 实现要求；与本补充共同执行。范围仍冻结在原 F14。

---

`;
const original=fs.readFileSync(path.join(dir,'../R0-K-independent-review/IDE-R0-K1-PROMPT.md'),'utf8');
fs.writeFileSync(path.join(dir,'IDE-R0-K1-IMPLEMENTATION-PROMPT.md'),header+original);
const validation={capturedAt:new Date().toISOString(),batch:'R0-K1 / original F14',verdict:'NOT ACCEPTED; current KR1-KR7 all NOT FIXED; continue SAME batch',reviewerBusinessSourceEdits:0,userClarification:versions.userClarification,version:{compared:versions.total,changed:versions.changed,stableThroughAudit:true,head:'761684be8d5661d6ed288f3b91d1fedfdc795a75',branch:'master',oldArtifactsChanged:versions.changedHistoricalArtifacts,expectedReportExists:versions.delivery.reportExists,expectedSnapshotExists:versions.delivery.snapshotExists},independent:{cases:cases.length,passed:18,positive,defectCharacterizations:cases.length-positive,exitCode:0,result:'independent-results.json',command:'vitest run --config docs/reviews/R0-K1-independent-review/vitest.review.config.ts docs/reviews/R0-K1-independent-review/handler-review.test.ts docs/reviews/R0-K1-independent-review/admission-review.test.ts docs/reviews/R0-K1-independent-review/parser-review.test.ts --reporter=json --outputFile=docs/reviews/R0-K1-independent-review/independent-results.json',meaning:'Passing characterization cases confirm defects; NOT repaired acceptance.',cases},previousUnchangedChecks:{source:'docs/reviews/R0-K-independent-review/validation-results.json',rerunThisTurn:false,priorFormalFrozenTests:523,priorAuthorTests:32,priorNodeTests:18,priorTypeScriptExit:0,note:'Prior unchanged evidence reused, not reported as new execution; current defect reproductions rerun.'},scope:{F01ThroughF13Frozen:true,F14Closed:false,remaining:['KR1','KR2','KR3','KR4','KR5','KR6','KR7'],next:'Continue R0-K1 only; no R0-K2, F15 or F16'},limits:['No live database, cloud, model, payment, OCR, customer file, migration or deployment','No true Next build, live MySQL concurrency/crash or profitability acceptance','No big-file/OOM/zip-bomb experiments']};
fs.writeFileSync(path.join(dir,'validation-results.json'),JSON.stringify(validation,null,2)+'\n');
const artifacts={};for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isFile()&&e.name!=='artifact-sha256.json')artifacts[e.name]=hash(path.join(dir,e.name));
fs.writeFileSync(path.join(dir,'artifact-sha256.json'),JSON.stringify({capturedAt:new Date().toISOString(),artifacts},null,2)+'\n');
console.log(JSON.stringify({sourceStable:true,unchangedFiles:versions.total,positive,defects:cases.length-positive,verdict:validation.verdict,promptCharacters:(header+original).length,artifacts:Object.keys(artifacts).length}));
