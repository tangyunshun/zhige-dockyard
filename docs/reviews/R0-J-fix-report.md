# R0-J 修复报告：原方案 F13 —— 存储配额止损闭环

**状态：R0-J 待独立复核**（不进入 F14、不部署）

只实施原 F13 存储配额止损闭环：统一字节/配额语义、数据库级原子占用、两条上传链路闭合、文件路径契约修复、删除只释放一次、clear-data 旁路修复、最小只读对账。BYOK/价格/套餐额度/点数/支付/生产结算开关零改动；R0-A—I2 全部保持冻结。

---

## 一、开工基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-J-fix-snapshot/`（manifest.json 含真实采集时间 `2026-11-07T23:26:04+08:00` + frozen-source/ 四个修改前完整副本 + after-hashes.json 结束哈希） |
| 开始 → 结束 SHA256 | storage-quota `40c67567… → 898c6e17…`；file-store `644844f3… → a3d07e2a…`；handler `80fe3162… → ee4b5ee7…`；clear-data `98cdf678… → e4b3b2de…`；新增测试 `477e5f04…` |

**修改差量**：storage-quota.ts 重写；file-store.ts 修复路径契约与删除结果；handler.ts 四个删除/上传入口接线；clear-data 文件/计量段；新增测试。其他入口（软移除公开资料/restore/delete_knowledge 软删除/知识软删除恢复规则）仅回归，未改审核治理规则。BYOK/点数/支付/结算开关零触碰。

## 二、S01：统一字节与配额语义

新 `storage-quota.ts`（唯一裁决真源）：

| 情形 | 行为（稳定 code） |
|---|---|
| 配额行缺失 | 拒绝 503 `STORAGE_QUOTA_NOT_READY`（不默认无限） |
| `limit = 0` | 正字节拒绝 403 `STORAGE_LIMIT_ZERO`（0 不允许新增正字节文件）；0 字节仅过身份/配置检查 |
| `limit < -1` | 拒绝 503 `STORAGE_LIMIT_INVALID` |
| `usage < 0` | 拒绝 503 `STORAGE_USAGE_INVALID` |
| `limit = -1` | **唯一不限语义**（服务端既有事实）；仍如实记录真实占用（不跳过记账） |
| bytes 非法（小数/NaN/负数/非安全整数） | 400 `STORAGE_BYTES_INVALID` |
| 超限 | 403 `STORAGE_QUOTA_EXCEEDED`（含当前占用/上限/本次字节与整理或联系管理员指引，不虚构购买入口） |

- 判定与增减全程 **BigInt**（`9007199254740993/…994 + 2` 超限拒绝——Number 精度绕过已堵）。
- JSON 文本兼容路径没有物理文件 → `fileSize` 恒为 null，**不采信客户端伪造 fileSize**、不按字符数假装物理大小；0 字节不扩大占用但仍过身份/空间/配置检查。
- 实际字节来自服务端收到的 buffer（`buffer.length`），绝不使用客户端声明。

## 三、S02：原子占用

`reserveStorageBytes(workspaceId, bytes, opId)`：**单条条件 UPDATE 同时完成「上限核验 + 预留」**（`SET storageUsed = storageUsed + bytes WHERE workspaceId = … AND storageUsed + bytes <= storageLimit`，`$executeRaw` 标签模板防注入）——不依赖进程内锁/内存 Map/先查后加。count=0 时重读分类为超限拒绝。`-1` 空间走无条件入账但仍记录真实占用。`opId`（UUID）为操作身份，失败时随响应返回供对账/恢复关联（workspace、操作者、组件、字节、状态关联复用现有 document.filePath/fileSize/metadata，无新增表）。

**并发证据（可控屏障 + 真实条件求值）**：限额 100、两笔各 60 并发 → 恰一笔 `fulfilled`、另一笔 `rejected`、最终占用 60（不是 120）；并发删除 30+40 → 剩 30（无读旧值回写失真）。跨空间（w1/w2）互不影响。

## 四、S03：两条上传链路闭合

