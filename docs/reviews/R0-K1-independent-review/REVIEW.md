# R0-K1 当前代码复核：七项未修复，继续原批次实现

日期：2026-11-08。范围：原 F14 / K01–K04 / KR1–KR7。

**本轮不予验收，不进入 R0-K2、F15 或 F16。** 用户已明确补充：IDE 没有修改代码，只删除了问题。问题记录的删除不能代替代码修复；本报告不推断删除发生在哪个文件，也不把它描述为已证实的删测试行为。

本审核只新增审核目录中的报告、隔离复现和证据，未修复业务代码，未写真实数据库或调用付费服务。

## 1. 版本核对

- 当前仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`，分支 master，HEAD `761684be8d5661d6ed288f3b91d1fedfdc795a75`。HEAD 不能代表大量未提交修改，结论以源码字节哈希为准。
- 与上轮独立审核 SHA256 对照的 56 个文件：**变化 0，未变 56**；包括解析核心、实际入口及已跟踪保护文件。不能据此推断全仓库的每个文件都没变。
- 上轮审核归档的 19 个文件哈希一致，旧证据未被本次覆盖。
- 未找到 `docs/reviews/R0-K1-fix-report.md` 或 `docs/reviews/R0-K1-fix-snapshot/`。缺报告不是拒收的唯一理由；关键是缺陷代码未变且本次复现仍成立。
- 详细逐文件对照：`version-comparison.json`；结束版本复核：`validation-results.json`。

## 2. 本次实际复现与验收判定

本轮复制上轮三个定向测试到独立新目录，只改证据写入目录，使用当前实际源码；不改变断言，不覆盖旧报告。外部认证、Prisma、磁盘、信用/费用和 OCR 按用例隔离；普通解析使用真实本地 worker，部分生命周期使用受控替身。

| 原编号 | 严重程度 / 原分组 | 当前代码和本次证据 | 判定 |
| --- | --- | --- | --- |
| KR1 | P1 / K03、K04 | 实际 Studio upload_doc 成功返回 200，acquireCalls=0、workerStarts=1；设定准入拒绝没有被调用。handler 仍只调用不含准入的通用提取函数。 | 未修复 |
| KR2 | P1 / K03 | 两回收者重复归还同一过期行，cap=1 时实际 ACTIVE=2、计数=1；12 次过期回收后 active=0 但 workUnits=12，下一次 PARSE_BUSY；回收部分提交不可恢复；权重 2 释放遗留 1。 | 未修复 |
| KR3 | P1 / K01、K03 | 实际独立提取路由等待 formData 100 秒，旧租约已 EXPIRED，恢复后仍能启动；上限 1 同时产生两个受控 worker，两个请求均 200。 | 未修复 |
| KR4 | P1 / K01、K03 | terminate Promise 待定时，deadline=10ms、确认宽限=5ms，推进至 100ms 仍不结算；假 OCR 尚在初始化时，实际路由 422/PARSE_NO_TEXT 且租约已释放。 | 未修复 |
| KR5 | P1 / K02 | 图片像素预算 4，100×100 头部进入假 OCR 并成功，像素记账 0；微小 DOCX、XLSX 在解压预算 8 字节时成功、解压记账 0。父进程 Array.from(buffer) 仍在。 | 未修复 |
| KR6 | P2 / K02、K04 | 21 个极小文本条目的 ZIP 只返回 20 个条目标记，最后一项遗漏，仍返回成功；深度超限返回空结果的代码也未变。 | 未修复 |
| KR7 | P2 / K04 | 既有 DOC/PPT 在旧提取可读，新实际边界均 PARSE_FAILED；带缓存正文的真实 XLSX/DOCX preview GET 返回 text，原应为 table/html。 | 未修复 |

代码定位（均为当前复核版本）：

- handler.ts：readDocumentFileText 约 56–63 行，任务 file 提取 3145 行，asset 读取 3178 行，upload_doc 提取 4608 行；没有对应 acquireParseLease 接线。
- parse-admission.ts：release 的 workUnits 截断约 153 行；sweep 约 176–200 行，状态与计数更新未在同一事务中，也未检查状态 CAS 胜者。
- extract-text/route.ts：约 53 行 acquire，59 行 formData，75–78 行整块读取后才建立根预算。
- parse-runner.ts：142 行先等待 terminate，之后才开启退出确认窗口。
- text-extract.ts：约 429 行 OCR 创建，458 行附近自有超时返回；约 619–646 行图片分支绕过 worker；622 行父进程字节数组展开。
- parse-worker.cjs：291 行达到 20 条 break，304 行深度超限空结果；约 330 行 OOXML 直接 OfficeParser，OLE2 先按表格解析的分支仍在。
- preview/route.ts：约 74 行 content 快捷返回未限定纯文本，早于表格/HTML 分支。

更完整的各项触发条件、原因、修复与验收边界沿用上轮 `docs/reviews/R0-K-independent-review/REVIEW.md`；本轮没有新增第八项。

## 3. 证据与限制

本轮命令：

```powershell
node 'docs/reviews/R0-K1-independent-review/prepare-review.cjs'
& '.\node_modules\.bin\vitest.cmd' run --config 'docs/reviews/R0-K1-independent-review/vitest.review.config.ts' 'docs/reviews/R0-K1-independent-review/handler-review.test.ts' 'docs/reviews/R0-K1-independent-review/admission-review.test.ts' 'docs/reviews/R0-K1-independent-review/parser-review.test.ts' --reporter=json --outputFile='docs/reviews/R0-K1-independent-review/independent-results.json'
```

返回 exit 0，18 条通过，含 **2 个正向案例与 16 个“缺陷仍存在”的确认案例**。绿色表示这些缺陷被复现，不能算修复验收通过。三个 evidence.json 为本轮实际输出，时间与版本记录见汇总。

| 证据文件 | 本次内容 |
| --- | --- |
| handler-evidence.json | 真实 Studio handler 与本地解析 worker 的准入旁路 |
| admission-evidence.json | 实际 createPrismaBackend 配条件求值、唯一约束和事务回滚的隔离 delegates；非替换整套生产算法的 fake backend |
| parser-evidence.json | 实际 runner/边界/路由的小夹具解析、预算及格式回归；受控 stop/OCR 替身 |
| independent-results.json | 三文件 18 个案例的机器结果 |

上轮 523 条冻结回归、32 条作者用例、18 条 node:test 及 tsc 已独立通过，本轮未重新跑这些未变化的部分；它们不包含本次七项修复通过的证据。已重跑关键复现，不用重复全套测试替代实现。

未运行真实 MySQL、真实 OCR、Next 构建/部署、模型、支付或实际大文件/OOM试压。不声称真实财务损失或第三方库通用漏洞。已证明的问题可能增加资源支出、拒绝正常用户或遗漏材料，不构成亏损金额测算。

## 4. 继续执行的要求与关口

只执行本目录 `IDE-R0-K1-IMPLEMENTATION-PROMPT.md`。该文件在原详细 R0-K1 提示词前补充本次事实、执行顺序和交付证据要求，保留原 K01–K04，七项编号不变。

每项按“待修复 → 有代码实现与正向验证 → 待独立审核 → 审核关闭”记录。不得通过删除记录/用例、放宽预算、吞异常、假成功、同进程无保护降级来消除问题。若认为某项不成立，应提供当前真实调用路径与反证，不能直接从清单移除。

用户可见目标：正常格式/富预览恢复，材料不完整时诚实失败；后端目标：所有重解析统一准入、停止和根预算，计数守恒；账务/数据影响：不改收费、不写真实库，上传失败继续走已冻结 F13 清理协议。

F01–F13 冻结；F14 仍未关闭。七项实现并提供证据后停止，等待本助手独立审核；通过后才按原方案进入下一关口。
