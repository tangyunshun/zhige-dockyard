# 给 IDE：只完成原 R0-K1 剩余项，不扩大方案

当前审核结论：R0-K1 部分实现有效，仍未验收。原范围是 F14 / K01–K04 / KR1–KR7。**不新增第八项，不开新产品批次，不进入 F15/F16。** 本轮要实际修改代码并提供证据，不能只删问题、改完成状态或提交设计说明。

## 一、先读事实，保护已经做对的部分

完整阅读：

1. docs/PROJECT-DEVELOPMENT-CHARTER.md、适用 AGENTS.md；
2. docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md 原 F14；
3. docs/reviews/R0-J6-independent-review/IDE-R0-K-PROMPT.md 原四组范围；
4. 本目录 REVIEW.md、version-comparison.json、validation-results.json、三个 evidence.json 与定向测试；
5. 当前真实源码。旧轮“七项全未修复”的状态已过时，按本次逐项结论执行，不能反向删除已有效的实现。

已通过并须保留：实际上传准入拒绝零 worker；正常上传 F13 字节计量；回收 CAS 和异常事务回滚；完整权重正常释放；12 轮计数归还；PNG 像素检查；小预算 DOCX 文本拒绝；21 条 ZIP/深度限制明确失败；旧 DOC/PPT 预期正文；有缓存正文的 XLSX/DOCX 富预览；二进制传输替代父进程 Array.from。

先说明本轮目标、实际修改文件与验收办法，然后在以下授权范围实现。开始前保存真实当前源码与 SHA 为 R0-K1 继续修复起点；不得补造上一次修改前快照。原工作区大量未提交改动，禁止重置/清理/覆盖无关工作。

## 二、业务目标、范围与禁止项

目标流程：已授权用户上传/选资料→在有限资源内提取或预览；正常材料数据完整；失败诚实报告，不继续模型/hold/扣点；后台工作停止证据成立后才回收名额；未确认时保护占用且最终可以安全恢复。upload_doc 失败沿用冻结 F13 对象/存储预留清理，不因解析改动破坏它。

范围仅：parse-policy、parse-runner、parse-worker、parse-admission、text-extract，独立提取 route，handler 直接解析/根上下文/异常接线，preview 的受限读取/解析，直接相关测试与最小部署说明。解析模型确有必要调整时仅提供最小解析专用离线迁移和兼容/回滚解释，不修改既有存储/账务表，不真实 apply。

F01–F13 业务逻辑冻结。允许给受新增解析准入依赖影响的三个 F13 测试文件补正确隔离接线，保留全部原权限、存储、清理和账务断言；此项不授权重写 F13 业务。不要重构大 handler，不新增队列、Redis、解析服务、运营后台、收费或新格式。已鉴权图片/PDF 预览 URL 分支保持，合法 0 字节存储保持。

不读 .env/密钥，不连接真实库、云桶、客户材料、模型或支付；不迁移/seed/部署/清理历史数据，不下载 OCR 语言包。只能用隔离外部 IO、小夹具与受控本地 worker 验证。不改价格、算力点、BYOK、结算、会员或退款政策。

## 三、K01/K03/K04：一次修好启动、停止与归还协议（KR1–KR4 剩余）

这几项共享同一生命周期，联合实现，避免给每个入口各加不一致的 try/finally。采用项目内最小公共收口或严格统一的现有模式，不建设调度平台。

### 1. Studio 不得释放未停止的解析（KR1、KR4）

目前 handler 的 file/asset finally、upload_doc catch 遇到 PARSE_STOP_UNCONFIRMED 仍 release。改为依据实际停止事实收口：确认退出后幂等归还；未知时保留/隔离占用，不归还给新任务。

不能只在 upload_doc 修一个 if 而漏 file/asset/readDocumentFileText；审核所有现有重解析入口。根多文件任务只认领一次，内层共用根预算。认证、成员、私密归属先于解析。准入拒绝继续零 worker，后端未就绪503、繁忙/限流429按现有策略返回。

