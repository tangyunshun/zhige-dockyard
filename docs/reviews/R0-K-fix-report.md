# R0-K 修复报告：原 F14 文件解析资源安全（K01–K04）

> F13 已验收关闭并冻结；本轮只实现原 F14 的四组有限验收 K01–K04，不进入 F15 短信、F16 资金接口，
> 不新增产品功能、不改商业规则/价格/算力点/BYOK/支付/结算/模型开关，不执行真实迁移或付费操作。
> 全部验证为隔离夹具 + 本地真实 worker_threads 任务；未连真实数据库/客户文件/云桶/供应商，
> 未读 .env 或密钥，未迁移、seed、部署或清理历史数据。

## 一、结论与状态

**R0-K 已实现，待独立审核。** K01–K04 均有修复后的正向证据；未自行宣布生产可用，不进入 F15/F16，不上线。

| 原编号 | 剩余缺口（F14 预检） | 本轮结果 |
|--------|--------------------|----------|
| K01 | `Promise.race` 超时返回空串；AbortSignal 不能结束 Office 工作 | 真实隔离 worker + `terminate()`/exit 确认；超时/取消/崩溃/初始化失败都真正停止，迟到文本不接收 |
| K02 | 20MB 是独立接口限制；压缩包局部限制不是全任务预算 | 集中阈值 + 跨多文件/嵌套共享根预算；解压预检与实际字节双核验 |
| K03 | 单实例 Map；Studio/上传/预览不共享名额 | 解析专用 MySQL/Prisma 原子准入与租约，持有者校验释放、有界恢复、未就绪稳定 503 |
| K04 | 各入口存在解析旁路；错误被吞成空串 | 独立提取/Studio 文件·资料·upload_doc/预览重解析全部接线，稳定错误码可区分 |

**预检两条缺陷已改为正确结果**（不是复现旧错误的绿灯）：`F14-preflight-evidence.json` 中的 `office-timeout-not-enforced` 与 `route-timeout-releases-slot-before-parser-stops`，在本轮 `r0k-parse-resource.test.ts:250`、`:296` 用真实 route/service + 真实 worker + 共享准入复刻场景，并断言修复后的正确行为。旧审核证据文件未被覆盖。

## 二、起点核对与全部改动（上轮 → 本轮）

起点采集于 `2026-11-08T07:27:17.9906224Z`，清单 `docs/reviews/R0-K-fix-snapshot/start-manifest.json`（12 份既有文件完整副本、SHA256、真实时间；新文件标新）。

**`next-batch-baseline.json` 中 11 份跟踪文件起点哈希全部一致，无中间变化。** `next.config.js` 未列入该基线，但为本批拟改文件，已保存真实起点副本并标 `matchesNextBatchBaseline: false` 说明。

### 修改的既有文件

| 文件 | 起点 SHA256 | 期末 SHA256 | 差异 |
|------|-------------|-------------|------|
| `src/lib/text-extract.ts` | `07be5f5d…` | `211b9fa5…` | 138 增 / 18 删 |
| `src/app/api/studio/extract-text/route.ts` | `0fb1e878…` | `2b5083fa…` | 90 增 / 101 删 |
| `src/app/api/studio/handler.ts` | `e67ed722…` | `4919aa88…` | 42 增 / 19 删 |
| `src/app/api/workspace/assets/[assetId]/preview/route.ts` | `6d3bd0c5…` | `91657ec4…` | 91 增 / 46 删 |
| `prisma/schema.prisma` | `dd595598…` | `8506f234…` | 43 增（仅新增解析模型） |
| `src/lib/__tests__/text-extract.test.ts` | `47a3760a…` | `c5099f7c…` | 14 增 / 3 删 |
| `next.config.js` | `02276140…` | `8ff7a4e2…` | 8 增 |

完整 64 位哈希见 `end-manifest.json`。期末完整副本在 `docs/reviews/R0-K-fix-snapshot/end-source/`。

### 新增文件

