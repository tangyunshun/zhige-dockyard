# R0-J2 修复报告：接通真实入口并完成原 F13 存储闭环

**状态：R0-J2 待独立复核**（不进入 F14、不部署、不执行迁移）

只修 R0-J1 独立审核确认的剩余缺口（J-UPLOAD / J-RELEASE / J-CLEAR / J-PARTIAL / J-KEYS 剩余边界 / J-WRITE-BOUND 剩余边界 / J-RECONCILE 剩余边界），J-PRIVATE 与已通过子项（S3 同键、单一历史位置、单次解析、-1→0 收紧）只回归不重开。不修改 BYOK/价格/套餐/点数/支付/结算开关/F11/F12。

---

## 一、开工基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-J2-fix-snapshot/manifest.json`（真实时间 `2026-11-08T02:00:08+08:00`）+ `frozen-source/`（7 文件修改前完整副本 + SHA256）+ `after-hashes.json`（结束哈希） |
| storage-quota | `de7f954a… → bd674807…` |
| file-store | `f53ff936… → f53ff936…`（本批零改动，J-KEYS 已通过部分冻结） |
| handler | `4fc881ad… → a5b69ab7…` |
| clear-data | `e4b3b2de… → 86377e12…`（**起≠止，本批实际修改**） |
| 布局页 | `fc23f4e0… → 8c1e17b3…` |
| schema | `09167a47… → 7665df42…`（storageoperation.id 补 `@default(cuid())`） |
| r0j 测试 | `0bbb3504… → ad0046d8…`（夹具补事务语义；1 用例按新契约更新） |
| r0j2 测试 | 新增 `r0j2-storage-close.test.ts`（21 用例，`ac854b55…`） |

## 二、真实入口 → 服务调用矩阵（审核 §10 要求）

| 真实入口 | 调用的服务函数 | 协议 |
|---|---|---|
| upload_doc（multipart） | `reserveStorageBytes`（opId=服务端生成 UUID + userId）→ `saveAssetFile` → `extractTextFromBufferWithTimeout`（单次）→ `prisma.document.create` → `confirmStorageOperation` | 全部在同一清理 try 内；失败 → 文件清理 + 条件释放 或 `markStorageOperationPendingCleanup` |
| upload_doc（JSON 文本） | 不预留不释放（无物理文件），fileSize 恒 null | 不采信客户端伪造值 |
| upload_knowledge_attachment | `reserveStorageBytes`（同上）→ `saveAssetFile` → `prisma.document.create` → `confirmStorageOperation` | **doc.create/确认已纳入同一清理 try**（R0-J1 缺口修正） |
| remove_asset（PRIVATE 硬删除） | `deleteDocumentsAndReleaseStorage`（事务：条件删行 + 条件扣减 + 共享引用检查）→ `deleteAssetFile` → 失败 `persistOrphanCleanupLead` | DB 先行、物理清理后行 |
| delete_removal_record | 同上 + `documentremoval.deleteMany` | 同上 |
| batch_delete_assets | 逐条 `deleteDocumentsAndReleaseStorage` → `deleteAssetFile` | 每条独立协议；`cleanupPendingIds` 如实单列 |
| batch_remove_assets（PRIVATE 分支） | 逐条 `deleteDocumentsAndReleaseStorage` → `deleteAssetFile` | 同上 |
| clear-data | 逐对象：共享引用检查 → `deleteAssetFile` → 条件删行认领 → `releaseStorageBytes` → 漂移 `persistOrphanCleanupLead` | 认领协议（见 §四） |
| reconcileWorkspaceStorage（只读） | `prisma.document.findMany` + 可注入 `listObjects`/`fileExists` + `storageoperation` 状态 | 零写零删零自动释放 |

**旧的 `releaseStorageForDeletedDocuments` 已无真实入口调用**（四入口全部改用事务函数；该函数保留为库导出供恢复工具使用）。handler 中不再存在"先释放后删记录"的两步序列。

## 三、J-UPLOAD：操作身份、原子提交与全生命周期

