# R0-J4 修复报告（F13 收尾，严格限定 J3-01 ~ J3-07）

> 本批次只闭合 R0-J3 独立审核发现的七项缺口（J3-01~J3-07），未进入 F14、未新增功能、未修改商业规则、未执行真实库/付费操作。
> 验证全部基于隔离夹具：内存 Prisma + 内存 fs + 真实 service / handler / route，数据库、文件系统、模型调用、计费均被隔离，无任何外连。

## 一、范围与红线确认

| 项目 | 状态 |
|------|------|
| 进入 F14 | ❌ 不进入 |
| 新增功能 | ❌ 无 |
| 修改商业规则 | ❌ 无 |
| 真实数据库 / 迁移 / seed / 付费操作 | ❌ 无（全程内存隔离，零副作用） |
| 仅修 J3-01 ~ J3-07 | ✅ 是 |

## 二、目标文件与起止哈希

| 文件 | 起点 SHA256（开工前快照） | 期末 SHA256 | 差异 | 本会话是否改 |
|------|----------------------|-------------|------|--------------|
| `src/lib/storage-quota.ts` | `0c6949ba8891be3809a095e926224ffc659744baa8cd55e789dba39c05d1fb45` | `222e56f4474b4688d85e5ad824f2320a49d4ef6f939c343518f686bf215fc10d` | 11 增 / 9 删（20 行） | ✅ 改（J3-06 + J3-03 补齐） |
| `src/app/api/studio/handler.ts` | `b74714f7fd1b99355b2fd0fa55f5a440a914f609d896d2067b3c6038952f8f36` | `b74714f7fd1b99355b2fd0fa55f5a440a914f609d896d2067b3c6038952f8f36` | 0 | ⛳ 上一轮已落地，本会话逐项复核未改 |
| `src/app/api/workspace/clear-data/route.ts` | `78e7775f6107d492974562aef524fcf087ff45bd351b349067e5293011ef7ffc` | `78e7775f6107d492974562aef524fcf087ff45bd351b349067e5293011ef7ffc` | 0 | ⛳ 上一轮已落地，本会话逐项复核未改 |

- 起点快照目录：`docs/reviews/R0-J4-fix-snapshot/frozen-source/`（完整源文本 + 真实时间）
- 期末快照目录：`docs/reviews/R0-J4-fix-snapshot/end-source/`
- 说明：`handler.ts` 与 `clear-data/route.ts` 的 J3 修复已在 R0-J3/R0-J4 上一轮落地，本会话逐项复核确认已正确（起点=期末哈希一致），本会话仅在 `storage-quota.ts` 补齐两处缺口并新增 `r0j4` 定向测试。

## 三、逐项验证证据（J3-01 ~ J3-07）

### J3-01　清空恢复流程必须先复核实际共享引用，再删除
- **缺陷**：`clear-data` 恢复循环先 `deleteAssetFile` 再检查后续文档引用；出现「待清理 RELEASE + 两个别名引用」时文件被删、容量归零、资料仍在。
- **修复**：`clear-data/route.ts` 恢复循环在 `deleteAssetFile` 前调用 `countOtherReferences(workspaceId, claim.filePath, [])`，仍被引用则 `sharedRefKept++` 并跳过（保留文件/记录/计量）。
- **正向验证**（测试：`存在待清理认领 + 两文档别名共享同一对象 → 恢复与删除均保留…`）：
  注入「待清理认领 + 文档 d1(assets/w1/sh.bin)、d2(w1/sh.bin) 共享 w1/sh.bin」→ `sharedRefKept≥2`、`docs.size===2`、`storageUsed===50`、物理文件保留、认领保持 `PENDING_CLEANUP`、提示文案含「共享引用保留」且不含「纯净出厂」。

### J3-02　共用认领不能被并发后到者取消（count=0 不得关闭）
- **缺陷**：同对象 A/B 共用 deterministic opId，A 删行成功未终结、B `deleteMany` 返回 `count=0` 时把 A/B 共用操作改 `CANCELLED`，A 终结失败 → 容量永不释放。
- **修复**：`handler.ts` 4 处「删行 `count!==1`」路径（remove_asset / documentremoval 永久删除 / batch_delete_assets / batch_remove_assets）移除 `closeClaimWithoutRelease`，改为 `failed.push` 或直接 404，**保留 `PENDING_CLEANUP`** 供完成方或恢复重试终结。
- **正向验证**（测试：`B 的 count=0 → 认领保持 PENDING_CLEANUP（不取消）…`）：
  模拟 B 删行 `count=0` → 返回 404 且认领 `status==="PENDING_CLEANUP"`（非 `CANCELLED`）、`storageUsed===30`；随后恢复终结仅释放一次（`pendingRecovered===1`、`used===0`、`RELEASED`）。

