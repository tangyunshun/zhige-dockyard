# R0-K1 代码实现独立审核：部分修复有效，仍未通过

日期：2026-11-08。批次：原 F14，原 K01–K04，原 KR1–KR7。审核角色未修改业务源码，只在本目录保存版本、复现、报告与 IDE 指令。

**本次有真实代码改动，不能再沿用上轮“七项均未修复”的结论；但尚不能验收关闭 F14。** 已通过的具体场景予以保留，剩余缺口退回同批 R0-K1，不开新产品批次，不进入 F15/F16。

## 1. 版本和交付事实

读取项目开发总纲、原 F14 和上一轮完整提示词，按当前源码核对。与原独立审核的跟踪 SHA 对比：8 个既有运行文件变化，新增 r0k1-fixes.test.ts；48 个其余被跟踪文件保持一致。已在本目录 source 保存这 9 个文件的当前完整副本，逐文件哈希及最终稳定性见 version-comparison.json、validation-results.json。

修改范围：text-extract、parse-policy、parse-runner、parse-worker、parse-admission、独立 extract-text 路由、Studio handler、asset preview。未见既有存储计量/支付/算力定价源码被本批改变。未找到约定的 R0-K1-fix-report.md 和 R0-K1-fix-snapshot/，本次当前副本不能补造执行人修改前的起点。

测试仅用小型生成/仓库夹具、本地 worker、隔离 Prisma/文件/认证/费用 IO、假 OCR。不连接真实数据库、模型、云桶、客户文件，不真实迁移、付费或部署。

## 2. 原七项的当前状态

| 原项 | 本次确认有效的修复 | 剩余缺口与状态 |
| --- | --- | --- |
| KR1：Studio 准入 | upload_doc 拒绝时 503、acquire=1、零 worker/零文件；正常实际上传一次准入、一次释放、字节计量正确。file/asset 源码也接入了准入。 | 部分通过。Studio 在停止未确认时仍释放；与 KR4 一起修，不能因“有 acquire 调用”就关闭。 |
| KR2：计数守恒 | 实际 Prisma 算法的双回收 CAS、权重 2、12 轮预算归还、抛错回滚/重试均独立通过。 | 部分通过。计数更新命中 0 仍提交终态；release 权重/用户仍信调用参数，没有读取持久化事实。 |
| KR3：旧请求晚启动 | acquire 已移到 formData 之后，并加表单等待超时。 | 部分通过。arrayBuffer 等待仍在认领后、根期限创建前；同一晚启动缺陷只是换了等待位置。 |
| KR4：停止生命周期 | runner 对 terminate 不结算已有有限确认窗口；原延迟创建场景不再一律伪装无文字。 | 未闭环。Studio 提前放槽；OCR 等识别 Promise 可能挂起；真实迟到 exit 后隔离占用无恢复。 |
| KR5：资源预算 | 父进程 Array.from 字节数组展开已移除；PNG 像素限额、小预算 DOCX 文本路径可明确拒绝。 | 部分通过。XLSX 把压缩输入字节当解压量、docx-html 未计解压预算、未知图片尺寸用文件字节冒充像素；读取前保护仍不充分。 |
| KR6：不静默截断 | 21 条 ZIP 明确预算失败；深度超限也改为失败，新正式测试通过。 | 本项已通过本轮有限验证，保留，不重复立项。 |
| KR7：原功能 | 旧 DOC/PPT 在新真实边界恢复原预期文本，独立验证与旧提取相同；已有缓存正文的 XLSX/DOCX 分别恢复 table/html。 | 这些已通过场景保留。替换 OOXML 提取链产生表格数值遗漏，属本项正常格式语义回归，仍需修。 |

## 3. 仍须处理的代码问题

### A / P1：停止未确认时提前归还，确认停止后又无法恢复（原 KR1、KR4；K01/K03/K04）

位置：handler.ts 的 file finally、asset finally、upload_doc catch（当前约 3186、3208、4651 行）；text-extract.ts 的 extractFromImage；parse-admission.ts quarantine/release/sweep；parse-runner.ts 迟到 exit 收口。