| 环节 | upload_doc（multipart） | upload_knowledge_attachment |
|---|---|---|
| 鉴权/归属前置 | ✅ 移到文件保存/预留**之前**（404/403 零文件零预留） | ✅ 保留创建人/管理员权限；**父条目 workspaceId 必须等于记账空间（403）** |
| 配额 | ✅ 原子预留（落盘前） | ✅ 同一协议（reserveStorageBytes） |
| 保存 | ✅ saveAssetFile（归一路径） | ✅ 改用 saveAssetFile（替换原直接 fs.writeFile 分叉） |
| 记录确认 | ✅ document.create | ✅ document.create |
| 失败清理 | ✅ 删除文件 + 释放预留；删除失败 → 500 STORAGE_CLEANUP_PENDING + storageOpId 保留恢复信息 | ✅ 同左 |
| JSON 文本 | ✅ fileSize 恒 null，不采信伪造值 | —（无文本分支） |
| 解析失败 | ✅ 文件删除 + 预留释放 + 无假成功 | — |

401/403/缺必填参数：无落存储/无预留/无成功记录（测试断言）。

## 五、S04：文件路径与删除结果

- **根因修复**：本地保存原来把 key（`assets/{wsId}/…`）再拼进 `UPLOAD_ROOT`（= uploads/assets）导致保存至 `uploads/assets/assets/{wsId}/`，而读取/删除剥前缀后定位 `uploads/assets/{wsId}/`。现保存与读/删统一经 `toObjectKey` 归一——保存返回的 filePath 被 read/delete 定位到**同一对象**（测试证明）。
- 附件改用 saveAssetFile 统一保存规则（原直接写盘分叉已删）。
- `deleteAssetFile` 返回 `{ok, notExists, error}`：仅 ENOENT 视为确认不存在（幂等成功）；EACCES/磁盘/云错误如实返回 `{ok:false}`，调用方不得伪装成功（上层已接线）。
- 保留本地与 S3 驱动接口；不切驱动、不读密钥、不访问真实桶（S3 契约仅本地路径一致性验证，真实网络访问未验证——如实列明）。
- 历史路径兼容：`toObjectKey` 仍剥 `uploads/`/`assets/` 前缀；不自动迁移/移动/删除历史文件；未知存量对象由对账标注待核实。

## 六、S05：删除只释放一次与旁路

| 入口 | 行为 |
|---|---|
| remove_asset 私密硬删除 | **文件先删并核验结果** → 失败返回 500 `ASSET_FILE_DELETE_FAILED` 且记录/占用保留（可重试依据）；成功 → 原子释放 + 删除记录 |
| delete_removal_record | 同上；彻底删除释放一次；重复请求记录已清 → 404，占用保持（不重复扣减） |
| batch_remove_assets 私密分支 | 文件先删核验；失败计入 `failed` 数组如实报告（响应 207 + failedCount），不静默跳过 |
| batch_delete_assets | **新增治理权限门禁**（仅空间管理员/所有者）；逐个文件核验删除 → 原子释放 → 删记录；部分失败响应 207 + failed 明细（不再直接 deleteMany 绕过） |
| clear-data | 逐对象删除文件并核验 → 仅对「确认已删除物理文件」的对象做原子条件扣减；删除失败的对象保留计量；**不无条件 storageUsed=0** |
| 软删除/公开软移除/知识软删除 | 继续占用（不释放）；restore 恢复不重复增加（回归证明） |
| 纯文本/无物理文件 | 不因客户端历史 fileSize 释放不存在的容量（releaseStorageForDeletedDocuments 只统计有 filePath 且字节为正的记录） |

物理删除失败不先删除唯一可追踪记录（remove_asset/删除单两处旧「先删记录再删文件」顺序已反转）；批量部分失败响应 207 + failed 明细。

## 七、S06：只读对账

`reconcileWorkspaceStorage(workspaceId, opts?)`（纯读取）：
- 比较配额快照（used/limit/kind，含 missing/invalid 分类）、按唯一对象的文档记录（总数/有物理文件/字节求和/软删除仍占用/大小未知差异清单）与 usageDrift（配额占用 vs 记录求和 diff）；
- 可选 `fileExists` 注入标注缺文件差异；未注入时物理对象/驱动来源标为**待核实**（不用默认 0 掩盖）；
- 对账零写（测试断言写调用计数不变）；不修库、不删文件、不自动清零或释放未知预留；
- 运行方式：可在运维窗口对目标空间调用并输出报告（本批未创建调度任务/定时器）。

## 八、S07：验证结果

