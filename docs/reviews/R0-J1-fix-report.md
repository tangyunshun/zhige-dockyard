# R0-J1 修复报告：存储配额闭环补齐

**状态：R0-J1 待独立复核**（不进入 F14、不部署）

只修 R0-J 独立审核确认的 8 项缺口（J-UPLOAD/J-RELEASE/J-CLEAR/J-PRIVATE/J-KEYS/J-WRITE-BOUND/J-PARTIAL/J-RECONCILE），不进入 F14，不修改 BYOK/价格/套餐/点数/支付/结算开关。R0-J 已通过的部分（配额语义、JSON 不采信伪造值、原子竞争、新本地路径、正常附件保存、EACCES 失败呈现）保持冻结。

---

## 一、开工基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-J1-fix-snapshot/manifest.json`（真实时间 `2026-11-08T00:58:30+08:00`）+ `frozen-source/`（7 文件修改前完整副本 + SHA256）+ `after-hashes.json`（结束哈希） |
| 开始 → 结束 | storage-quota `898c6e17… → de7f954a…`；file-store `a3d07e2a… → f53ff936…`；handler `ee4b5ee7… → 4fc881ad…`；clear-data `e4b3b2de… → e4b3b2de…`（本批未改）；布局页 `9af127d8… → fc23f4e0…`；schema `21cf68e1… → 09167a47…`；r0j 测试 `477e5f04… → 0bbb3504…` |

## 二、J-UPLOAD：持久化操作身份与清理协议

**新增 `storageoperation` 模型**（schema 离线草案，迁移未执行，运行中不自动 DDL；结构未就绪时上传诚实拒绝 503）：

| 字段 | 用途 |
|---|---|
| opId（唯一约束） | 幂等键：同一操作重放不重复占用 |
| workspaceId / userId | 空间/操作者关联 |
| opType / status | RESERVE/RELEASE；RESERVED/CONFIRMED/RELEASED/PENDING_CLEANUP |
| filePath / bytes / documentId | 对象定位、实际字节、文档关联 |

**upload_doc 重排**：
1. **鉴权前置**：`checkWorkspaceAccess` 在文件保存/预留之前执行（404/403 零文件零预留）；
2. **原子预留**：条件 UPDATE 写边界（含 -1 分支，J-WRITE-BOUND）；成功后持久化 `storageoperation` 记录（opId + 空间 + 字节 + RESERVED 状态）；
3. **保存 → 确认**：`saveAssetFile` 成功后 `confirmStorageOperation(opId, filePath, null)` 回填对象定位；
4. **单次解析**：移除早期 `extractTextFromBufferWithTimeout` 调用，仅在鉴权/预留/保存后执行一次；
5. **doc.create 纳入清理协议**：create/确认失败 → 清理文件 + 释放预留；清理失败 → `markStorageOperationPendingCleanup` 持久化状态；
6. **未知保存结果**：`saved=null` 不释放容量 → `markStorageOperationPendingCleanup`（保留待核实占用）+ 500 `STORAGE_OP_PENDING` + opId；
7. **真实 0 字节文件**：`normalizedFileSize` 保留 0（不归一为 null 造成对账失真）。

upload_knowledge_attachment 同协议：父条目 workspaceId 一致性校验 + 原子预留 + saveAssetFile + doc.create 纳入 try。

## 三、J-RELEASE：释放与文档删除原子绑定

`deleteDocumentsAndReleaseStorage(workspaceId, docs)` 新增：
1. 事务内先条件删除文档行（count=0 → alreadyGone，不释放）；
2. 唯一对象键去重（同 filePath 多条引用不重复释放）；
3. 原子条件扣减（`storageUsed >= bytes` 才扣减）；
4. 漂移（used < bytes）→ **整体回滚**（文档/占用均不变），返回 drift=true 由调用方阻断/报告——**移除旧 drift SET 0 后备**。

所有彻底删除入口（remove_asset 私密、delete_removal_record、batch_delete_assets、batch_remove_assets 私密）统一使用此函数。

## 四、J-CLEAR：限定清理集合

clear-data 改为逐对象核验文件删除 → 仅对「确认已删除物理文件」的对象做原子释放 → **仅删除这些已核验对象的记录**（不再 `document.deleteMany({ where: { workspaceId } })` 全空间清除）。扫描后新上传的对象不在扫描集合中，记录和文件完整保留。删除失败的对象保留计量与可追踪信息。

## 五、J-PRIVATE：batch_delete_assets 私密归属

新增 `if (target.visibility === "PRIVATE" && target.uploaderId !== userId) { failed; continue; }`——空间所有者/管理员不得批量删除他人私密资料。跨空间文档继续拒绝。

## 六、J-KEYS：S3 与历史本地路径统一

- **S3 PUT/GET/DELETE 同键**：save 返回 `s3ObjectKey(key)` = `assets/{wsId}/{uuid}`，read/delete 使用同一 `s3ObjectKey` 归一（修复 PUT assets/w1/uuid 而 GET/DELETE w1/uuid 的分叉）；
- **本地历史候选**：`resolveObjectCandidates` 返回 `[归一键, assets/归一键]`——读取/删除按候选顺序探测（新位置 → 历史双 assets 位置）；候选均不存在才报 ENOENT（候选不存在不直接视为目标不存在）；
- 路径限制在存储根和空间内（`toObjectKey` 防目录穿越保留）；
- 不自动迁移/移动/清理历史文件。