1. **真实 Studio upload_doc 提前放槽。** 受控 worker 返回消息后终止 Promise 不结算，当前 runner 正确报告 PARSE_STOP_UNCONFIRMED。实际 handler 返回 503，但 release=1、quarantine=0，且从未观察到退出；存储按 F13 清理完毕不等于解析线程已结束。file/asset 的 finally 同样无条件释放。见 handler-evidence.json。
2. **OCR 已调用 terminate 仍可能永远等识别结果。** 当前 extractFromImage 在超时 race 后，只要 created=true，就 await workerPromise。若 terminate 结算、recognize 永不结算，外层已超时也不能结束。独立假时钟测试根期限 30ms、OCR 期限 10ms，推进到 100ms 已 terminate 仍未结算；最后人工结算替身以安全结束。旧 node:test 的同场景也确实在 8000ms 测试保护期限超时。当前本地 tesseract.js createWorker 的 terminate 实现也未显式结算待处理 job promises；不能假设 kill 后所有识别 Promise 必然结算。未运行真实 OCR。
3. **迟到退出确认没有恢复接线。** 独立 extract-text 正确隔离后，测试向受控 worker 替身补发 exit 事件，随后 sweep 仍不处理 QUARANTINED；release 只允许 ACTIVE，也不能释放它。隔离计数留 1、下一次 PARSE_BUSY。这里核验的是当前状态机与准入恢复接线，不是真实线程退出/崩溃测量。不能以永久卡槽替代安全收口，也不能改成盲目 TTL 腾槽。

要求：统一实际入口的成功/失败/取消/未确认收口；只有执行停止证据成立才释放；未知状态保留/隔离；迟到停止和提交失败有幂等恢复。OCR 创建、识别、终止均有限收口，不等待永不结算的业务 Promise。继续使用最小现有解析模块，不新增队列/后台平台。

### B / P1：旧租约晚启动仍可复现；计数回收仍有非守恒分支（原 KR2、KR3；K01/K03）

位置：extract-text/route.ts acquire→file.arrayBuffer→new RootBudget 的顺序；parse-admission.ts release/sweep 的 counter.updateMany。

- 本次将等待点放在 **实际路由的 Blob.arrayBuffer**：第一请求已经认领，等待读取；推进 100 秒并 sweep；第二请求启动；恢复第一请求字节后旧租约已 EXPIRED，却仍启动 worker。平台 cap=1、同时 worker=2、计数仅 1，两个请求均 200。没有使用真实高负载。
- release/sweep 虽加事务，但平台/用户计数 updateMany 的 count 仍未校验。在隔离后端注入计数偏差使平台更新命中 0，release 仍返回 true、租约为 RELEASED、工作预算遗留，重试已无 ACTIVE 行。
- 注释写“持久化租约为准”，实际仍用 ident.workUnits/ident.userId。内部传入权重 0 释放持久化权重 2 的行，剩余 workUnits=2。此为内部 API 一致性验证，不是已证明的客户端攻击入口。

要求：读入、根期限与真实启动一致；失效/失去所有权的执行者不可启动。不要只将 acquire 挪过一个 await，或延长 TTL。归还以持久化租约为准，所有必需条件更新命中数都检验；失败须回滚/可恢复，保持平台/用户/工作预算同时守恒。保留已通过的 CAS 与短事务实现。

### C / P1：部分预算只是数值替代，未限制真实资源（原 KR5；K02）

位置：parse-worker.cjs parseTable、runTask docx-html、readZipEntry；text-extract.ts readImageDimensions/图片预算；两个路由读取顺序。

- XLSX：压缩夹具 8614 字节，包内声明展开总量 15820 字节（受控正常夹具）；预算 8630 字节仍返回两行，记账 8614。当前 parseTable consume 的是 buffer.length，不能作为解压量。
- docx-html：解压预算仅 8 字节，mammoth 仍返回 HTML，实际解压记账 0。小预算 DOCX 文本拒绝不能证明 HTML 分支受控。
- TIFF：100×100 维度的微小头部夹具，100 像素预算下仍进入假 OCR，记账为 38 个“像素”，实际来自文件长度。该夹具仅验证尺寸检查/记账接线，不是完整光栅解码或 OOM 证明。无法识别尺寸时，文件字节不能当作像素的安全上界。
- 独立接口仍先 arrayBuffer 后按实际长度核验，preview 仍先读全文件后共享准入；根容器的部分 getData 检查仍在分配后。本地 adm-zip 对部分已知长度解压有 maxOutputLength，未据此宣称第三方库所有解压无限或存在通用漏洞。