上传存储清理和执行名额是两个事实：文件已删除不代表 worker 已停。继续走 F13 清理；清理未确认仍保留待清理状态/opId/占用，不能为统一解析错误而覆盖更重要的存储事实。解析失败不创建成功资料壳，不触发模型/点数/hold。

### 2. OCR 所有阶段有界，迟到退出能恢复（KR4）

当前 extractFromImage 在 created=true 时 await workerPromise；recognize 不结算而 terminate 已结算，会无限挂起。不得假设 terminate 会使所有业务 Promise 结束。

创建、识别、终止和停止确认组成有界状态机；返回的 TIMEOUT/CANCELLED 必须有停止事实，否则明确 STOP_UNCONFIRMED。不能为了不挂起而直接放槽或将失败伪装为空文字。迟到文本不创建成功结果。

runner 已能有限结束 terminate 挂起，应保留。当前隔离后即使收到真实 exit，也无归还 QUARANTINED 的路径；release 仅 ACTIVE，sweep 不处理隔离状态。补最小幂等恢复：有停止证据的迟到退出/确认可归还一次，提交失败可安全重试；实例失联等无法证明停止的情况保守隔离，并提供原要求的有限、需核验事实的恢复方法。不要盲按 TTL 腾槽，也不要永久卡槽。不要建立新的管理页面或通用任务系统。

清理本轮新增的定时器/监听，避免 terminate 的超时 Promise 在正常任务结束后无谓存活；保持停止确认机制清楚，不以任何解析结果回调伪造 exit。

### 3. 读取等待和真实启动一致（KR3）

当前只把 acquire 移过 formData，arrayBuffer 仍在 acquire 后、根 deadline 前。独立复现已证明租约过期后旧请求仍启动，cap=1 同时两个 worker。

将读取/存储等待、根预算和实际 worker 启动的有效性统一考虑。对每个启动核实当前持有者/租约允许执行，过期或失去所有权不可继续。可在完成有界读取后临近启动认领，也可按最小有效协议维护认领；必须消除异步等待后的旧持有者风险，不能仅移动某一个 await 或扩大 TTL。

同一任务多文件/递归不得重新获得全额 deadline。request.formData 的 timeout race 还要清理定时器，超时后不得继续成功处理迟到结果；取消/读取失败不能落入无保护解析。

### 4. 归还以数据库事实为准，零命中也必须处理（KR2）

保留现有短事务与 CAS 胜者规则，补以下缺口：

- 在同一事务中读取/核实持久化租约的 userId、workUnits、claimToken/终态；不能用调用方对象的权重/用户作为归还事实。
- 平台 active、平台 workUnits、用户 active 的必需条件更新均核对 count；任一为 0 不能仍提交 RELEASED/EXPIRED 并返回成功。回滚或保留明确可恢复状态，不把异常计数硬钳为0。
- release、sweep、迟到停止恢复、重复/旧 token 竞争都只归还一次，且三项计数守恒。释放提交失败也可按停止事实重试，不盲目清理保护记录。

必须验证实际 createPrismaBackend，不能只用替换整套算法的简单 backend 证明正确。模拟 delegate 要执行条件/唯一约束、claimToken 与事务回滚语义。

### 本节必须提交的正向证据

1. 实际 Studio upload_doc/file/asset 的 STOP_UNCONFIRMED：名额不释放、不继续模型/hold/扣点；上传 F13 清理状态正确。
2. 假 OCR recognize 永不结算、terminate 可结算：请求仍有限收口，不再无限 await；主动取消、初始化晚到、终止失败均诚实保护。
3. 确认迟到 exit 后释放一次、重复 exit/旧令牌不重复归还；释放提交故障可恢复。
4. 实际独立路由慢 arrayBuffer，或等价有界的异步读入等待：旧租约失效后不能启动；平台 cap=1 不超发。保留正常慢 formData 处理和读取超时正确性。
5. 注入 counter.updateMany count=0 时不提交虚假终态；内部传入错误权重不能改变应归还的持久化权重；完整权重/12轮/双回收/回滚原正向用例仍通过。