## 七、J-WRITE-BOUND：-1 分支写边界核验

`-1` 不限分支从「读取后无条件 increment」改为**条件 UPDATE**：`SET storageUsed = storageUsed + bytes WHERE workspaceId = … AND storageLimit = -1`——限额收紧（-1 → 0/有限）后写边界不命中，重读按最新事实拒绝（LIMIT_ZERO 或 EXCEEDED）。保留 BigInt 和数据库级原子竞争。

## 八、J-PARTIAL：前端部分成功

两处批量回调（`handleBatchRemoveAssets`/`handleBatchDeleteAssets`）改为按实际成功/失败/跳过 ID 更新状态：
- 后端响应新增 `succeededIds`（实际成功 ID 列表）和 `failed`（失败/跳过明细）；
- 前端仅从列表移除 `succeededIds` 中的项（失败/跳过项保留可重试）；
- 部分成功时 toast.warning 包含失败/跳过数量与原因；不再假报全部成功。

## 九、J-RECONCILE：唯一对象计量 + 在途状态 + 未核实标注

`reconcileWorkspaceStorage` 重构：
- **唯一对象身份**：按规范化 filePath 去重求和（不按文档条数重复计算），报告 `duplicateRefs`（重复引用计数）和 `conflictingSizes`（冲突大小）；
- **操作状态纳入**：查询 `storageoperation` 表，报告在途预留（RESERVED）、待清理（PENDING_CLEANUP）、已确认（CONFIRMED）计数，与已确认占用分开统计；
- **物理核验**：可注入 `fileExists`（缺文件差异）和 `listObjects`（孤儿对象 + 大小差异）；未提供时 `coverage.physicalVerified = false` 且 notes 明确标注「未核实」；
- 对账零写、零删除、零自动释放。

## 十、验证结果

```text
npx vitest run --no-color src/app/api/__tests__/r0j-storage.test.ts
→ 1 file, 35 tests passed, exit 0（26 既有 + 9 新增 R0-J1 用例）

npx vitest run --no-color src/app/api/__tests__/r0j-storage.test.ts + 12 个定向文件（同 R0-J 清单）
→ 13 files, 442 tests passed, exit 0（433 既有 + 净增 9）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

页面脚本（UI 部分成功回调已改动，补跑确认）：
node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs → 3/3, exit 0
node docs/reviews/R0-I1-fix-snapshot/verify-admin-copy.cjs → 4/4, exit 0
node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs → 10/10, exit 0
```

## 十一、J 表逐项证据摘要

| 原缺陷 | 修复后验证 |
|---|---|
| doc.create 失败逃出清理 | doc.create 纳入 try：故障注入 → 500、无成功记录、预留释放、文件清理 ✅ |
| 保存未知结果释放 | saved=null 时 PENDING_CLEANUP 持久化 + 不释放 ✅ |
| 同 opId 重放 | storageoperation findUnique → dedup，不重复占用 ✅ |
| 解析两次 | 早期解析移除，单次解析在鉴权/容量准入后 ✅ |
| 同文件重复释放 | 事务内 doc delete + 条件扣减原子绑定；并发后到者 count=0 → alreadyGone ✅ |
| 释放漂移清零 | drift SET 0 后备移除；drift → 抛错回滚（文档+占用不变）✅ |
| clear-data 全空间 deleteMany | 逐对象核验 + 原子释放；新上传保留 ✅ |
| PRIVATE 批量绕过 | batch_delete_assets 加 PRIVATE 归属检查 → skip ✅ |
| S3 PUT/GET/DELETE 键不同 | 统一 s3ObjectKey；本地候选顺序 ✅ |
| -1 写边界 | 条件 UPDATE 含 storageLimit = -1 核验 ✅ |
| 前端 207 | 两处回调按 succeededIds/failed 更新 ✅ |
| 对账重复引用/未知/未核实 | 唯一对象去重 + operations 状态 + coverage 标注 ✅ |

## 十二、数据影响与未验证项

- 新增 `storageoperation` 表（schema 离线草案）：上线前需迁移 + 客户端重新生成；迁移未执行前存储写入诚实拒绝（503）。无真实数据操作。
- 未验证：真实 MySQL 事务/行锁、真实磁盘/云桶/S3 SDK、浏览器 DOM、clear-data 并发竞争的完整交错测试、refine-prompt/连接测试等 BYOK 入口、批量删除 UI 部分成功刷新（前端已改，需浏览器验证）。
- 资金/点数余额零改动。

## 十三、回滚说明

用 `docs/reviews/R0-J1-fix-snapshot/frozen-source/` 七个副本覆盖对应 src 文件、prisma/schema.prisma 移除 storageoperation 模型（离线草案，未执行迁移无需回滚 DB）、删除新增测试文件即回到 R0-J 结束状态。

**八项关闭，等独立审核；不进入 F14。**
