# 给IDE：R0-K1原范围收尾，完成未执行项，禁止另立项目

本轮任务仍是原F14的K01–K04、KR1–KR7。独立审核结论：部分修复有效，仍未验收。**只完成本指令列出的原剩余项及原验收，不新增业务需求，不进入F15/F16。** 需要实际改代码与提交证据，不能只改报告。

## 一、先纠正范围理解

完整阅读项目AGENTS.md、docs/PROJECT-DEVELOPMENT-CHARTER.md，以及：

- docs/reviews/R0-J6-independent-review/IDE-R0-K-PROMPT.md，原四组；
- docs/reviews/R0-K1-implementation-review/IDE-R0-K1-REMAINING-PROMPT.md，上一轮全部要求；
- 本目录REVIEW.md、version-comparison.json、三个evidence.json、validation-results.json及对应独立测试；
- 当前实际代码。执行人旧报告只是线索，本次审核状态优先。

上一轮已要求OCR有界收口、arrayBuffer等待一致、持久化计数事实、图片/各格式预算、523条冻结回归和两个node:test。**这些不能再写“未纳入本轮”“需单独立项”或用旧用例代替。** 负责人没有批准缩减范围。

保留已经通过的实现，不再重复修：XLSX基本共享字符串/数值42及多表内容；DOCX HTML声明超限预检；Studio不立即释放未知停止名额的守卫；准入拒绝零worker；正常上传计量；CAS正常竞争、完整权重正常归还、12轮正常回收和抛错回滚；PNG预算、ZIP数量/深度、旧DOC/PPT和富预览。

## 二、目标流程、可改范围与禁止项

目标：授权用户上传/选择资料→在有限资源内得到完整的原有正常结果；资源不足/取消/失败有真实原因；后台执行停止证据成立后才归还名额；未知占用保护但有安全恢复；失败不继续模型/扣点/hold，资料上传沿用F13清理事实。

可改：现有解析策略、runner、worker、admission、text-extract；独立提取路由；handler直接解析和异常接线；preview受限读取/解析；直接相关测试、最小部署说明。必要解析专用模型变更仅交离线迁移与兼容/回滚说明，不真实apply，不改既有账务/存储表。

F01–F13业务保持冻结；仅给受新增解析准入依赖影响的原测试补正确隔离，保留全部权限/存储/清理/账务断言。禁止重构大handler、新增队列平台/Redis/解析服务/后台页面、新格式/收费/会员规则。保留图片/PDF鉴权URL、合法0字节存储与各入口既有大小上限。

不读.env/密钥/客户文件，不连真实库/云桶/供应商/模型/支付，不迁移/seed/上线/付费/删历史数据，不下载OCR语言包。只用隔离IO、小夹具与受控本地worker。不得修改价格、点数汇率、BYOK、结算或退款政策。

先说明目标、拟改文件、验收办法，再按授权实现。保存真实当前起点完整副本/时间/SHA，之后新增修改文件也先补起点；保留他人未提交改动。旧轮缺失起点如实说明，可引用既有审核副本与哈希，不得追造旧时间或把当前文件冒充旧起点。

## 三、K01/K03/K04：联合完成未知停止、启动与恢复（原KR1、KR3、KR4）

### 1. 不只跳过release，要建立完整保护状态

当前Studio file/asset/upload_doc在STOP_UNCONFIRMED时跳过release，却将租约留ACTIVE。现有sweep会把它当普通过期任务释放，独立复现已确认没有exit也能active归零。

在同一最小生命周期协议里处理：

1. 未确认停止时进入真实持久化的隔离/等价保护状态，不允许普通TTL回收当作已停止；隔离提交失败也不得虚称完成，要保守保护且可恢复。
2. 停止证据成立后才能幂等归还，迟到exit/初始化完成后被终止、重复回调、旧令牌、释放提交失败都有有限安全收口。
3. 独立提取/preview已有QUARANTINED状态，但确认exit后没有恢复路径，也要接好。不能永久卡槽，不能把隔离记录删掉或强制清零腾槽。
4. 实例失联等无法确认停止时保守处理，并提供原要求的需核验事实的有限恢复办法；无需建设新管理页面/通用调度服务。

统一所有实际重解析入口的收口，不只修upload_doc一个分支。多文件根任务只认领一次，内层共用根上下文。认证/成员/私密归属必须先验证。