## 四、K02：真实资源约束，补齐剩余格式路径（KR5）

1. **XLSX**：parseTable 当前 consume(inflatedBytes, buffer.length) 计量的是压缩输入。必须对容器的实际展开使用根预算；XLSX.read 前有适用预检，实际展开也有边界。不能把压缩字节改成另一个变量名交差。压缩夹具 8614 字节、展开 15820，预算 8630 时应拒绝，不能返回完整成功。
2. **DOCX HTML**：runTask docx-html/mammoth 必须纳入同一容器展开预算和输出预算。8字节解压预算下不得生成 HTML 成功；不只测试 DOCX 文本分支。
3. **图片**：未知尺寸不能用 buffer.length 当像素上界。已支持 TIFF 等输入要安全获得适用尺寸并核验，不能证明安全就诚实拒绝，不能交给 OCR 试运气。保留 PNG/JPEG/GIF 等已有效检查；所有进入 OCR 的路径都应检查适用资源，不能由文件名或降级链绕过。
4. **分配与实际展开**：各入口尽早在整块读入/大分配前预检；读取后仍按实际字节核验，客户端 Content-Length 不可信。preview 不应在必被准入拒绝时先读全大文件。允许必要的最小安全读取接口，不重写文件存储/清理协议。容器预检声明大小不能代替实际展开限制，也不能全部 getData 后才统计。核对本地依赖能力，不能泛称第三方库没有任何限制。
5. 保留父进程二进制传输，减少无必要复制；报告 worker heap、父进程/Buffer/原生分配的控制范围。不能把 resourceLimits 或输出字符串长度说成覆盖所有内存。

保留独立接口20MB与任务file原100MB绝对上限/合同的区别，不放宽原更严格限制。跨文件/递归共用根输入、实际解压、条目、深度、页/像素/单元格、输出和总期限。预算失败不能继续另一条无保护降级。

测试只用微小夹具与微小预算：压缩前后大小不同的 XLSX，DOCX文本与HTML两条路径，支持图片尺寸与无法安全识别尺寸的拒绝，多文件/嵌套累计；不真实 OOM、不用解压炸弹。测试微小阈值不是生产配置值。

KR6 的21条/深度失败已通过，保持现状并回归，勿重复实现或增加条目支持。

## 五、K04：恢复表格文本完整语义（KR7 剩余）

当前 extractOoxml 把 xl/sharedStrings 当整份表格正文，导致数量42遗漏却返回成功。恢复原支持 XLSX 的字符串、数值、顺序和必要行列/工作表上下文，在同一隔离与真实资源预算里完成。

实现方式可采用能安全限制的现有引擎或最小受限解析，不要求保留某个引擎；但不能用“与原解析同效”的注释冒充验证。禁止以少提取内容来规避资源预算，不能用同进程无保护裸解析兜底。

提交含共享字符串+数值42、重复字符串、多工作表与正常小文本的正向输出证据，确认实际 parseWithBoundary 和任务材料链路不会遗漏。不要新增文件格式或页面。

已恢复 DOC/PPT、缓存有/无正文的 XLSX/DOCX table/html 继续回归，不重新设计预览。原输入失败在模型、点数或hold之前结束。

## 六、补齐原验收与交付，不能只说新20条绿

### 1. 修复 TypeScript 与真实测试替身

当前 tsc 有18条诊断，均在新增 r0k1-fixes.test.ts。使用实际接口签名补齐 quarantine，修正 acquire/release 参数、resolver参数、RootBudget构造、Blob字节类型等。不能排除该测试、关闭 strict/skip检查、加一串 any/unknown cast 掩盖错误。