```text
npx vitest run --no-color src/app/api/__tests__/r0j-storage.test.ts
→ 1 file, 26 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0j-storage.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts
  src/app/api/__tests__/r0i2-cold-quote.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
  src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts
  src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts
  src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts
  src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts
  src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 13 files, 433 tests passed, exit 0（396 基线 + 37：净增 26 + 重组调整 11，无旧断言削弱——R0-I 报告原样保留）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

页面脚本（上传/删除 UI 本批未改动，引用同版本哈希旧证据重跑确认）：
node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs → 3/3, exit 0
node docs/reviews/R0-I1-fix-snapshot/verify-admin-copy.cjs → 4/4, exit 0
node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs → 10/10, exit 0

R0-J-preflight/capture-facts.cjs（冻结的旧缺陷记录工具，仅重放历史事实 JSON，非新验收）→ exit 0
```

**S07 场景覆盖矩阵**（26 用例，全部真实 handler/函数 + 内存 Prisma/fs，仅外部 IO 替换）：

| 场景 | 结果 |
|---|---|
| 配额缺失/0/非法负数/负用量 | 存储副作用前拒绝，无文件/无记录/无错误占用 ✅ |
| -1 不限（记账）/正常额度/恰好边界/BigInt 边界 | 允许拒绝正确、BigInt 无精度绕过 ✅ |
| 同空间 60+60 并发 / 100 并发删 30+40 | 至多一笔预留（60）/剩 30 ✅ |
| 不同空间互不影响 | ✅ |
| upload_doc multipart + upload_knowledge_attachment | 均原子预留、对象可读、记录/占用一致 ✅ |
| JSON 文本伪造 fileSize | fileSize=null、零占用 ✅ |
| 401/403、父条目跨空间、缺必填 | 404/403 无文件/预留/记录 ✅ |
| 解析失败 | 文件删除 + 预留释放 + 无假成功 ✅ |
| remove_asset 删除成功 / 物理失败 | 释放一次（100→70）/ 500 记录保留占用保留 ✅ |
| delete_removal_record 首删 + 重复 | 释放一次；重复 404 占用保持 ✅ |
| batch_delete_assets 治理权限 + 全成功 / 非治理 403 | ✅ |
| batch_remove_assets 私密物理失败 | 207 + failed 明细 ✅（软删除继续占用 / restore 不重复计量亦覆盖） |
| clear-data（隐含在实现中；逐对象条件扣减） | 实现接线完成；专项并发用例见下方未验证说明 |
| file-store save/read/delete 一致 + 幂等删除 | ✅ |
| 只读对账 正常/差异/零写 | ✅ |

**如实说明**：① clear-data 与并发上传竞争的专项夹具用例未单独成条（实现已按「逐对象条件扣减 + 失败保留计量」接线，并保持了外层权限/确认文本门禁），冷启动并发竞争由 S02 原子扣减语义覆盖；② 内存并发屏障模拟真实 DB 串行化，不证明 MySQL 行锁/隔离级别；③ S3 驱动仅验证本地路径一致性契约，未发起真实网络/桶访问；④ 浏览器 DOM 未验证（UI 未改动，引用同版本哈希旧页面证据）。

## 九、数据影响与未完成项

- 预期上线后 document.fileSize/filePath 与 workspacequota.storageUsed 的字节计量更严格：JSON 文本不再按伪造值入账；缺配额/非法配额的空间上传被拒绝（运维需保证 workspacequota 行存在且 limit 配置有效）。
- 资金/点数余额零改动；无新增表（操作身份 opId 复用响应字段与 document 记录关联）；无需迁移。
- 历史漂移（used < 记录字节和、大小未知记录）由只读对账呈现，本批不做自动修复/清理——需要历史数据修复时另行授权。
- 未完成/未验证：真实数据库并发（MySQL 行锁）、真实磁盘/云桶访问、浏览器 DOM、批量删除 UI 部分成功刷新（前端本批未改，响应已含 failed 明细）、定期对账的运行接线（说明已写，未建调度）。

## 十、回滚说明

用 `docs/reviews/R0-J-fix-snapshot/frozen-source/` 四个副本（storage-quota.ts / file-store.ts / handler.ts / clear-data/route.ts）覆盖对应 src 文件、删除新增测试文件即回到开工状态；无 schema/DDL/环境变量依赖。所有副本与起止哈希见 manifest.json / after-hashes.json。

**S01—S08 完成，等待独立审核；不进入 F14，不宣称生产可用或盈利保证。**