`src/lib/parse-policy.ts`、`src/lib/parse-worker.cjs`、`src/lib/parse-runner.ts`、`src/lib/parse-admission.ts`、`prisma/migrations/20261108000000_parse_admission/migration.sql`、`src/app/api/__tests__/r0k-parse-resource.test.ts`、`docs/reviews/R0-K-fix-snapshot/vitest.r0k.config.ts`、本报告。

### 未改动并核验一致

`src/lib/__tests__/text-extract-paths.test.ts`、`src/lib/file-store.ts`、`src/lib/security.ts`、`package.json`、`tsconfig.json` 起点=期末（哈希见 `end-manifest.json`）。F13 文件键、存储计量、清理认领、私密授权与共享引用规则未改；未重构大 handler（仅 42 增 / 19 删的局部接线）。

## 三、K01：真正停止非合作解析

**实际入口与修改范围**
- `src/lib/parse-worker.cjs`（新）：纯 CommonJS + `node:worker_threads`，`require` 本地解析依赖（officeparser/adm-zip/xlsx/mammoth/iconv-lite/chardet 均已验证 CJS 可用）。含受控离线任务 `__test_ok / __test_spin / __test_late / __test_crash / __test_init_fail / __test_error`，用于无外网、无 OCR 下载的真实启动/终止证据。
- `src/lib/parse-runner.ts:83-215`（新）：`runIsolatedParse()` 用真实 `Worker` 启动（`resourceLimits` 限堆 192MB / young 32MB / stack 4MB）；硬 deadline 用真实 `setTimeout` → `terminate()`；`src/lib/parse-runner.ts:127-153` 的 `stop()` 幂等收口：置 `settled`（迟到/重复输出丢弃）、清计时器与监听、移除取消监听、`await worker.terminate()` 并以退出码确认，未确认时等 `exit` 事件（有界 5s），仍失败抛 `PARSE_STOP_UNCONFIRMED`（保守隔离占用，可诊断）。
- `src/lib/text-extract.ts:585-670`（新 `parseWithBoundary`）：不再与计时器 Promise race 后直接返回（那会让响应先于 worker 退出、提前腾名额），而是**等 runner 确认退出后**才结束本次解析。
- **OCR 保留**：`src/lib/text-extract.ts:642-650` 沿用既有 `extractFromImage` 的 `terminate` / 延迟创建后终止 / 重复取消保护；外层硬 deadline 通过同一 `AbortSignal` 触发 `terminateWorker`（真停止），不用 `Promise.race` 假装中断。非 OCR 重解析全部在 worker 中执行，同步 CPU 死循环（`__test_spin`）只能由真实 `terminate()` 结束。
- **worker 产物定位**：`src/lib/parse-runner.ts:36-64` 按 `PARSE_WORKER_PATH`（服务端）→ `src/lib/parse-worker.cjs` → `.next/server/...` → `.next/standalone/...` → `__dirname` 逐候选查找；找不到诚实返回 `PARSE_WORKER_NOT_READY` 503，不静默回退同进程解析。`next.config.js` 增 `outputFileTracingIncludes: { "/*": ["./src/lib/parse-worker.cjs"] }`，保证构建产物纳入 trace。

**用户可见结果 / 状态前后**

| 场景 | 修复后 |
|------|--------|
| Office 超期限 | `PARSE_TIMEOUT`（504），worker 已确认退出；迟到文本不被接收，不产生成功结果 |
| 3 个超时解析仍活着 | 名额不释放，第 4 个 `PARSE_BUSY`（429）且零 worker 启动；三个都确认退出后才归还 |
| 主动取消 / 初始化失败 / 执行异常 / worker 崩溃 | 各自稳定错误，worker 全部真实结束并确认退出 |
| 正常完成 | 返回文本，`exit` 确认后才释放名额；计时器、取消监听、worker 通信全收口 |
| 重复清理 | `stop()` 幂等，无重复归还、无未处理 rejection |
| OCR 正常/超时/延迟创建/取消 | 既有 terminate 行为保持（node:test 18/18 通过） |

