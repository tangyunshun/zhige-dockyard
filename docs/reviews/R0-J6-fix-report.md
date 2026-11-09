# R0-J6 修复报告：原 J3-02 并发完成误报、J3-04 待处理数量漏计

> 本轮只闭合 R0-J5 独立审核列出的**两个状态缺口**。J3-01/03/05/07 已通过并冻结，J3-06、J-KEYS 与 F01–F12 继续冻结，不进入 F14。
> 未新增功能、页面、配置项、架构层、分布式锁服务、队列平台或运营产品；未改价格、套餐、额度、算力点、BYOK、支付、结算、模型与解析/OCR 策略；未改私密/共享/容量政策。
> 验证全程为隔离夹具（内存 Prisma + 内存 fs + 真实 handler/service/route），未连接真实数据库、模型、客户磁盘/云桶，未迁移、seed、部署、付费调用或清理历史数据。未读取 .env 或密钥。

## 一、结论与状态

**R0-J6 已实现，待独立审核。** 两个原编号均有修复后的正向证据；未自行关闭 F13、进入 F14 或宣称上线/生产可用。

| 原编号 | 剩余缺口（R0-J5 审核） | 本轮结果 |
|--------|----------------------|----------|
| J3-02 | 两个终结事务都先读到旧 PENDING 时，后到者把已完成认领误报为漂移 | 事务回滚后用独立连接重读已提交终态，返回幂等完成 |
| J3-04 | `pendingCount` 直接等于 `pendingStill`，共享/漂移保留的认领漏计为 0 | 按最终只读持久事实以唯一 opId 计数，核实失败报未知 |

两项均为 API 状态与持久事实的一致性修复，不涉及人民币/算力点账务，不改变容量、收费或权限政策。

## 二、起点核对与全部改动（上轮审核 → 本轮交付）

起点采集于 `2026-11-08T06:23:26.9951805Z`，清单 `docs/reviews/R0-J6-fix-snapshot/start-manifest.json`（4 份既有文件完整副本、SHA256、真实时间；2 个新文件标新）。

**4 份既有文件起点哈希与 R0-J5 独立审核 `manifest-verification.json`（`2026-11-08T06:06:44.078Z`）逐项完全一致，无中间变化需要记录。**

| 文件 | 起点 SHA256 | 期末 SHA256 | 差异 |
|------|-------------|-------------|------|
| `src/lib/storage-quota.ts` | `b98803dff5a8386f0984efa48f1deeeeb26a5aaf7776aa7e868e2fb60de3e803` | `0bef7f02d6206544c45045e89239945a60309f4a512a9f0227186cf2498f0666` | 27 增 / 2 删 |
| `src/app/api/workspace/clear-data/route.ts` | `adc29f8718c4f0a2f271721e0c4f3fbaf4e7d12e97d42bcaac3ca24c6c62fc18` | `7e4aea48aecbbac40a5e65dfd354aaed430202b840d72d378e79856521a88c26` | 31 增 / 3 删 |
| `src/app/api/studio/handler.ts` | `e67ed7224623288ea88dc07f9b2228a370eeecbbd3f0643ab2a092e9888e0ea4` | 同左（**UNCHANGED**） | 0 |
| `src/app/api/__tests__/r0j5-remaining-branches.test.ts` | `12e7e25357904d633d06c29296212e743fa6e620523b069f3af052bbeb360d47` | 同左（**UNCHANGED**） | 0 |
| `src/app/api/__tests__/r0j6-status-fixes.test.ts` | **新文件** | `ca36bb2fa67479b67c0cab47ddea6f3cc369e36e2f8046a57cbcf91e5b7436cc` | 新增 10 条 |
| `docs/reviews/R0-J6-fix-report.md` | **新文件** | — | 本报告 |