1. **空操作 ID 修正**：`storageOpId` 在 multipart 分支内由服务端 `crypto.randomUUID()` 生成（此前声明后从未赋值，reserve 会以空 ID 稳定 400——上传阻断级缺陷）；`reserveStorageBytes` 显式传入服务端 `userId`（storageoperation.userId 不写空串）。
2. **schema 契约**：`storageoperation.id` 补 `@default(cuid())`（离线草案，未执行迁移；无 any 绕过）。
3. **重放按事实分类（§2.1）**：同 opId 重放核验空间/操作者/字节/状态——同载荷活动状态 → `deduped`（不重复占用）；跨空间/不同载荷/已释放 → `OP_CONFLICT 409`。测试：r0j2 A 组 5 用例。
4. **原子提交（§2.2）**：预留（条件 UPDATE）与操作记录创建在同一 `$transaction`；并发同 opId：后到者 create 命中唯一约束 → P2002 → **事务整体回滚**（本事务 UPDATE 增量一并撤销，不破坏并发对方已提交数据）→ 按已有操作事实 dedup。测试：r0j2 B 组受控交错用例（fixture 记录 SQL、真实求值 `usage >= 0` 写边界）。
5. **提交故障**：fixture 提交失败注入 → 预留+记录零残留（回滚）。测试 r0j2 B2。
6. **表未就绪（§2.1）**：P2021/"does not exist" → `STORAGE_QUOTA_NOT_READY 503`，在任何额度增量与文件副作用之前稳定拒绝。测试 r0j2 B3。
7. **准入分类（§7 补强）**：`reserveStorageBytes` 对条件 UPDATE 未命中（conflict）重读最新配额行分类：缺行 → NOT_READY 503、limit=0 → LIMIT_ZERO、limit<-1 → LIMIT_INVALID、usage<0 → USAGE_INVALID、余量不足 → EXCEEDED 403——**此前两个真实入口丢弃返回值导致超限静默放行**（本批发现的阻断级缺陷，已修复并测试）。
8. **未知保存结果（§2.3）**：`saveAttempted && !saved?.filePath` → 不释放占用 → `markStorageOperationPendingCleanup`（note 带原因）→ 500 `STORAGE_OP_PENDING` + opId，两条上传链路一致。
9. **确认不吞（§2.3）**：`confirmStorageOperation` 失败（记录未找到/更新未生效）改为**抛出** `STORAGE_CONFIRM_FAILED 500`（新增 code）；upload_doc 的 doc.create catch 会先删除残留文档行再清理文件+释放，附件链路同一协议——API 不再以完整成功掩盖确认失败。
10. **0 字节文件（§2.3）**：multipart `normalizedFileSize = saved.size`（0 保留 0，不归一 null）；测试断言 op.bytes=0、占用 0、状态 CONFIRMED、documentId 回填。
11. **清理失败**：文件删除失败 → `STORAGE_CLEANUP_PENDING 500` + opId + PENDING_CLEANUP 持久化（不假报成功）。

## 四、J-CLEAR：clear-data 认领协议（本批实际修改，起止哈希不同）

逐对象协议替换"扫描后全空间 `document.deleteMany`"：

1. **共享引用检查**：同 filePath 仍有其他在库文档 → 保留文件+记录+计量（`sharedRefKept`）；
2. **物理删除先行核验**：失败 → 保留记录/文件/计量，计入 `failedObjects` 明细（响应如实返回）；
3. **条件删行认领**：`deleteMany({ where: { id, workspaceId } })` count=1 才由本次清空负责释放；count=0 = 并发删除已处理（对方协议已释放），`concurrentSkipped`，不重复扣量；
4. **条件扣减**：`releaseStorageBytes`（`used >= bytes` 原子）；漂移 → 不扣减不清零 + `persistOrphanCleanupLead` 登记孤儿恢复线索（`driftSkipped`）；
5. **扫描后新上传**：结构上不可能被删（无任何按 workspaceId 的全量 deleteMany/文件清理），文件与记录完整保留；
6. **响应**：`storage: { clearedCount, failedCount, failedObjects, sharedRefKept, concurrentSkipped, driftSkipped }`，部分失败时 message 明确说明，不假报全部完成。

非存储段（任务/组件/默认初始化/审计/权限/确认文本）未改动。

## 五、J-RELEASE：事务原子绑定（新契约：DB 先行 → 物理清理）

`deleteDocumentsAndReleaseStorage`（storage-quota.ts）：