### J3-03　持久认领是可信事实，字节未知/冲突先阻断
- **缺陷**：已有认领 `bytes=30`，调用方文档 `fileSize=50` 仍按 50 扣减；`null` 经 `??0` 被当作真实零字节删除并释放。
- **修复**：
  - `storage-quota.ts` `claimObjectCleanup`：`normalizeBytes` 返回 `null`（未知/负数/NaN）→ `{state:"blocked", reason:"unknown-size"}`；P2002 历史字节与调用方矛盾 → `{state:"blocked", reason:"bytes-mismatch"}`（不再返回 `already-pending` 穿透删除）。
  - `handler.ts` 4 处传入**原始** `target.fileSize`（不 `??0`），并对 `claim.state==="blocked"` 返回 500 `STORAGE_SIZE_UNKNOWN`。
  - `finalizeObjectCleanup` 以持久 `existing.bytes` 为可信释放额，调用方矛盾经 `RELEASE_DRIFT` 兜底。
- **正向验证**（4 个用例）：
  1. `历史认领 bytes=30，调用方 fileSize=50 → 冲突阻断`：返回 500 `STORAGE_SIZE_UNKNOWN`，文件/记录/计量均保留（`used===30`）。
  2. `fileSize=null（未知大小）→ 阻断保留`：返回 500 `STORAGE_SIZE_UNKNOWN`，文件/记录保留。
  3. `真实 0 字节文件仍可正常删除并终态释放`：成功、`RELEASED`、`used` 不变。
  4. `两条无冲突正常对象只释放各自真实字节（30 与 20）`：`used 50→0`，各自真实字节，无误释放。

### J3-04　恢复查询/处理失败必须如实计入，不得编造 0 / 谎报完全出厂
- **缺陷**：恢复循环某条物理删除失败/`findMany` 自身出错时 `pendingStill += 0`，返回成功却仍有 `PENDING_CLEANUP`（提示「完全重置」）。
- **修复**：`clear-data/route.ts` 恢复循环 `try/catch`：`pendingStill++` 且 `recoveryCheckFailed=true`（不编造 0）；新增 `if (fin.conflicted) { pendingStill++; continue; }`；`recoveryCheckFailed` 进入 `hasRetention` 与提示文案「恢复检查失败：存在历史待清理认领数量未知…」。
- **正向验证**（3 个用例）：
  1. `待清理认领终结提交故障 → 如实 pendingStill`：`pendingStill≥1`、`used===30`、提示含「历史待清理认领仍未完成」。
  2. `恢复查询失败（无法确认数量）→ recoveryCheckFailed，明确状态未知`：`pendingStill≥1`、`recoveryCheckFailed` 已在提示体现（`message` 含「恢复检查失败」）、`used===30`。
  3. `无残留的纯净清空仍按原流程完成`：`clearedCount===1`、`pendingStill===0`、提示含「纯净出厂状态」、`used===0`。

### J3-05　文档已删后，相同删除重试仍须识别恢复状态（按文档/空间/操作者核权）
- **缺陷**：`remove_asset` 目标文档已删、但认领仍在途时，重试无法识别恢复，容量滞留。
- **修复**：`handler.ts` `remove_asset` 目标不存在分支调用 `findStorageOpByDocument(assetId, workspaceId)`；命中 `PENDING_CLEANUP` 且 `(pending.userId===userId || isManager)` → `deleteAssetFile` 后 `finalizeObjectCleanup`；冲突/`drift` 如实拒绝；其余按幂等成功。
- **正向验证**（2 个用例）：
  1. `文档已删 + 存在本空间待清理认领 → 重试恢复终结释放一次`：返回 200、`pendingCleared===true`、仅释放一次（`used===0`、`RELEASED`、文件确认清理）。
  2. `另一空间的待清理认领不可被本空间伪造 documentId 触发恢复/释放`：本空间 `used` 不受影响、他空间认领保持 `PENDING_CLEANUP`（跨空间边界隔离）。