现有 Prisma mock 必须模拟唯一冲突，不能 create 覆盖既有 counter；lease 条件要含 claimToken，异步竞争屏障必须真正 await。不要用未等待的回调声称测试了竞争。测试失败与实际生产缺陷分别报告。

### 2. 恢复冻结正式基线的正确隔离

523条当前514通过、9失败；失败位于 r0j-storage、r0j2-storage-close、r0j3-recovery-close 三个测试文件。审核诊断副本只增加解析准入替身、保留原断言，69条全部通过。参考本目录 frozen-*-review.test.ts 的隔离方式，为原测试补正确依赖边界，业务服务不得做测试环境绕过。

只调整新增解析依赖的隔离，保留原预期状态、权限、0字节、字节记账、对象清理、待核实/opId等全部断言。不能把原403/200改成429/503以掩盖失败，不删用例，不重写F13存储逻辑。

### 3. node:test 的两项必须处理

- recognize永不结算而terminate结算的场景：修实际有限收口，不能删测试或把测试超时加到无限大。
- 初始化晚到：未确认时返回 STOP_UNCONFIRMED 是允许的诚实状态，原TIMEOUT断言按实际协议调整；但必须继续验证租约未提前释放、迟到创建被停止、recognize不再启动、确认后安全回收，不能只改错误码断言就结束。

这两个文件是node:test，不得丢进Vitest冒充通过。运行时带有限 test-timeout 防止审核进程无限等待，限时失败必须如实报告。

### 4. 精确命令与证据

在项目根运行原冻结18文件（列表来自 docs/reviews/R0-J6-independent-review/validation-results.json 的 formal.files），本批精确 Vitest 文件、两个node:test、tsc及worker语法。不无过滤跑全仓测试。示例：

```powershell
$reviewBaseline = Get-Content -Raw 'docs/reviews/R0-J6-independent-review/validation-results.json' | ConvertFrom-Json
& '.\node_modules\.bin\vitest.cmd' run @($reviewBaseline.formal.files)
# 本批 Vitest 用隔离配置与精确文件列表另跑，输出 JSON。
& '.\node_modules\.bin\tsx.cmd' --test --test-timeout=10000 'src/lib/__tests__/text-extract.test.ts' 'src/lib/__tests__/text-extract-paths.test.ts'
& '.\node_modules\.bin\tsc.cmd' --noEmit --incremental false -p tsconfig.json
node --check 'src/lib/parse-worker.cjs'
```

本目录独立复现有“缺陷仍存在”的断言：其绿色不是验收。将对应场景在新的正式测试中改为正确结果，不修改或覆盖审核证据。保留真实非合作本地worker有限启动/终止证据，不只mock terminate。

不要让产物路径测试覆盖/删除用户现有 .next worker。模拟复制路径和真正Next构建产物的模块定位/启动/退出分开；真实构建被外部条件阻断就列原发布门，不虚称生产通过，也不新增产品任务。

### 5. 一次交付，明确停止

输出 docs/reviews/R0-K1-fix-report.md 与真实起止快照/哈希。原起点确实没有保存的，明确缺失并引用可核实审核基线，不追造时间或副本。按KR1–KR7逐项记录：本次代码diff、用户可见结果、生命周期/计数/预算事实、正向用例与退出码、未覆盖环境；KR6及已通过场景明确“保留回归”，不要再次虚报新增完成。

报告四组 K01/K02/K03/K04 及本轮未关闭项，不把数量当完成目标。说明存储/账务影响和失败路径，定价/交易规则保持；真实库/模型/费用操作未执行就写未执行。

四组剩余问题与原验收有证据后停止，报告“R0-K1 剩余项已实现，待独立审核”。不自行宣布F14关闭、上线可用或保证盈利，不进入F15/F16。出现需要真实写库/付费/客户材料或突破范围才能解决的条件，停止对应动作，报告具体阻碍；其他无关发现只记录，不继续开发。