**正向证据**：`r0k-parse-resource.test.ts:199-349`（K01 7 条）。含 `node --check` 语法通过、真实 Worker 从源码路径与离线 staged `.next/server` 产物路径启动/输出/退出确认（`terminate()` 返回退出码）、非合作 CPU 死循环被终止、预检两条正向。

## 四、K02：全请求与嵌套共享有限资源预算

**集中策略**：`src/lib/parse-policy.ts:94-153` 定义全部技术阈值（**服务端裁决，不允许浏览器覆盖；不是收费规则**）。`src/lib/parse-policy.ts:155-230` 的 `RootBudget` 及其 `fork()` 共享同一份状态，多文件请求与嵌套解压不重获完整额度；超阈值抛 `PARSE_BUDGET_EXCEEDED`（413），不静默截断后声称整份材料已完整解析。

| 阈值 | 数值 / 单位 | 依据与适用入口 |
|------|-------------|----------------|
| `EXTRACT_TEXT_MAX_INPUT_BYTES` | 20 MiB | 独立 extract-text 接口既有单文件上限（保留，不误写为全系统上限） |
| `TASK_FILE_HARD_CAP_BYTES` | 100 MiB | Studio 任务 file 模式既有绝对上限/合同约束（保留在 handler） |
| `ROOT_MAX_INPUT_BYTES` | 20 MiB / 每请求合计 | 新增根预算；分配前按声明长度预检、分配后按真实字节再核验，不信 Content-Length/扩展名 |
| `ROOT_MAX_INFLATED_BYTES` | 24 MiB / 每请求合计实际解压 | 解压前用 central directory 声明大小预检，`getData()` 后按真实长度补计差额 |
| `ROOT_MAX_ENTRIES` / `ENTRIES_PER_LEVEL` | 200 条 / 每层 20 条 | 既有局部 20 条限制保留，另加全任务总量 |
| `ROOT_MAX_DEPTH` | 2 层 | 既有深度限制 |
| `ROOT_MAX_OUTPUT_CHARS` / `ROOT_MAX_WORK_UNITS` | 2,000,000 字符 / 200 单位 | 累计输出与工作量，跨文件不重置 |
| `MAX_PDF_PAGES` / `MAX_PDF_TEXT_CHARS` | 200 页 / 1,000,000 字符 | PDF 文本规模 |
| `MAX_IMAGE_PIXELS` | 20,000,000 像素 | PNG/JPEG 头部尺寸预检；不做 OCR 下载 |
| `MAX_SHEETS` / `MAX_CELLS` / `MAX_PREVIEW_ROWS` | 20 表 / 200,000 单元格 / 500 行 | 既有预览 500 行保留，达上限明确失败 |
| `MAX_HTML_CHARS` / `MAX_XML_PART_BYTES` / `MAX_ENTRY_BYTES` | 1,000,000 字符 / 4 MiB / 4 MiB | Word→HTML、OOXML 手工 XML、单条目 |
| `HARD_DEADLINE_MS` / `EXIT_CONFIRM_MS` / `LEASE_TTL_MS` / `LEASE_SWEEP_GRACE_MS` | 60,000 / 5,000 / 75,000 / 15,000 ms | 既有 60s 基线；退出确认宽限；租约期限与回收宽限（宽限 > 硬 deadline，避免旧 worker 仍跑就腾槽） |

**内存边界说明**：worker `resourceLimits` 限堆（192MB/32MB/4MB）+ 输入与解压字节上限 + 输出/条目/页/像素/单元格上限共同约束；这不是「只限制字符串长度」。worker 若 OOM，`onError` 映射 `PARSE_BUDGET_EXCEEDED`。无法安全支持的输入明确拒绝，不做真实压缩炸弹/高内存试压。

**OOXML/ODF 不绕过预算**：`parse-worker.cjs` 的 `zipNames/readZipEntry/extractOoxml` 与 `parseArchive` 共用同一 `budget`；手工 XML 降级也计入解压字节、条目、输出。`magic()` 按魔数识别，伪装扩展名仍走压缩包预算。