1. **事务内**：删行前读取最新行事实（**修复 R0-J1 草稿的读序 bug**——旧版删除后才 findUnique，永远取 null，实际用的仍是过期入参 filePath/fileSize）；条件删除 count=0 → alreadyGone 不释放；
2. **共享引用**：同 filePath 仍有其他文档（`id notIn` 本次已删集合）→ 该对象字节不释放（`sharedRefsBlocked`），物理文件保留；
3. **唯一对象键去重**（大小写敏感）后条件扣减；漂移 → 抛 `STORAGE_RELEASE_DRIFT` → 整体回滚（文档+占用不变，保留差异）；
4. **物理清理后行**：事务提交成功后才 `deleteAssetFile`；失败 → `persistOrphanCleanupLead`（PENDING_CLEANUP 释放记录，对象可追踪、不重放多扣量）+ 如实响应（remove_asset 返回 `STORAGE_CLEANUP_PENDING`；batch_delete 计入 `cleanupPendingIds`）；
5. **多扣量重放根除**：并发同文档后到者 alreadyGone；提交失败回滚文档与占用；漂移回滚——r0j2 D 组 4 用例 + r0j-storage 既有用例回归。

## 六、J-PARTIAL：过滤方向与 HTTP 错误（修正审核指出的反向过滤）

两处回调（`handleBatchRemoveAssets` / `handleBatchDeleteAssets`）：

1. **过滤方向修正**：`prev.filter(a => !succeededIds.includes(a.id))`——**仅移除实际成功项**，失败/跳过/无关条目保留（此前 `filter(succeededIds.includes)` 恰好保留成功项、移除失败项，方向相反）；
2. **HTTP 错误先行**：`res.status !== 200 && !== 207` → throw + toast.error（含后端 error/message），**列表不修改**；不再用"成功移除 0 项"/"没有需要删除"替代权限或服务错误；
3. **缺集合按空处理**：`Array.isArray(succeededIds) ? … : []`——移除"缺集合时把所有请求 ID 当成功"的回退；不再无条件采信未验证集合；
4. **验证**：`docs/reviews/R0-J2-fix-snapshot/verify-r0j2-ui-callbacks.cjs`（AST 提取真实回调 → transpile → 合成 fetch/状态执行）：2 回调 × 5 态（全成功 200 / 部分成功 207 / 权限拒绝 403 / 服务错误 500 / 缺成功集合）= **10 场景全过，exit 0**；结果落 `ui-verification.json`。

## 七、J-KEYS 剩余边界 / J-WRITE-BOUND 剩余边界

- **已通过子项冻结**：file-store 本批零改动（S3 同键、本地候选顺序、路径穿越剥离保持）；历史候选歧义（多候选并存）与越界拒绝由既有夹具与实现保证，本批未引入新对象键能力。
- **写边界**：两条预留 UPDATE 均含 `storageUsed >= 0`（fixture 真实求值该条件——读后 used 变负不能继续加，测试 r0j-storage「usage 负值 → USAGE_INVALID」+ r0j2 B3）；-1→0 收紧回归通过。

## 八、J-RECONCILE 剩余边界

1. **大小写敏感**：`normalizeObjectKeyForDedup` 不 toLowerCase——A.txt 与 a.txt 为两个唯一身份（r0j2 F1：uniqueObjects=2、sum=30、无重复引用）；
2. **空文档 + 非零占用**：usageDrift 不为 null，diff 如实呈现，`inFlightBytes` 区分可解释预留（note 明确"可由在途预留解释"）与真实差异（r0j2 F2）；
3. **独立 listObjects**：提供 listObjects（无 fileExists）即被调用（r0j2 F3 断言调用次数=1），coverage 如实区分核验范围，未提供时 notes 明确"未核实"；
4. 零写、零删除、零自动释放（r0j-storage「对账零写」回归）。

## 九、验证证据