- 期末完整副本：`docs/reviews/R0-J6-fix-snapshot/end-source/`；机器可读期末清单 `end-manifest.json`。
- **未改 handler 的理由**：J3-02 修复落在 service 返回事实（后到者 `drift=false / finalized=true / alreadyReleased=true`），`remove_asset` 文档缺失恢复入口（`handler.ts:4881-4895`）原本就消费 `fin.drift` 与 `fin.conflicted`，无需改动即可正确返回 200；已用实际 API 验证，非只改测试返回对象。
- **未弱化/删除任何旧测试**：既有 17 文件 513 条全部原样保留并通过；未改 `r0j5` 测试文件一个字节。
- **冻结未变**：J3-01/03/05/07 实现、`classifyExistingOp`（J3-06）、`file-store.ts`、`schema.prisma`、`WorkspaceInternalLayoutV3.tsx` 等均未改动。
- 起点清单中 `additional-cases.txt` 的 3 条「缺陷现象确认」断言，按要求未作为绿灯保留：本轮新增测试把同一业务场景改写为**修复后的正确结果**（见下）。

## 三、J3-02：并发终结后到者识别已提交完成

### 实际入口与改动

- `src/lib/storage-quota.ts:536-552`：新增模块内小范围辅助 `readCommittedFinalState(workspaceId, claimOpId, expectedBytes)`。**事务回滚后**用事务外 `prisma` 独立读取（不复用原事务旧快照）；只有同一 `opId` 确已 `RELEASED`，且 `workspaceId` / `opType === "RELEASE"` / 规范对象身份（`objectClaimOpId(workspaceId, op.filePath) === claimOpId`）/ 可信字节一致，才判定幂等完成。不把「存在一条操作」当成功。
- `src/lib/storage-quota.ts:604-622`：`finalizeObjectCleanup` 的 `RELEASE_DRIFT` 与 `STORAGE_CLAIM_FINALIZE_RACE` 两个 catch 分支，在事务整体回滚后调用上述核对；命中返回 `{ released:false, drift:false, finalized:true, alreadyReleased:true }`，未命中则 `RELEASE_DRIFT` 保持 `drift=true`、`RACE` 如实抛出。
- **未改动受保护写顺序**：仍是「条件扣减 + `PENDING_CLEANUP→RELEASED` 条件状态转换」在同一短事务内原子执行，靠状态条件互斥，只有真正完成者扣量一次；外部物理 IO 仍在事务之外。因此审核的并发屏障位置（quota 条件扣减前）保持有效，业务交错事实与 `additional-cases.txt` 一致。
- 未无条件把 `count=0` 或所有 `RELEASE_DRIFT` 改为成功，未清零用量；真实 PENDING + 用量不足仍 `drift=true` 并回滚。

### 用户可见结果 / quota 与认领终态 / 并发顺序

| 场景 | 修复后结果 |
|------|-----------|
| 同用户两个实际删除恢复请求，屏障控制「两个终结事务都已读到旧 PENDING，A 先提交、B 再继续」 | A=200/`pendingCleared=true`；B=200/`pendingCleared=true`（不再 500/`STORAGE_RELEASE_DRIFT`、不再出现「人工核对」）；认领唯一且 `RELEASED`；`used 30→0` 且仅一次条件扣减命中（`arrivals=2`）；文件确认清理；另一对象与另一空间资料/文件/计量不动 |
| 第一次完成后再开始第二次请求 | 顺序幂等保持：200、不重复扣减、认领仍 `RELEASED`、无新认领 |
| 真实 PENDING、bytes30、used10 | 实际恢复入口仍 500/`STORAGE_RELEASE_DRIFT`；`used=10` 不清零、认领保持 `PENDING_CLEANUP`、不伪装成功 |
| 终结提交失败后重试 | 首次回滚保留 `PENDING_CLEANUP` 与 `used=30`；故障解除后 `finalized=true`、`used=0`、仅释放一次 |