### J3-06　预留重放必须包含操作类型核验（RELEASE ≠ RESERVE）
- **缺陷**：`classifyExistingOp` 仅按空间/用户/字节/状态判定，**未校验 opType**；RELEASE 清理认领与 RESERVE 预留同身份被误判为 `deduped`（本应 409 冲突）。同时既有语义要求 **RELEASED 终态一律冲突**（不得 dedup 后继续创建新对象）。
- **修复**：`storage-quota.ts` `classifyExistingOp` 新增 `sameType = existing.opType === opType`；`nonConflictStatus` 仅保留 `["RESERVED","CONFIRMED","PENDING_CLEANUP"]`（移除 `RELEASED`，RELEASED 终态必冲突）；预留路径两处调用传入 `"RESERVE"`。
- **正向验证**（3 个用例）：
  1. `已存在 RELEASE 清理认领（同 opId/空间/用户/字节）→ 再次预留必须冲突 409`：`code STORAGE_OP_CONFLICT`、`status 409`、`used` 零增量。
  2. `同类型合法 RESERVE 重放 → deduped`：`deduped===true`、`opConflict===false`、只占一次（`used===100`）。
  3. `P2002 并发：同 opType 但不同主体 → OP_CONFLICT`：`code STORAGE_OP_CONFLICT`、`status 409`、`used===100`。
  - 既有回归 `r0j2`「同 opId 已释放状态重放 → OP_CONFLICT（不得 dedup 后继续创建新对象）」同步保持通过。

### J3-07　缺列/缺表按部署未就绪返回稳定 503
- **缺陷**：缺列/P2022 抛出原始 Prisma 错误（普通 500、泄露表结构）；缺表 delegates 未就绪时 `undefined.findUnique` → TypeError 普通 500。
- **修复**：`storage-quota.ts` `findStorageOp` 捕获 `P2022/缺失列` → `STORAGE_OP_UNAVAILABLE`（503）；`claimObjectCleanup` / `finalizeObjectCleanup` 透传 `OP_UNAVAILABLE`；`ensureOpModel` 缺失 delegate → `NOT_READY`（503）。
- **正向验证**（3 个用例）：
  1. `缺列（P2022）预留 → 稳定 503`：`code STORAGE_OP_UNAVAILABLE`、`status 503`、零副作用。
  2. `缺列（P2022）认领 → 稳定 503`：`code STORAGE_OP_UNAVAILABLE`、`status 503`、零写入。
  3. `delegate 未就绪（缺表）→ 503`：`code STORAGE_QUOTA_NOT_READY`、`status 503`；预留/认领均零副作用。

## 四、验证命令与结果

> 隔离回归（15 个既有文件 + 本轮新增 1 个）：
```
.\node_modules\.bin\vitest.cmd run --no-color \
  src/app/api/__tests__/r0j3-recovery-close.test.ts \
  src/app/api/__tests__/r0j2-storage-close.test.ts \
  src/app/api/__tests__/r0j-storage.test.ts \
  src/app/api/__tests__/r0h-cost-admission.test.ts \
  src/app/api/__tests__/r0i2-cold-quote.test.ts \
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts \
  src/app/api/__tests__/r0f-maintenance-readonly.test.ts \
  src/app/api/__tests__/r0e-production-mock.test.ts \
  src/app/api/__tests__/r0d-refund-approval.test.ts \
  src/app/api/__tests__/r0c-pool-recycle.test.ts \
  src/app/api/__tests__/r0b-seat-addon.test.ts \
  src/app/api/__tests__/r0a-business-boundary.test.ts \
  src/app/api/__tests__/r0a2-real-combo.test.ts \
  src/app/api/__tests__/r0a3-combo-regression.test.ts \
  src/app/api/__tests__/r0a4-combo-regression.test.ts \
  src/app/api/__tests__/r0j4-storage-fixes.test.ts
```
- **结果**：`Test Files 16 passed (16)`，`Tests 493 passed (493)`，**EXIT 0**（476 既有 + 17 新增 `r0j4`）。

> 类型检查：
```
npx tsc --noEmit -p tsconfig.json
```
- **结果**：**EXIT 0**（无类型错误）。

> 新增定向测试：`src/app/api/__tests__/r0j4-storage-fixes.test.ts`（17 个用例，复用 R0-J3 隔离夹具并补充 `findManyFail` / `deleteManyZero` / `columnMissing` 注入）。

## 五、未进入 / 未变更

- 不进入 F14；未新增任何功能；未修改任何商业规则与计费口径。
- 未执行真实数据库、迁移、seed 脚本或任何付费/模型调用（全程内存隔离）。
- `handler.ts`、`clear-data/route.ts` 本会话未改动源码（其 J3 修复于上一轮落地并经本会话复核）；本会话唯一源码改动位于 `storage-quota.ts`（J3-06 opType+RELEASED 终态冲突、J3-03 字节冲突阻断）。

## 六、提交与待审

- 已提交 `R0-J4-fix-report.md` 与 `docs/reviews/R0-J4-fix-snapshot/`（起点/期末快照 + 哈希）。
- **等待独立审核**。审核范围建议：七项缺口（J3-01~J3-07）是否逐项有可复现的正向验证证据，且未引入真实库/付费操作副作用。