```text
npx vitest run --no-color src/app/api/__tests__/r0j2-storage-close.test.ts
→ 21 tests passed, exit 0（本批新增正向验收，§9 表格场景）

14 文件定向回归（上一批 13 个 R0 名单 + r0j2-storage-close.test.ts）：
→ 14 files, 463 tests passed, exit 0（基线 442 + 净增 21）
  名单：r0j-storage / r0j2-storage-close / r0h-cost-admission / r0i2-cold-quote /
        r0g-cron-subscription-expire / r0f-maintenance-readonly / r0e-production-mock /
        r0d-refund-approval / r0c-pool-recycle / r0b-seat-addon / r0a-business-boundary /
        r0a2-real-combo / r0a3-combo-regression / r0a4-combo-regression

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

UI 回调：node docs/reviews/R0-J2-fix-snapshot/verify-r0j2-ui-callbacks.cjs → 10 场景 PASS, exit 0
旧页面回归：R0-I verify-byok-pause-pages 3/3；R0-I1 verify-admin-copy 4/4；R0-F verify-r0f-pages 10/10（均 exit 0）
```

夹具说明（§9）：r0j2 夹具与 schema 约束一致——storageoperation.opId 唯一约束（P2002）、$executeRaw 真实条件求值（含 `usage >= 0` 写边界）、事务按**本事务写操作撤销日志**回滚（并发对方已提交写不受影响，模拟真实 MySQL 行为；修复了快照浅拷贝无法回滚原地改写、全局快照回滚误伤并发提交两个夹具保真缺陷）、提交故障注入、受控交错（raw gate 双向屏障）。

## 十、诚实更正（§10 要求，均以追加方式落盘）

1. **r0j1-storage-ops.test.ts 从未存在**：R0-J1 清单声明新增但独立复核 missingDeclaredNew 确认缺失。本批不为补名字创建无意义文件：R0-J1 的 9 个新增用例实际在 `r0j-storage.test.ts`，本批正向验收在 `r0j2-storage-close.test.ts`。更正记录已追加至 `docs/reviews/R0-J-preflight/verification-results.json` 的 `correctionRecord`（原字段未改动）。
2. **clear-data 起止哈希相同（意外还原）**：R0-J1 报告 §四 宣称已改但独立复核确认起止哈希相同。本批已实际重做并通过失败对象保留/认领唯一释放/漂移登记三组测试，起止哈希不同（e4b3b2de→86377e12）。
3. **R0-J1 报告中与实际不符的其余宣称**：四个 Studio 删除入口当时实为"释放后删记录"两步（未调用事务函数）、附件 doc.create 在清理 try 之外、上传 storageOpId 从未赋值——均在 R0-J2 prompt 中被独立复核点名，本批逐项修复。

## 十一、结构交付与上线前置条件

- `storageoperation` 仍为 **schema 离线草案**：上线前需 `prisma migrate dev`（建表 + `opId` 唯一索引 + `(workspaceId, status)` 索引）+ 客户端重新生成。迁移未执行前：`reserveStorageBytes` 因 P2021 稳定拒绝 503（零副作用），孤儿线索写入降级为错误日志——不运行时 DDL、不自动建表。
- **生产回滚数据影响**：若生产已产生 storageoperation 记录后回滚删表，将丢失在途预留（RESERVED）与待清理（PENDING_CLEANUP）的恢复线索——占用数值本身仍在 workspacequota，可由对账重建差异清单，但不能简单以"删表无影响"掩盖恢复线索丢失。
- 类型安全：无 any 绕过数据库模型约束（storageoperation 访问经 `opModel` 空值防御 delegate）。

## 十二、数据影响与未验证项

- 资金/点数/套餐额度零改动；本批未读写真实数据库、云桶、磁盘客户文件。
- 未验证：真实 MySQL 事务/行锁/P2002 行为、真实 S3 SDK、浏览器 DOM（UI 回调为 AST+合成环境执行）、clear-data 与 remove_asset 的完整交错（fixture 已模拟核心交错窗口）、storageoperation 迁移后的真实性能。
- 遗留候选（未在本批范围）：5 个 cron 的同类旧鉴权（沿用 R0-H1 记录）。

## 十三、回滚说明

用 `docs/reviews/R0-J2-fix-snapshot/frozen-source/` 七个副本覆盖对应 src 文件；prisma/schema.prisma 还原 storageoperation.id 默认值（离线草案未迁移无需回滚 DB）；删除 `r0j2-storage-close.test.ts`；前端回调还原为 `succeededIds.includes` 正向过滤即回到 R0-J2 开工状态（该状态即 R0-J1 结束状态，含其已知缺陷——回滚前请对照独立审核结论）。

**八项关闭，等独立审核；不进入 F14，不恢复收费，不宣称生产就绪。**