存储清理和执行停止分别看事实：保留F13对象清理/预留协议；清理未完成仍返回待清理/opId并保留占用，不用解析错误覆盖更重要事实。文件已删除不能作为worker已停的证明。

### 2. OCR识别Promise不结算时仍必须有限结束

text-extract.ts当前extractFromImage在created=true时继续await workerPromise。recognize永不结算而terminate已结算，仍无限等待。报告中的“已有terminate-timeout兜底”不能证明这条OCR路径正确。

覆盖创建、识别、终止和退出确认的统一有界状态；不要再无限等业务Promise。停止确认成立时按真实原因TIMEOUT/CANCELLED；未确认时STOP_UNCONFIRMED并保护名额，不伪装无文字，不先放槽再后台清理。迟到文本不能成功。

保留已有runner对terminate挂起的有限确认窗口，补齐迟到退出通知与清理；取消监听/定时器/通信全部收口。不能假设所有库terminate都会自动使所有识别Promise结算。

### 3. 修真实arrayBuffer等待，不是重复验证formData顺序

独立路由现在是formData→acquire→arrayBuffer→new RootBudget，旧请求晚启动仍可复现。将有界读入、根deadline、持有者有效性与真实worker启动统一：租约失效/失去所有权的旧执行者不可再启动，任何关键异步等待后都不能沿用过期认领。

可在安全有限读取之后临近启动认领，或采用适合当前架构的最小维护协议；必须用本次慢arrayBuffer场景证明解决。不要只移动一个await或增大TTL。多文件/递归不重置根预算和总期限；超时表单的迟到内容不能继续执行。

### 本节验收

- 真实Studio上传/任务材料在STOP_UNCONFIRMED后，无exit时多次sweep不释放；有可核验停止事实后归还一次，重复/迟到/旧token不重归还。
- 假OCR recognize永不结算、terminate可结算：请求有限结束且名额状态诚实；初始化晚到、主动取消、终止失败有正向证据。
- 真实独立route慢arrayBuffer，旧租约失效后恢复不得启动；cap=1不能同时两个活跃任务。拒绝在worker之前，失败零模型/扣点/hold。
- 停止已确认但释放事务故障可重试，不盲放也不卡死。

## 四、K03：按持久化事实归还，零更新不得提交终态（原KR2）

当前parse-admission.ts未改；“经过releaseParseLease”不等于“按数据库事实”。

1. 在短事务中读取/核实持久化租约的userId、workUnits、claimToken与允许终态；归还不依赖调用方传入权重/用户。内部对象被改变也不能改变应归还量。
2. 检查所有必需的平台/用户/工作预算条件更新命中数；任一为0不得仍提交RELEASED/EXPIRED并返回成功。回滚或进入明确可恢复状态，不钳0掩盖不一致。
3. 保留CAS单胜者、完整权重、双回收、抛错回滚与12轮已通过行为。release/sweep/迟到退出恢复竞争都守恒。

验证必须运行实际createPrismaBackend，配有条件求值/唯一约束/事务回滚的隔离delegates；不能只用简单backend override或空实现证明。错误权重、零命中、旧token、重复/并发与故障重试都要有正向断言。

## 五、K02：补齐实际分支，不把声明/压缩大小当真实资源（原KR5）

### 1. XLSX预览仍需真正展开预算

parseTable仍consume(inflatedBytes,buffer.length)，table-preview不会经过新extractXlsxSheets。不能拿文本提取的绿测关闭预览旁路。

对容器适用预检和实际展开都执行同一根预算；本次压缩8614、展开15820、预算8630的真实table-preview必须拒绝，不能记账8614并成功。

### 2. 新逐表文本链路也必须计sheets/cells

当前extractXlsxSheets解出数值，却未consume sheets/cells；两表四单元格在1表/1单元格根预算下仍成功。补齐对应实际资源记账与上限，保持字符串/数值/重复值、行列及工作表必要上下文和顺序。超限诚实失败，不少读部分内容伪装成功。

不要重做已经恢复的数值42功能；只补它所在实际链路缺失的资源约束并回归。

### 3. DOCX HTML声明预检保留，补真实执行边界

新增header.size累加是有效预检，但不是已验证的实际展开量。容器条目、未知/零/不一致声明及实际展开也须有界；不能仅信声明再交mammoth全量展开。采用当前依赖能力支持的最小有界预处理/读取或安全拒绝方式，不新增解析平台。不得泛称第三方库没有任何限制，不以worker heap限额冒充覆盖所有父进程/Buffer/原生分配。

