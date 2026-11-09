# R0-J5 修复报告：原 F13 剩余验收缺口（沿用 J3-01/02/03/04/05/07 原编号）

> 本轮只闭合 R0-J4 独立审核列出的 6 个原编号剩余分支。**J3-06 已通过并冻结**，J-KEYS 与 F01–F12 冻结，不进入 F14。未新增功能、页面、配置项、架构层或通用恢复队列；未改价格、套餐、额度、算力点、BYOK、支付、结算、模型与解析/OCR 策略。
> 验证全程为隔离夹具（内存 Prisma + 内存 fs + 真实 handler/service/route），未连接真实数据库、模型、客户磁盘/云桶，未迁移、seed、部署、付费调用或清理历史数据。未读取 .env 或密钥。

## 一、结论与状态

**R0-J5 已实现，待独立审核。** 6 个原编号的剩余分支均有修复后的正向证据；未自行关闭 F13、进入 F14 或宣称上线/生产可用。

| 原编号 | 剩余缺口（R0-J4 审核） | 本轮结果 |
|--------|----------------------|----------|
| J3-01 | 单项删除恢复入口绕过共享引用检查 | 已接线到实际 remove_asset 恢复入口 |
| J3-02 | 清空/删除交错仍 CANCELLED；已释放重放误判漂移 | 已移除关闭逻辑、终态幂等、并发跳过如实标注 |
| J3-03 | 清空把 null 当 0、忽略 blocked；CANCELLED 重开先破坏后报冲突 | 原始大小 + blocked 前置消费 + 重开前事实核对 |
| J3-04 | 查询失败凭空加 1 条，未知总数与确定数量混用 | 检查失败次数与对象数分开，结构化未知状态 |
| J3-05 | 恢复分支允许管理员处理他人私密删除认领 | 只认持久认领主体，isManager 不再覆盖 |
| J3-07 | 文档缺失恢复查询 P2021/P2022 仍普通 500 | 稳定 503 + code，经实际 runStudioPost 验证 |

## 二、起点核对与全部改动（上轮审核 → 本轮交付）

起点采集于 `2026-11-08T05:16:07Z`，清单 `docs/reviews/R0-J5-fix-snapshot/start-manifest.json`（含完整副本、SHA256、真实时间、新文件标新）。

**5 个已存在文件的起点哈希与 R0-J4 独立审核 `manifest-verification.json`（`2026-11-08T04:57:57.260Z`）逐项完全一致，无中间变化需要记录。**

| 文件 | 起点 SHA256 | 期末 SHA256 | 差异 |
|------|-------------|-------------|------|
| `src/lib/storage-quota.ts` | `222e56f4474b4688d85e5ad824f2320a49d4ef6f939c343518f686bf215fc10d` | `b98803dff5a8386f0984efa48f1deeeeb26a5aaf7776aa7e868e2fb60de3e803` | 41 增 / 12 删 |
| `src/app/api/studio/handler.ts` | `b74714f7fd1b99355b2fd0fa55f5a440a914f609d896d2067b3c6038952f8f36` | `e67ed7224623288ea88dc07f9b2228a370eeecbbd3f0643ab2a092e9888e0ea4` | 36 增 / 4 删 |
| `src/app/api/workspace/clear-data/route.ts` | `78e7775f6107d492974562aef524fcf087ff45bd351b349067e5293011ef7ffc` | `adc29f8718c4f0a2f271721e0c4f3fbaf4e7d12e97d42bcaac3ca24c6c62fc18` | 30 增 / 11 删 |
| `src/app/api/__tests__/r0j2-storage-close.test.ts` | `82b92abaae2f6dc7df4135796c2ec21e824fbc964a206d8967d8c52089f7afea` | `83340107c1f9ac18545e852341c91629c3e069101438fc19b449f88ecbfa2005` | 5 增 / 3 删 |
| `src/app/api/__tests__/r0j4-storage-fixes.test.ts` | `914825d751389cefd496f6765b8fe3b6e4fdd3ec944663acfd03ec70216e7c4f` | `de87755b95556de55a2d250808beaa15ce9cff7fe84671359f2f5887a962dbef` | 10 增 / 3 删 |
| `src/app/api/__tests__/r0j5-remaining-branches.test.ts` | **新文件**（开工前不存在） | `12e7e25357904d633d06c29296212e743fa6e620523b069f3af052bbeb360d47` | 新增 20 条 |
| `docs/reviews/R0-J5-fix-report.md` | **新文件** | — | 本报告 |