**保留项**：真实 0 字节存储上传按 F13 仍可保存元数据/对象（解析层返回 `noText` 而非非法输入）；模型任务原有无有效文本拒绝、不调用模型/不扣点规则保持；已支持格式的正常小文件与中文编码（GB18030/GBK/Big5/UTF-16）保留；纯图无文字/空文本沿用诚实反馈。既有 **3 并发 / 20 次每分钟 / 60 秒** 作为已知基线保留，改为共享准入裁决（见 K03）。

**正向证据**：`r0k-parse-resource.test.ts:350-406`（K02 6 条）：多文件共享根预算不可重置、嵌套小预算真实 worker 解压超限、伪装扩展名、`outputChars` 超限后降级链不继续（只启动一次 worker）、声明/实际字节双核验与中文编码、0 字节合法。

## 五、K03：跨实例共享原子准入与资源回收

**准入持久化**
- `prisma/schema.prisma` 新增两张解析专用模型：`parseadmissioncounter`（平台/用户计数与频次窗口）、`parselease`（`leaseId` 唯一、`claimToken` 唯一、`instanceId`、`status`、`workUnits`、`leaseUntil`、`note`）。**不修改任何既有存储/账务/退款/模型注册表。**
- `prisma/migrations/20261108000000_parse_admission/migration.sql`：离线 DDL，仅 CREATE 两张表；**未执行 `prisma migrate apply`**，未生成客户端，业务请求中不建表/迁移。
- `src/lib/parse-admission.ts:70-140`：`acquireParseLease` 在**毫秒级短事务**内用两条单条条件 `UPDATE`（`active < limit` / `requests < limit` / `workUnits + n <= limit`）原子认领平台与用户额度，再 `create` 唯一租约。事务不持有整个慢解析期间，未挪用 `registrylock` 或退款/计费锁，未新增 Redis 依赖。
- **持有者校验**：`releaseParseLease`（`:144-165`）按 `leaseId + claimToken + status='ACTIVE'` 条件更新，`count===1` 才归还计数；重复释放、迟到释放、旧执行者释放新租约均返回 false，不重复归还、不影响新租约。
- **退出确认后释放**：`extract-text/route.ts` 的 `finally` 只在 `parseWithBoundary` 返回/抛错（即 runner 已确认 worker 退出）之后调用 release；`PARSE_STOP_UNCONFIRMED` 时改为 `quarantineParseLease` 标 `QUARANTINED`，保守保留占用并可诊断，不盲目腾槽。
- **有界恢复**：`sweepParseLeases`（`:169-190`）只处理 `leaseUntil + 15s 宽限` 之后仍 ACTIVE 的租约（租约过期不等于物理工作已停止），批量上限 64；清理已终结旧记录，状态记录不无限累积。进程崩溃/重启/释放提交失败不会永久卡槽。
- **未就绪**：缺 delegate / P2021 / P2022 / 后端异常 → `PARSE_ADMISSION_NOT_READY`（503），在 worker 启动之前拒绝，不静默回退本机 Map 无限放行。纯文本已有 `content` 的路径不启动 worker、不制造租约。

**用户可见 & 并发顺序证据**：`r0k-parse-resource.test.ts:408-483`（K03 6 条）：两个独立服务实例（两个隔离后端对象 + 不同 instanceId）共享同一有条件求值存储时平台边界不可突破；同用户并发/频次边界且拒绝在 worker 启动前；重复/迟到/旧执行者释放；退出确认失败隔离；租约过期有界恢复；缺表稳定 503 零 worker。`r0k-parse-resource.test.ts:296` 的预检②同时证明「3 个后台仍活着的解析不释放名额，第 4 个被拒，三个退出确认后才全部 RELEASED」。