### 4. 图片未知尺寸与读入顺序

未知图片尺寸不能把buffer.length当imagePixels。对已支持格式安全获取并核验尺寸；无法证明安全时明确拒绝，不交OCR试运行。保留PNG等有效检查与原无文字语义。

各入口在整块读取/分配前尽早预检，读取后仍核验实际长度，不能只信Content-Length。preview避免共享准入必拒请求先读全大文件；必要时加最小受限读取接口，不重写F13文件协议。

根输入/实际展开/条目/深度/页/像素/表格/输出/期限跨文件与递归共享，不在降级时重置。保留二进制传输；保留独立20MB与任务100MB原绝对上限/合同区别，不放宽更严格入口限制。

验证用微小正常夹具+小预算：实际table-preview、DOCX文本与HTML、逐表sheets/cells、无法安全识别尺寸、嵌套/多文件与失败不降级。禁止真实解压炸弹、大文件OOM试验。

## 六、原验收是本批工作，不另立项

### 1. 修严格TypeScript：当前仍有6条

用实际接口签名修r0k1-fixes.test.ts的sweep/quarantine参数、不存在的notReady、POST参数、BlobPart类型。不得排除文件、关strict/加无意义类型强转或只跑增量缓存声称0错误。

Prisma替身必须模拟唯一性、claimToken条件、真实await的竞争屏障与事务回滚，不能create覆盖已有counter、忽略异步屏障。正式新24条是回归的一部分，不是四组全部验收。

### 2. 修523条正式基线的新依赖隔离

本轮仍514通过、9失败，来自r0j-storage、r0j2-storage-close、r0j3-recovery-close三个文件。上轮已给过仅补解析准入替身且保留原断言的69条诊断副本，按该方式补原测试依赖边界。

只调整新增解析依赖隔离，原200/403/清理/0字节/字节计量/权限/待核实/opId断言保持。不能改成接受429/503，不能删除测试，不重写F13业务，不增加生产测试绕过。

### 3. 两个node:test必须纳入

- recognize不结算的用例应有限收口，不再8000ms超时。
- 初始化晚到：依据实际停止事实选择TIMEOUT或STOP_UNCONFIRMED，保留并完整执行“不提前释放、迟到创建被终止、不再识别、停止后安全回收”验证，不能只改错误码。

这两文件必须用node:test runner，不能放Vitest冒充通过。带有限test-timeout，失败如实报告。

### 4. 精确执行与交付

在项目根：

```powershell
$reviewBaseline = Get-Content -Raw 'docs/reviews/R0-J6-independent-review/validation-results.json' | ConvertFrom-Json
& '.\node_modules\.bin\vitest.cmd' run @($reviewBaseline.formal.files)
# 新正式Vitest用隔离配置与精确文件列表运行，结果保存JSON。
& '.\node_modules\.bin\tsx.cmd' --test --test-timeout=10000 'src/lib/__tests__/text-extract.test.ts' 'src/lib/__tests__/text-extract-paths.test.ts'
& '.\node_modules\.bin\tsc.cmd' --noEmit --incremental false -p tsconfig.json
node --check 'src/lib/parse-worker.cjs'
```

本目录“缺陷确认”用例绿色表示缺陷存在，不能当修复通过。将场景在新正式测试中改为正确行为断言；保留审核目录原证据。真实本地非合作worker有限启动/终止仍需回归，不能只mock terminate。产物路径测试在独立临时位置，不覆盖用户.next文件。

真正Next构建产物、真实MySQL/崩溃、真实OCR与容量条件没验证就保留原发布门，不冒充生产通过，也不因环境门扩写新产品需求。

最终更新docs/reviews/R0-K1-fix-report.md：按本提示逐项对应原KR编号，列实际代码diff、用户可见结果、根预算/租约/停止/回收协议、存储/账务影响、真实命令退出码与结果、源码起止哈希和未覆盖项。不得再把本批必验项移出；未做要标未完成，不能同时宣称整批完成。报告“0错误/全通过”必须与当前版本实际命令一致。

原KR6与已通过格式场景只保留回归，不新增实现。完成本批所有原剩余项及验收后停止，交“R0-K1已实现，待独立审核”；不要自行关闭F14、宣布生产可用/盈利或进入F15/F16。真正需要真实写库、付费、客户材料或突破范围才可继续时停止对应动作并报告具体原因；其他无关发现仅记录。