- 期末完整副本：`docs/reviews/R0-J5-fix-snapshot/end-source/`；机器可读期末清单 `end-manifest.json`。
- 两处既有测试断言按提示 §八「把缺陷现象断言改为修复后的正向目标」修改，未删除测试：
  - `r0j2:632-646` 原断言「重复终结 `drift=true`（漂移阻断）」→ 改为 `finalized=true / alreadyReleased=true / drift=false`。
  - `r0j4:687-711` 原断言「查询失败 `pendingStill>=1`」→ 改为 `pendingStill=0 / recoveryCheckFailed=true / pendingCount=null / 不报完全成功`。
- **冻结未变**：`classifyExistingOp`（J3-06）起点/期末逐行一致（已核对 IDENTICAL）；`file-store.ts`、`schema.prisma`、`WorkspaceInternalLayoutV3.tsx` 等 36 份上轮未变更文件本轮也未改动。`closeClaimWithoutRelease` 生产调用已清零（函数本身保留，供既有共享保留正向测试使用）。

## 三、逐项正向证据

### J3-01 剩余：共享引用保护接到单项删除恢复入口

**实际入口**：`src/app/api/studio/handler.ts:4848-4898`（共享引用检查 `4867-4875`），用户正在调用的 `remove_asset` 文档不存在恢复分支。全库 `findStorageOpByDocument` 仅此一处调用，不存在"只修一个入口、其他继续绕过"。

**改动**：在 `deleteAssetFile`（外部删除）之前调用 `countOtherReferences(workspaceId, pending.filePath, [assetId])`，复用既有 `objectPathAliases` 历史别名身份规则；仍有引用则返回 `pendingCleared:false, sharedRefKept:true`，文案「共享引用保留：…（容量不释放）」。

**用户可见结果 / 状态前后**：

| 场景 | 请求前 | 请求后 |
|------|--------|--------|
| d1 已删、30 字节认领在途、d2 以 `assets/w1/x.bin` 别名引用 | d2 在、文件在、used=50（含其他对象 20）、认领 PENDING | 200；d2 在、文件在、used=50、认领仍 PENDING、无 RELEASED、`pendingCleared≠true`；其他对象与另一空间完整 |
| 无引用的同项已授权 pending | used=30、文件在、认领 PENDING | 200 `pendingCleared=true`；used=0、RELEASED、文件已清理；连续重试不重复扣减；另一空间资料/用量不动 |

**正向测试**：`r0j5-remaining-branches.test.ts:420-475`（2 条）。

### J3-05 剩余：同空间管理员不能绕过私密恢复权限

**实际入口**：`src/app/api/studio/handler.ts:4862-4866`。原条件 `pending.userId === userId || isManager` 改为仅 `pending.userId === userId`（持久认领主体）；不接受客户端 `visibility/filePath/uploaderId` 作为授权依据。公开治理流程（认领主体即发起删除的管理员）与本人上传者恢复不受影响。

**用户可见结果 / 状态前后**：企业空间 u1 所有者 / u2 成员（双用户夹具，非单用户代替）：

| 步骤 | 结果 |
|------|------|
| u2 私密资料仍存在，u1 请求 remove_asset | 403 |
| u2 已授权删除、文档已无、剩 u2 认领；u1 重试恢复 | 403 `ASSET_RECOVERY_FORBIDDEN`；文件、used=30、认领 PENDING 全部零变化，`pendingCleared≠true` |
| u2 合法重试 | 200 `pendingCleared=true`；used=0、RELEASED、文件清理 |
| 跨空间伪造 documentId | 幂等 200 无恢复；w1/w2 用量与 w2 认领均不变 |

**正向测试**：`r0j5-remaining-branches.test.ts:476-529`（2 条）。

### J3-03 剩余：清空消费 blocked、原始大小、重开前核载荷

**实际入口**：`src/app/api/workspace/clear-data/route.ts:158-175`（`claimObjectCleanup` 传原始 `d.fileSize`、blocked 前置消费）、`:200`（`finalizeObjectCleanup` 传原始值）；`src/lib/storage-quota.ts:488-510`（P2002 分支事实核对提前到 CANCELLED 重开之前）。

**改动要点**：清空不再用 `?? 0` 把 null 伪装成可信零字节；`claim.state==="blocked"` 在任何文件删除/最后元数据删除之前 `failedObjects.push(具体原因)` 并 `continue`；重开/复用前核对 `workspaceId / opType / 规范对象身份(objectClaimOpId) / 可信字节`，矛盾或未知一律 blocked，不覆盖历史字节。