**并发顺序（显式屏障，非顺序请求冒充）**：`r0j6-status-fixes.test.ts:417-466` 用 `h.rawGate` 挂在 `$executeRaw` 上，`storageUsed\` = \`storageUsed\` -` 语句前计数；第 1 次到达（A）等待，第 2 次到达（B）释放 A 并让 B 等待，A 完整提交 `RELEASED` 后 B 才继续扣减。两个请求均在 A 提交前读到旧 PENDING，最终写入依次执行。隔离夹具不代表真实 MySQL 事务锁/回滚验收。

### 3 条缺陷现象断言改为正确结果

`additional-cases.txt` 中 `overlapping-finalizers-characterization` 原断言 `rb.status=500 / STORAGE_RELEASE_DRIFT`；本轮 `r0j6-status-fixes.test.ts:417-466` 改为断言两个请求都成功/幂等完成、`RELEASED`、`used=0`、仅一次扣减。另两条 J3-04 缺陷现象在下文对应改写。

**正向测试**：`r0j6-status-fixes.test.ts:416-513`（4 条）。

## 四、J3-04：待清理数量按持久事实唯一计数

### 实际入口与改动

- `src/app/api/workspace/clear-data/route.ts:236-255`：在所有恢复/资料循环结束、`clearServerCache()` 之后、结果计算之前，做一次**最小只读核实**：`storageoperation.findMany({ where: { workspaceId, opType:"RELEASE", status:"PENDING_CLEANUP" }, select:{ opId:true } })`，用 `new Set(opId).size` 按唯一认领计数。共享保留、真实漂移、物理失败、并发跳过、认领已建立等未终结事实全部纳入；同一认领被恢复循环和资料循环碰到不重复计数。只读，不修改任何认领/额度；不为计数引入锁服务/队列或写库修复。
- `src/app/api/workspace/clear-data/route.ts:260-261`：`hasRetention` 增加「仍有尚未终结认领」条件，不伪装完全出厂重置。
- `src/app/api/workspace/clear-data/route.ts:270-271`：当 `pendingCount > pendingStill` 时如实提示「当前仍有 N 条清理认领尚未终结（占用保持计量）」。
- `src/app/api/workspace/clear-data/route.ts:294-298`：`storage` 输出 `pendingCountKnown` / `pendingCount`（由最终核实决定），新增 `pendingStillScope: "本请求已知逐项失败/未完成数，非全部尚存认领"` 明确 `pendingStill` 口径。
- 核实失败路径（`:252-254`）：`console.warn` 可诊断 + `recoveryCheckFailureCount++` + `recoveryCheckFailed=true` → `pendingCountKnown=false`、`pendingCount=null`，不伪装完全完成；普通查询/计数失败不被吞成 0。初始恢复查询失败时跳过最终核实，沿用已有 `unknown/null` 与不报完全成功。

### 用户可见结果 / 计数事实

| 场景 | 修复后结果 |
|------|-----------|
| 两资料别名引用同对象 + 1 条 pending 认领，清空保留 | 文件/资料/`used=30` 仍在、认领 `PENDING`；`pendingCountKnown=true`、`pendingCount=1`（原为 known/0）；不报完全出厂 |
| 无文档、认领 bytes30 / used10 真实漂移 | 认领 `PENDING`、`used=10` 保持（漂移不清零）；`driftSkipped=1`、`pendingCount=1`（原为 known/0） |
| 一条恢复成功、一条共享保留 | `pendingRecovered=1`；只计仍存在的唯一 pending 认领 `pendingCount=1`，不被两循环重复计数；`used 50→20`，共享对象 20 保留 |
| 正常空集合 / 全部完成 | `pendingCountKnown=true`、`pendingCount=0`，与持久终态一致，正常显示清理完成 |
| 初始恢复查询失败（实际 0 条 / 2 条） | `pendingCountKnown=false`、`pendingCount=null`、`pendingStill=0`、`recoveryCheckFailed=true`、提示「待清理数量未知」、不报完全成功 |
| 最终计数/核实失败 | `pendingCountKnown=false`、`pendingCount=null`、`recoveryCheckFailed=true`、`recoveryCheckFailureCount≥1`、日志可诊断、不报完全成功；认领仍 `PENDING`、`used=10` 未被改动 |