要求：各实际分支限制与计量真实资源；适用的尺寸/容器预检及实际展开都有边界，未知情况拒绝或安全处理；不能把 compressedBytes、fileBytes 等换个预算名交差。保留二进制传输和已通过的小文件结果；不做真实大文件试压。

### D / P2：OOXML 简化提取使数值材料遗漏（原 KR7；K04）

位置：parse-worker.cjs kind=zip/isDoc→extractOoxml；extractOoxml 只读 xl/sharedStrings.xml 的路径。

生成含共享字符串的正常小 XLSX：产品 Widget、数量 42。旧提取包含 42，新实际 parseWithBoundary 返回成功，包含字符串却没有 42。代码用“手工 XML 与 OfficeParser 同效”的注释替代了等效验证，直接将 sharedStrings 当整份正文，未读取相应 worksheet 数值与单元格顺序。

要求：在同一有界解析边界恢复已支持表格的字符串/数值/顺序与必要上下文。不要为关闭预算旁路而删掉原有效解析能力，也不要求保留某个指定第三方引擎。已恢复的 DOC/PPT 和富预览保持，不新增格式或页面。

## 4. 验证与交付缺口：属于原验收，不增新业务需求

| 本次实际执行 | 结果 | 解释 |
| --- | --- | --- |
| IDE 新增 r0k1-fixes | 20/20，exit 0 | 部分断言与替身不足，不能代表四组通过 |
| 原 R0-K 用例审核副本 | 32/32，exit 0 | 仅重定向 worker staging 到本目录，断言不变；不是真 Next 产物验证 |
| 原冻结精确基线 | 523 条：514 通过、9 失败，exit 1 | 三个 F13 测试文件受新增解析准入依赖影响，不能报告“523 全绿” |
| 上述三文件诊断副本 | 69/69，exit 0 | 仅增加新解析准入依赖替身，原断言不变；说明存储核心未需重写，正式接线仍须补齐 |
| 两个 node:test（加 8000ms 防挂保护） | 18 条：16 通过、1 失败、1 超时取消，exit 1 | 一条 OCR 无限等待；另一条预期 TIMEOUT 而实际 STOP_UNCONFIRMED，需按正确停止事实更新断言并保留迟到清理验证 |
| tsc --noEmit --incremental false | exit 1，18 条诊断 | 新测试缺 quarantine、接口调用签名错误、Promise resolver 参数、Budget 构造和 Blob 类型等 |
| worker 语法 | exit 0 | 仅语法通过 |
| 独立定向验证 | 最新合并 23 条：13 正向、10 缺陷确认，exit 0 | 绿色缺陷确认表示漏洞复现成功，不是修复通过 |

独立 23 条：independent-results.json 的 handler 3，加 admission-final-results.json 的 admission 8、parser-final-results.json 的 parser 12。旧版本结果被替代，不重复计数；最后一轮 admission 仅改观察字段名称，明确 exit 来自受控替身。复制测试和 mock 均不修改生产行为。

首次未加 Node 测试超时保护的运行因 OCR 不结算主动终止；随后按同样两文件加 test-timeout=8000 得到上表结果。没有遗留真实 OCR 或无限 CPU 任务。

新作者测试的 Prisma mock 在 create 时覆盖同 ID 行、不模拟唯一冲突；lease 更新不匹配 claimToken；所谓并发屏障未 await。这些替身不能证明真实准入算法。其简单 backend 还缺 quarantine，正是 tsc 报错之一。修测试时须真实建模协议，不能 cast/排除文件/删断言掩盖问题。

缺少约定修复报告/起止快照也应补交。已发生的修改只能如实描述可核实基线，不能把当前源码复制后冒充修改前快照。

## 5. 结论与下一关口

用户可见成果已改善：旧格式和富预览恢复，压缩包条数达到上限诚实失败；仍存在数值材料遗漏。后台已有部分可靠 CAS/预算检查，但未闭合启动、停止、回收及各格式资源保护。

F01–F13 业务规则继续冻结；只允许为新增依赖适配受影响的测试隔离，保留原权限/存储/账务断言，不重新开发 F13。本次没有真实费用发生证据，不声称已造成财务损失或已保证盈利。

后续执行同目录 IDE-R0-K1-REMAINING-PROMPT.md，仅完成原编号剩余项和原验收。完成后回本批复核；通过前不进入 F15/F16。真实 MySQL 并发/崩溃、真实 OCR、Next 部署产物、容量与运维等仍是原发布门，没有在本地模拟中宣称通过。