**验收表 5 行逐行正向证据**（`r0j5-remaining-branches.test.ts:530-618`）：

| 入口与前置状态 | 修复后结果 |
|----------------|-----------|
| 清空，fileSize=null，文件30/used30 | 资料/文件/used=30 保留、`clearedCount=0`、认领零创建、未知大小原因、不报出厂完成 |
| 清空，pending.bytes30 / 文档 fileSize50 | blocked 被消费，文件/文档/占用/认领零变化，`clearedCount=0`，不报出厂完成 |
| 单项删除，CANCELLED.bytes30 / 文档 fileSize50 | 500 `STORAGE_SIZE_UNKNOWN`；认领仍 CANCELLED（未重开）、文件/文档/used=30 不动 |
| 单项 / 清空，可信真实 0 字节 | 正常删除与 RELEASED 终态，used 保持 0；纯 JSON 文本无物理文件仍正常（`clearedCount=2`、报出厂完成） |
| 两个无冲突正常对象（30/20） | 各自只释放可信字节、RELEASED 记录为 `[20,30]`；另一空间资料/文件/used=10 不动 |

### J3-02 剩余：清空/删除交错与已释放终态重放

**实际入口**：`src/app/api/workspace/clear-data/route.ts:190-197`（移除 `claim.state==="claimed" && count===0` 关闭共用认领），`:238/:245`（并发跳过纳入 `hasRetention` 与待核实文案）；`src/lib/storage-quota.ts:551-555`（事务内先识别 RELEASED 终态）。

**改动要点**：`count=0` 只记 `concurrentSkipped++` 与 `pendingStill++`（如实待处理），不调用 `closeClaimWithoutRelease`；共用认领由完成方或受授权恢复者推进真实终态。事务内已 RELEASED 直接返回幂等事实，不再扣量、不报新漂移；未完成且用量不足仍保持漂移阻断、不清零。

**显式屏障交错（非"强制 count=0 + 手动删行"）**：A 清空扫描并创建认领后停在文件删除前 → B 单项删除读取旧资料、物理删除与删行成功后暂停 → A 继续至 `count=0` → 最后 B 终结。结果：`ra=200 / rb=200`、文件与文档已删、`used=0`、RELEASED、只释放一次、**无 CANCELLED**；A 不报「纯净出厂状态」且 `concurrentSkipped=1`；另一空间资料/文件/用量不动。另有反向交错（A 单项 / B 清空）`404/200`、RELEASED、无 CANCELLED、`used=0`。

**其它正向证据**：同认领连续终结 `30→0` 后重放 `alreadyReleased=true / drift=false / finalized=true`；终结提交故障后重试可终结且只释放一次；用量不足仍 `drift=true`、认领保持 PENDING、used 不清零。

**正向测试**：`r0j5-remaining-branches.test.ts:619-733`（4 条）。两个 remove_asset 交错为既有通过项，本轮只回归，未重做。

### J3-04 剩余：查询失败是状态未知

**实际入口**：`src/app/api/workspace/clear-data/route.ts:139-146`（catch 只记检查失败次数）、`:246`（文案）、`:257-272`（结构化字段）、`:238`（`hasRetention`）。

**改动**：查询失败不再 `pendingStill++`；新增 `recoveryCheckFailed`、`recoveryCheckFailureCount`、`pendingCountKnown`、`pendingCount`（未知时 `null`）。文案「恢复检查失败，待清理数量未知」；`concurrentSkipped` 明确「完成状态待核实」。逐项失败仍按实际条数报告，正常空集合继续显示清理完成。

| 场景 | 修复后结果 |
|------|-----------|
| 实际 0 条认领 + 查询失败 | `pendingStill=0`、`recoveryCheckFailed=true`、`recoveryCheckFailureCount=1`、`pendingCountKnown=false`、`pendingCount=null`；无「1 条未完成」、不报完全成功 |
| 实际 2 条认领 + 查询失败 | 同上，不编造具体总数 |
| 查询成功、逐项提交失败 1 条 | `pendingStill=1`、`pendingCount=1`、`pendingCountKnown=true`、文案「1 条…仍未完成」 |
| 查询成功、恢复完成 | `pendingRecovered=1`、`pendingStill=0`、`pendingCount=0`、报出厂完成 |

**正向测试**：`r0j5-remaining-branches.test.ts:735-789`（3 条）。