共享对象与计量继续保留，漂移不清零；未为让 `pendingCount` 归零而取消/删除认领、释放在用对象容量或隐藏错误。

**正向测试**：`r0j6-status-fixes.test.ts:517-634`（6 条）。其中 `shared-pending-count-characterization`（原断言 known/0）与 `drift-pending-count-characterization`（原断言 known/0）分别改为 `pendingCount=1` 的正确结果，位于 `:518-550`。

## 五、验证命令与结果

按提示 §四精确隔离回归（17 文件基线）+ 本轮新增 1 文件，未做全仓无过滤扫描，未运行 `npm test`：

```
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0j5-remaining-branches.test.ts src/app/api/__tests__/r0j4-storage-fixes.test.ts src/app/api/__tests__/r0j3-recovery-close.test.ts src/app/api/__tests__/r0j2-storage-close.test.ts src/app/api/__tests__/r0j-storage.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0i2-cold-quote.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts src/app/api/__tests__/r0j6-status-fixes.test.ts
```
- **结果**：`Test Files 18 passed (18)`，`Tests 523 passed (523)`，退出码 **0**。（513 为上轮基线，新增 10 条；数量不作为验收目标）
- 源码改动后、新增测试前的基线回归：`17 passed / 513 passed`，退出码 0。
- 新增测试单独运行：`1 passed / 10 passed`，退出码 0。

```
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```
- **结果**：退出码 **0**，无输出。
- IDE lint：3 个改动/新增文件 0 diagnostics。

**IO 隔离声明**：所有测试使用内存 Prisma 与内存 fs；`fs/promises`、Prisma、`auth`、`credit-service`、`workspaceInit`、`serverCache` 等外部依赖均被显式 `vi.mock` 替换；并发使用挂在 `$executeRaw` 上的显式屏障交错，不依赖真实 MySQL 行锁。未连接真实数据库、模型、云桶、客户磁盘，未发生费用。

## 六、回滚范围与限制

**回滚范围**（如需回退本轮，仅以下 4 个路径）：2 份源码、1 个新增测试文件、本报告；快照目录 `docs/reviews/R0-J6-fix-snapshot/` 为证据，不属于运行时代码。未删除或改动任何既有测试，`handler.ts` 无变更，回滚不会破坏已通过的 J3-01/03/05/07 路径。

**限制与未完成项（如实声明）**：
- 并发证据来自内存夹具的显式屏障与行级事务撤销日志，**不等于真实 MySQL 事务隔离/行锁验收**；未做浏览器端到端验收、未做真实库/交易/生产可用验收。
- 本轮未做 `next build`（该 IDE 环境的批量删除钩子会拦截 `.next` 清理）；类型检查已由全量 `tsc --noEmit` 覆盖。
- `pendingCount` 采用请求结束前的一次只读最终核实；正常并发导致的结果时点差异按该最近可核实事实报告，未引入锁服务或写库修复。
- 未进入 F14，未关闭 F13；未新增运营页面、配置项、通用恢复队列或历史数据扫描/自动修复。
- 起点快照中 4 个既有文件哈希与上轮独立审核完全一致，本轮无中间变化；`handler.ts` 与 `r0j5` 测试文件起点/期末哈希一致，可作为「未重开已通过功能」的直接证据。
- 存储计量口径、私密/共享权限政策、就绪错误码均沿用既有约定，未改商业规则与权限产品。

## 七、停止条件

两个原编号的剩余状态缺口均有修复后的正向验证证据，本轮到此停止。报告结论为 **「R0-J6 已实现，待独立审核」**；不自行宣布 F13 通过、不进入 F14、不上线。若后续需要真实库、客户文件、费用或突破冻结范围才能继续，将停止对应动作并指出具体阻碍。
