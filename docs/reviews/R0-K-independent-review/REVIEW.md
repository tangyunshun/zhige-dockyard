# R0-K 独立审核：未通过，退回同范围 R0-K1

审核日期：2026-11-08。结论针对当前源码和本地隔离验证，不代表生产数据库、真实交易或部署验收。

**R0-K / 原 F14 尚不能关闭。** 本次已实现可终止 worker、根预算和共享准入的基础，但实际入口、生产准入实现、终止确认和预算执行仍有缺口，并出现原有格式与预览回归。只退回本文 KR1–KR7，归属原 K01–K04；不进入 F15/F16。F01–F13 继续冻结，F13 不重新立项。

本审核未修改业务源码。新增内容仅在本审核目录。遵循项目开发总纲和原 `docs/reviews/R0-J6-independent-review/IDE-R0-K-PROMPT.md`，未把执行人的交付报告当作独立验收证据。

## 一、版本与范围

- 交付依据：`docs/reviews/R0-K-fix-report.md`、`docs/reviews/R0-K-fix-snapshot/` 的起止副本与清单。
- 独立核对：12 份起点、19 份终点。起点中原下一批基线覆盖的 11 个文件一致；`next.config.js` 不在原基线内，有交付起点副本。
- 7 个既有文件修改；新增解析策略、runner、worker、准入、离线迁移与专用测试等。当前哈希见 `manifest-verification.json`，结束复核见 `validation-results.json`。
- 上次跟踪文件中，仅 handler、schema、preview 因本批范围发生变化；另 39 个被跟踪源码保持不变。未改既有存储计量、文件清理、价格、支付或算力规则。
- 本地测试仅用仓库/生成的小夹具、受控 worker、假 OCR 和隔离 IO。未连接真实数据库、云桶、模型、支付或客户文件，未执行真实迁移、部署。

## 二、必须修复的七项

优先级 P1 表示影响资源保护或可用性的阻断缺陷；P2 表示影响材料完整性或原有功能的回归。本批七项均需修复后复核。

### KR1 / P1：Studio 实际上传绕过共享准入（K03、K04）

位置：`src/app/api/studio/handler.ts` 中 readDocumentFileText、任务 file 材料、upload_doc 的提取调用；`src/lib/text-extract.ts` 的兼容提取函数与 parseWithBoundary。

独立验证使用真实当前 handler、解析器和本地 worker，隔离认证、Prisma、文件和费用 IO，并令共享准入后端明确拒绝。实际 upload_doc 仍返回 HTTP 200，创建资料成功，`acquireCalls=0`、`workerStarts=1`。见 `handler-evidence.json`。

原因是独立提取路由与预览接入了租约，Studio 调用的通用提取边界没有租约，也没有在 handler 补接。解析隔离本身不等于共享准入。

影响：Studio 可以绕开平台/用户资源限制及后端未就绪保护。这里已证明资源保护旁路，未证明发生真实模型消费或实际金钱损失。

验收：所有真实重解析入口在启动前取得服务端身份对应的有效共享名额；拒绝时零 worker；根任务和内层递归不重复认领。保留 F13 上传失败清理与冻结计费规则。

### KR2 / P1：过期回收非原子，名额可重复归还，工作预算会泄漏（K03）

位置：`src/lib/parse-admission.ts` 约 137–200 行，release、sweep。

实际 sweep 先查过期 ACTIVE 行，再在事务外改 EXPIRED，并忽略 updateMany 命中数，随后无条件扣平台/用户 active，且完全不归还 workUnits。release 对 workUnits 使用 `Math.min(ident.workUnits, 1)`，而非完整持久化权重。

独立测试运行实际 createPrismaBackend，替换的是有条件求值、唯一约束与事务回滚的 Prisma delegates，未用自定义准入 backend 替代生产算法。四个复现见 `admission-evidence.json`：

1. 两个回收者同时读到同一过期租约，第二次状态更新命中 0 仍归还名额。保留一个健康任务后，再按平台上限 1 认领成功，实际 ACTIVE=2，计数仅 1。
2. 连续 12 次 acquire→过期回收后，实际活跃与 active 都是 0，workUnits 仍为 12，下一次收到 PARSE_BUSY。
3. 状态更新提交后计数更新失败，再次回收已跳过 EXPIRED 行，形成状态与计数长期不一致。
4. 权重 2 的租约正常释放后遗留 workUnits=1。

影响：既能超额启动，也能把空闲平台卡成繁忙；加大额度或定时清零都没有修复守恒。