**限制**：两实例验证使用「共享有条件求值的隔离内存后端」，**不声称真实 MySQL 并发/锁/崩溃恢复已验收**；生产原子性依赖真实迁移后的单条条件 UPDATE 与短事务，需另行授权验证。

## 六、K04：实际入口接线与错误结果

| 既有入口 | 本批接线 | 验证 |
|----------|----------|------|
| `POST /api/studio/extract-text` | 认证 → 共享准入 → 声明/真实字节核验 → 根预算 → 隔离 worker → 退出确认后释放；移除 `Promise.race` 空串与本机 Map | 真实 route：正常 200 结构、未授权 401 零 worker、超时/取消/超限/繁忙/未就绪/无文字可区分、失败不泄露原文堆栈、名额退出确认后 RELEASED |
| Studio `file` 多主材料 | `handler.ts:3134` 起创建同一 `rootBudget`，逐文件 `checkRealInput` 后复用；传 `request.signal` | 源码接线断言 + `parseWithBoundary` 失败不进入模型/扣点证据 + F13 基线 523 条 |
| Studio `asset` / `readDocumentFileText` | 传根预算与 `request.signal`；不再吞掉解析异常；纯文本已有 content 直接用 | 同上 |
| `upload_doc` 解析 | 统一边界抛稳定异常后，由既有 F13 catch 按已绑定对象键核实/删除文件并原子释放预留；未清理状态分支（`STORAGE_OP_PENDING` / `STORAGE_CLEANUP_PENDING` / `STORAGE_RELEASE_DRIFT`）优先级不变 | 源码接线断言 + F13 基线 523 条（清理协议未改一行） |
| 预览 XLSX / mammoth / 文本兜底 | 权限（认证、成员、私密归属）先验证 → 共享准入 → 根预算 → 隔离 worker；图片/PDF 已鉴权 URL 分支保持不动 | 真实 route：XLSX 正常表格结构、docx→HTML、失败提示下载原文件、403/401 零 worker、图片 URL 分支零 worker、已有 content 零 worker |

**稳定错误码**（`src/lib/parse-policy.ts:12-78`，集中映射 HTTP 与中文信息，不泄露原文/密钥/堆栈）：
`PARSE_TIMEOUT` 504、`PARSE_CANCELLED` 499、`PARSE_BUDGET_EXCEEDED` 413、`PARSE_BUSY` 429、`PARSE_RATE_LIMITED` 429、`PARSE_ADMISSION_NOT_READY` 503、`PARSE_WORKER_NOT_READY` 503、`PARSE_STOP_UNCONFIRMED` 503、`PARSE_NO_TEXT` 422、`PARSE_FAILED` 500、`PARSE_UNREADABLE_INPUT` 400。解析失败不调用模型、不扣点/hold；F13 未清理事实优先于原始解析错误码。

**node:test 语义变化（如实说明）**：`src/lib/__tests__/text-extract.test.ts` 中「统一可取消超时入口」原断言「超时返回空串」改为「超时抛稳定 `PARSE_TIMEOUT`」，**保留**延迟创建 worker 的 terminate 目标与正常文本目标；未删除任何用例。`text-extract-paths.test.ts` 未改动。既有 18 条 node:test 全部通过。

## 七、验证命令与结果

按提示 §六.8 使用 `validation-results.json` 的 `formal.files` 精确基线，未运行无过滤全仓 `npm test`/`vitest`：

```
# F13 精确基线（18 文件）
.\node_modules\.bin\vitest.cmd run --no-color <validation-results.json formal.files 逐项>
→ Test Files 18 passed (18), Tests 523 passed (523), 退出码 0

# 本批新增隔离文件（专用配置，只含 r0k-parse-resource.test.ts）
.\node_modules\.bin\vitest.cmd run --no-color --config docs/reviews/R0-K-fix-snapshot/vitest.r0k.config.ts
→ Test Files 1 passed (1), Tests 32 passed (32), 退出码 0

# node:test（匹配 runner，非 Vitest）
.\node_modules\.bin\tsx.cmd --test src/lib/__tests__/text-extract.test.ts src/lib/__tests__/text-extract-paths.test.ts
→ tests 18 / pass 18 / fail 0，退出码 0

# 类型检查与 worker 语法
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json → 退出码 0
node --check src/lib/parse-worker.cjs → 退出码 0
```
另：改动文件 IDE lint 0 diagnostics。