### J3-07 剩余：恢复查询就绪错误与实际 HTTP 映射

**实际入口**：`src/lib/storage-quota.ts:607-633`（`findStorageOpByDocument` try/catch：P2021→`STORAGE_QUOTA_NOT_READY`、P2022→`STORAGE_OP_UNAVAILABLE`，普通异常原样抛）；`src/app/api/studio/handler.ts:4853-4860`（查询）、`:4881-4888`（终结）捕获 `StorageQuotaError` 直接返回 `status=err.status` 与稳定 code，不落入 Studio 通用 500。

**改动**：就绪错误在任何物理动作之前拒绝，`error` 为固定中文文案，不泄露 SQL/密钥；不在请求中生成客户端、迁移或修表。既有两条上传 503 的 code 与行为未改动。

| 注入（目标文档已无） | HTTP | code | 副作用 |
|---------------------|------|------|--------|
| 缺 delegate | 503 | `STORAGE_QUOTA_NOT_READY` | 文件在、used=30、认领 PENDING 零变化 |
| P2021 缺表 | 503 | `STORAGE_QUOTA_NOT_READY` | 同上 |
| P2022 缺列 | 503 | `STORAGE_OP_UNAVAILABLE` | 同上 |
| 普通业务异常 | 500（通用） | 非就绪码 | 同上（不伪装成未迁移） |

以上均通过**实际 `runStudioPost` / `remove_asset`** 验证，不只断言 service 抛错。**正向测试**：`r0j5-remaining-branches.test.ts:790-835`（4 条）。

## 四、验证命令与结果

按提示 §八精确隔离回归（16 文件）+ 本轮新增 1 文件，未做全仓无过滤扫描，未运行 `npm test`：

```
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0j4-storage-fixes.test.ts src/app/api/__tests__/r0j3-recovery-close.test.ts src/app/api/__tests__/r0j2-storage-close.test.ts src/app/api/__tests__/r0j-storage.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0i2-cold-quote.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts src/app/api/__tests__/r0j5-remaining-branches.test.ts
```
- **结果**：`Test Files 17 passed (17)`，`Tests 513 passed (513)`，退出码 **0**。（493 为上轮基线，新增 20 条；测试数量不作为验收目标）

```
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```
- **结果**：退出码 **0**，无输出。
- 新增测试单独运行结果：`1 passed / 20 passed`，退出码 0。
- IDE lint：6 个改动文件 0 diagnostics。

**IO 隔离声明**：所有测试使用内存 Prisma 与内存 fs；`fs/promises`、Prisma、`auth`、`credit-service`、`workspaceInit`、`serverCache` 等外部依赖均被显式 vi.mock 替换；并发使用显式 `beforeUnlink` / `afterDocDelete` 屏障交错，不依赖真实 MySQL 行锁。未连接真实数据库、模型、云桶、客户磁盘，未发生费用。

## 五、回滚范围与限制

**回滚范围**（如需回退本轮，仅以下 7 个路径）：3 份源码、2 份既有测试断言、1 个新增测试文件、本报告；快照目录 `docs/reviews/R0-J5-fix-snapshot/` 为证据，不属于运行时代码。`closeClaimWithoutRelease` 函数保留未删，因此回滚不会破坏既有共享保留正向测试。

**限制与未完成项（如实声明）**：
- 并发证据来自内存夹具的显式屏障与行级事务撤销日志，**不等于真实 MySQL 并发验收**；未做浏览器端到端验收、未做真实库/交易/生产可用验收。
- 本轮未做 `next build`（该 IDE 环境的批量删除钩子会拦截 `.next` 清理）；类型检查已由全量 `tsc --noEmit` 覆盖。
- 未进入 F14，未关闭 F13；未新增运营页面、配置项、通用恢复队列或历史数据扫描/自动修复。
- 起点快照中 5 个既有文件哈希与上轮独立审核完全一致，本轮无中间变化；两处既有测试断言按提示要求改为正向目标，未删除任何旧测试凑全绿。
- 存储计量口径、私密权限政策、就绪错误码均沿用既有约定，未改商业规则与权限产品。

## 六、停止条件

6 个原编号剩余分支全部有修复后的正向验证证据，本轮到此停止。报告结论为 **「R0-J5 已实现，待独立审核」**；不自行宣布 F13 通过、不进入 F14、不上线。若后续需要真实库、客户文件、费用或突破冻结范围才能继续，将停止对应动作并指出具体阻碍。