验收：终态认领、平台/用户计数和完整权重归还在短事务内按 CAS 结果执行，仅一个胜者归还；失败回滚；依据持久化租约归还。release/sweep 竞争、旧令牌、重复提交与故障恢复均幂等。未知停止状态不得仅靠 TTL 腾槽，隔离占用也应有经停止证据核验的有限恢复办法。

### KR3 / P1：旧请求租约过期后仍能启动 worker（K01、K03）

位置：`src/app/api/studio/extract-text/route.ts` 约 53–83 行及租约启动协议。

路由先认领，再等 request.formData 与 arrayBuffer，根 deadline 在读取后才建立；真正启动 worker 前未确认租约仍有效。固定 TTL 加宽限期不能覆盖这段无限等待。

真实路由配实际准入算法的受控时钟测试：上限设 1；首请求停在 formData；推进 100 秒并回收其租约；第二个请求启动；恢复首请求请求体，旧租约已 EXPIRED 仍启动第二个 worker。两个请求都返回 200。见 `expired-request-starts-without-lease`。

验收：读取/等待与执行有同一有效生命周期；迟到请求不可在失效认领上启动。worker 启动必须受有效持有者与终止协议约束，不能仅延长 TTL。跨实例回收不得假定到期就已经物理停止。

### KR4 / P1：停止确认等待无上限，OCR 初始化未结束就释放名额（K01、K03）

位置：`src/lib/parse-runner.ts:142`；`src/lib/text-extract.ts` 的 OCR 创建/超时及 parseWithBoundary。

- runner 先 `await worker.terminate()`，之后才开始 exit 宽限计时。若 terminate Promise 不结算，宽限永远不会开始，不能有界返回 STOP_UNCONFIRMED。受控测试 deadline=10ms、grace=5ms，推进到 100ms 仍未结算，随后人工完成测试替身以安全收尾。
- OCR 自有超时可在 createWorker 尚未返回时把结果结算为空串。真实路由复现返回 422/PARSE_NO_TEXT 并释放租约，此时初始化仍未结束、terminate 尚未执行；测试随后返回工厂结果，才发生 terminate。

见 `parser-evidence.json` 的两个 lifecycle 场景。第二项未运行真实 OCR；它证明当前状态机在初始化晚到时提前释放，并非生产 OCR 内存测量。

验收：终止调用和退出确认整体有界；未确认停止时给明确错误并保留/隔离占用，迟到退出可安全回收一次。OCR 的创建、识别、取消、超时包含在同一停止协议中；不能先返回无文字并放槽，再后台补 terminate。

### KR5 / P1：图片与 OOXML/预览绕过根预算，部分检查在父进程分配后（K02）

位置：`src/lib/text-extract.ts:619` 附近；`src/lib/parse-worker.cjs` 的 parseBuffer、parseTable、docx-html、readZipEntry；`src/lib/parse-runner.ts:99`；独立提取与预览的读取顺序。

独立小夹具复现：

- 给图片根预算 4 像素，24 字节 PNG 测试头声明 100×100，实际边界直接开始假 OCR 并接受文字，根预算记账 0 像素。图片绕过了 worker 内的尺寸检查。
- 正常小 DOCX 在 inflatedBytes=8 的预算下被 OfficeParser 成功提取，根预算实际解压记账 0。
- 正常 2×2 XLSX 的 table-preview 在同一微小解压预算下返回两行，实际解压记账 0。docx-html 的独立 mammoth 分支也未经过统一解压预算（代码证据，未单独运行该分支的超限复现）。

另外，当前 text-extract 与 preview 在父进程 `Array.from(buffer)` 展开字节，runner 再 `Uint8Array.from` 复制。worker heap 的限制不能证明这些父进程分配被保护。独立接口先 arrayBuffer 后核验文件大小，预览先读完整文件后认领，检查位置也不足。

范围边界：本地 adm-zip 的 inflater 已对部分已知长度场景使用 maxOutputLength，不能据此报告“所有 getData 都无限解压”或已验证的第三方漏洞。本项实际证据是关键成功分支没有执行任务根预算，以及分配/检查顺序问题；没有进行 OOM、压缩炸弹或真实大文件试验。

验收：成功和降级路径使用同一根预算；在 OCR/OfficeParser/XLSX/mammoth 前完成适用的尺寸/容器预检并限制实际展开，未知/零声明等情况不得绕过；超限后不继续降级。传输保持二进制，不在父进程展开数值数组。说明内存保护覆盖与不能安全支持时的拒绝策略，不能只把统计挪到分配后。维持既有入口不同的大小限制。