**IO 隔离**：Prisma/auth/security/file-store/credit/audit 等全部 `vi.mock`；worker 为本地 `node:worker_threads`，无外网、无 OCR 语言包下载、无真实客户文件、无压缩炸弹或高内存试压。OCR 仅用既有测试替身（node:test 与 r0k 各一条）。

## 八、离线迁移、部署与回滚

**离线迁移（未执行）**：`prisma/migrations/20261108000000_parse_admission/migration.sql` 仅 `CREATE TABLE parseadmissioncounter / parselease`，附 `DROP TABLE` 回滚语句。上线前需负责人授权执行 `prisma migrate deploy` 并重新生成客户端；**真实 apply 未授权、本轮未执行**。缺表期间所有重解析入口诚实返回 `PARSE_ADMISSION_NOT_READY` 503，不在业务请求中建表或生成客户端。

**发布门（如实记录，不虚称生产通过）**：
1. 需执行上述离线迁移并验证真实 MySQL 下条件 UPDATE 的原子性、实例崩溃/租约恢复。
2. 需执行 `next build` 并确认 `outputFileTracingIncludes` 把 `src/lib/parse-worker.cjs` 纳入产物；本环境未执行构建，仅离线复制该 `.cjs` 到 `.next/server/src/lib/` 候选路径并真实启动/退出确认（非真实构建产物）。部署还需连同 `node_modules` 中的解析依赖一起发布。
3. `PLATFORM_MAX_CONCURRENT=6`、`PLATFORM_MAX_WORK_UNITS=12`、worker 堆 192MB 等为**保守技术阈值/部署前置条件**，没有生产压测数据，不编造容量或盈利结论；需运维按实例数与内存实测后调整。
4. 需验证多实例下频次窗口与租约清扫的实际行为、worker 冷启动耗时（离线实测 `__test_ok` ~234ms、`parse` ~303ms、XLSX 预览含 `xlsx` 加载可达数秒）与 60s 硬 deadline 的关系。
5. 上线后需可观测性（各稳定错误码计数、QUARANTINED 告警、worker 退出确认失败告警）与人工处置流程。

**回滚**：撤销本批 7 份既有源码到起点副本（哈希见 `start-manifest.json`）、删除 7 个新增文件；若迁移曾执行则按 SQL 注释 `DROP TABLE parselease; DROP TABLE parseadmissioncounter;`。回滚不影响既有存储/账务表，F13 逻辑未改。

## 九、限制与未完成项（如实声明）

- 未做 `next build`、真实 MySQL 并发/锁/崩溃恢复验证、浏览器端到端验收；不声称生产可用。
- 两实例共享准入是隔离内存后端的有条件求值，**不等同真实 MySQL 并发验收**。
- 隔离任务的受控测试种类（`__test_*`）只用于离线启动/终止/迟到文本证据，生产路径不使用。
- `handler.ts` 的完整 execute 链路未做真实端到端模型/扣点调用（依赖合同、模型、账务夹具）；以源码接线断言、`parseWithBoundary` 失败不进入模型/扣点的直接证据、以及 F13 精确基线 523 条覆盖。upload_doc 的 F13 清理协议保持原样并通过基线回归。
- 未新增管理页面、格式能力、扫描 PDF 转换或视觉模型；预览页面未重设计。

## 十、停止条件

K01–K04 四组完成并有正向证据，本轮到此停止。结论为 **「R0-K 已实现，待独立审核」**；不自行宣布 F14 生产可用，不进入 F15/F16，不上线。需要真实迁移、构建产物、生产库或付费/客户文件才能继续的动作，已按发布门列明具体阻碍，未自动扩展项目。