### KR6 / P2：压缩包达到原有数量/深度限制仍报完整成功（K02、K04）

位置：`src/lib/parse-worker.cjs:291` 的每层 20 条 break、304 行的深度超限空结果。

21 个极小文本文件组成的 ZIP 返回成功，只含前 20 个条目标记，最后一个材料静默遗漏。见 `archive-silent-partial-success`。这不是要求增加支持条目数，而是原 K02 已要求的“限制不能伪装为完整解析”。

验收：达到数量、深度或输出限制时明确资源限制/材料未完整处理，不能作为整份有效材料继续模型消费。不要通过放宽上限消除测试，也不扩建部分解析产品。

### KR7 / P2：新实际边界破坏旧 Word/PPT，缓存正文令富预览退化（K04）

位置：`src/lib/parse-worker.cjs` 的 OLE2 判断及降级链；`src/app/api/workspace/assets/[assetId]/preview/route.ts:74` 附近的 content 快捷返回。

- 使用仓库内生成的既有 sample-real.doc、sample-real.ppt，旧 extractTextFromBuffer 能提取预期文本，新实际 parseWithBoundary 均 PARSE_FAILED。OLE2 分支先按表格解析，异常未按原格式继续有界降级。
- 真实 preview GET 的两个测试：XLSX/DOCX 已有提取正文时，返回 type=text，原本应分别返回 table/html。快捷返回条件未限定纯文本，绕开原有预览分支。

见 `parser-evidence.json` 的两个 legacy、两个 preview 场景。旧 node:test 的格式测试仍绿，因为多数调用旧裸提取函数，不能覆盖已接线的新边界。

验收：保持已支持格式在新受限边界中的正常结果；正确识别与降级，不回退到同进程无保护重解析。缓存正文可供纯文本直接用；Office/表格原有预览数据结构保持，缺源文件等真实异常再诚实提示。

## 三、已验证成果与测试解释

保留当前有效成果：真实本地 worker 正常文本解析能确认停止；执行人的真实非合作同步任务终止用例通过；认证与私密预览拒绝路径、部分根预算用例、实际准入的基本上限/事务回滚/权重 1 重复释放均通过。无需推翻整个实现。

| 本次独立执行 | 结果 | 能证明的范围 |
| --- | --- | --- |
| 原 F13 精确基线 | 18 文件、523 条通过，exit 0 | 冻结回归，不能替代新增资源协议验收 |
| R0-K 作者用例 | 32 条通过，exit 0 | 原断言通过；不能覆盖本文已复现缺口 |
| 两个现有 node:test 文件 | 18 条通过，exit 0 | 老提取/路径与假 OCR 行为 |
| 独立定向复现 | 18 条：2 个正向、16 个缺陷确认，exit 0 | 绿色表示成功复现缺陷，不能算修复通过 |
| TypeScript | exit 0 | 静态类型检查 |
| parse-worker.cjs 语法 | exit 0 | worker 语法检查 |

独立 18 条来源：`independent-results.json` 中 handler 1、admission 6；`parser-final-results.json` 中最新 parser 11。旧 independent-results 中 parser 9 条已由新版本替代，不重复计数。汇总见 `independent-summary.json`。

作者 32 条的运行副本 `formal-copy.test.ts` 只将测试创建 worker 副本的路径从 `.next/server/src/lib/parse-worker.cjs` 改到本审核目录 staged；断言、源码导入及其余内容不变，避免覆盖现有构建产物。该用例仅证明模拟产物位置可启动，**没有执行真正 Next 构建，不是生产产物验证**。

命令与版本、进程返回证据见 `validation-results.json`。真实 MySQL 并发/崩溃、真实 OCR、部署产物与容量压测尚未验证，继续列发布门；不声称真实费用损失、生产可用或盈利保障。

## 四、交付与下一关口

用户可见结果：本次发现成功提示掩盖材料遗漏、原格式失败及预览退化，已提供复现依据，尚未修复。

后端/数据闭环：本地确认了名额超发、预算泄漏和未停止即释放；真实数据库未写入。解析失败的 F13 清理政策、原账务/权限规则保持冻结。

后续只执行同目录 `IDE-R0-K1-PROMPT.md`。执行人将七项改为正向结果并回归原 K01–K04 后，交“已实现，待独立审核”；本助手复核通过后才关闭 F14、按原方案进入下一关口。环境发布门单独记录，不能冒充完成，也不扩写成新产品批次。
