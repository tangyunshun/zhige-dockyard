# R0-G 修复报告：原方案 F10 订阅到期调度入口与资产止损

**状态：R0-G 待独立复核**（不进入下一批、不部署）

只修审核确认的三个缺陷：① CRON_SECRET 缺失时放行（含 production）；② 回收开关 true 时直接 tokenBalance=0；③ 扫描后按 id 无条件降级（续费被覆盖）。R0-A/B/C/D/E 及 R0-F/F1/F2 全部冻结，未重新触碰维护审计。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-G-fix-snapshot/manifest.json` + `frozen-source/`（route 修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T14:06:34+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | route `e514c43a…` |
| 结束 SHA256 | route `f8d44f6b…`；新增测试 `3c289438…`（`after-hashes.json`） |

**修改差量**：仅 `route.ts` 重写（87→约 160 行）+ 新增隔离测试文件。其他 cron、middleware、支付、席位、定价零改动；未覆盖他人未提交修改；历史报告/测试/快照/scratch 保留（含本批调试用的 scratch 临时文件已清理）。

## 二、凭证契约（J01/J02）

| 场景 | 结果 |
|---|---|
| CRON_SECRET 缺失 / 空串 / 纯空白（production、development、test 三环境） | **503 `CRON_SECRET_NOT_CONFIGURED`**，在任何数据库查询/事务/业务调用之前拒绝（测试断言 IO 调用日志为空） |
| 已配置：x-cron-key 缺失 / 空白 / 错误 / 空串 | **401 `CRON_KEY_INVALID`**，零 IO |
| 普通登录 token（authorization 头） | 不能替代专用凭证 → 401 |
| 查询参数 `?key=<secret>` | 不构成旁路 → 401（无 GET 导出，路由仅 POST） |
| 正确专用凭证（精确匹配） | 200 进入候选处理 |
| 错误响应/成功响应 | 均不含密钥值（测试断言序列化响应不含 secret）；无开发默认口令 |

## 三、资产保持（J04）

- **`tokenBalance=0` 写路径整体移除**：任何环境、`RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY` 取缺失/false/true/TRUE/1 均不清零余额；quota 条件写入只改 `enterpriseSlots/updatedAt`。
- 来源资产哨兵（grant remaining=850、ledger 条目）全程不变；测试断言路由 IO 日志中从未出现 pointgrant/pointledger 等模型（封闭 stub 下任何未授权模型调用直接抛错）。
- `reclaimedPoints` 恒 `false`；旧开关为 true 时响应含 `reclaimPaused: true` 与中文说明「到期点数回收已暂停…套餐/席位处理正常执行」。
- 完整到期回收引擎（来源账务闭环）按指令列为未授权依赖，未实现；无新造流水/钱包入账/点转个人。

## 四、到期写边界保护（J05）与正常业务（J03）

- 扫描仅用于筛选；实际降级在事务写边界用**条件 updateMany**：`{ id, plan: 候选套餐, planExpiresAt: 候选期限 }`——续费（期限变化）、换套餐、期限变化任一发生即 count=0 → 整体回滚跳过，不更新 quota、不计入成功。
- quota 写入前事务内核验 `workspacequotaId` 绑定未变，且 quota 条件含 `{ id, workspaceId }`——换绑/重建后不写旧/错 quota。
- 套餐写与 quota 席位回落**同一事务**；任一步/提交失败全回滚。
- **临界语义（显式声明并测试）**：`planExpiresAt < now`（执行时刻，严格小于）即到期；恰好等于执行时刻不算；无期限（null）与 STANDARD 不参与降级，无期限不猜成到期。
- 响应 `downgraded/affected` 只统计实际成功；`skipped` 单独如实计数；并发两个调度命中同一候选 → 恰好一次降级；成功后重复请求 → 0 候选。
- STANDARD 席位来自现有 `workspaceplan.STANDARD.maxMembers`（测试夹具=2），未改任何价格/套餐配置。

## 五、J01—J08 逐项证据（新增 35 用例，全部真实 route + 内存持久化）

| 项 | 用例与结果 |
|---|---|
| J01 | 3 环境 × 3 种坏配置 = 9 用例全 503、IO 日志为空、状态不变 ✅ |
| J02 | 4 种坏 key + 登录 token + 查询参数旁路 + 密钥不回显 + 正确 key 200 ✅ |
| J03 | 到期/未到期/无期限/STANDARD 四类分类 + 临界 1ms 用例；downgraded 只计实际成功 ✅ |
| J04 | 回收开关 5 种取值参数化：tokenBalance=850 保持、哨兵不变、reclaimedPoints=false、true 时 reclaimPaused ✅ |
| J05 | 续费/换套餐/换绑（扫描后写边界前受控钩子注入）→ skipped=1 且新事实保留；并发恰好一次；重复请求零候选 ✅ |
| J06 | 套餐写失败 / quota 写失败 / 提交失败（回调完成后）→ 500 全回滚无半降级；TX 写序列 + 零 ROOT 写逃逸（封闭 stub）✅ |
| J07 | 无 GET 导出；POST 契约字段 success/checkedAt/downgraded/affected 保持；既有席位下单/履约到期拒绝由 r0b 套件回归保持 ✅ |
| J08 | 见下节命令 ✅ |

**测试夹具能力**（满足"不能固定返回成功"）：ROOT/TX 区分、事务进行中根客户端写直接抛错、updateMany 条件精确求值（含 Date 相等/lt/not 操作符，未实现操作符显式失败）、undo 日志真回滚、提交阶段故障注入、扫描后写边界前受控变更钩子（消费式队列）、来源资产哨兵、未授权模型调用直接抛错。内存模型不证明 MySQL 行锁/隔离级别。

## 六、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
→ 1 file, 35 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
→ 10 files, 351 tests passed, exit 0（316 既有 + 35 新增）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-F2-independent-review/verify-next-cron.cjs
→ exit 1（预期）：其第一场景断言"production 缺失 secret 匿名调用返回 200 并降级"（旧缺陷形态），
   修复后实际返回 503，冻结反例不再成立。该脚本与 next-cron-verification.json 零改动。
```

均定向隔离运行、本地工具、合成环境值；零真实库读写/降级/配置/会话操作、零迁移/seed/清理/补账/退款、零真实支付/模型/短信邮件/费用/部署；未读取或打印任何真实密钥；未全量测试。代码实现不等于授权运行真实定时任务。

## 七、未验证项 / 边界

- 真实 MySQL 条件更新/行锁/隔离级别并发语义（内存为串行化模拟）；生产 CRON_SECRET 轮转与部署配置；浏览器/运维验收。
- **其他 cron（model-disable-sweep / point-ledger-cleanup / recharge-order-cleanup / token-settlement-* 等）存在同类旧鉴权样式**（未配置即放行），按指令未在本批顺手重构，列为后续批次候选。
- 请求侧到期权益的其他读点（非席位下单/履约路径）未逐一核验，不宣称全站实时套餐权益体系完成。
- 本批是 F10 订阅到期调度止损；到期点数完整回收引擎、历史错账调查需另行授权。

## 八、回滚说明

用 `docs/reviews/R0-G-fix-snapshot/frozen-source/` 副本覆盖 route 即回到 R0-F2 冻结状态；删除新增测试文件即可；无 schema/DDL/环境变量结构依赖（新增依赖的 CRON_SECRET 本就是既有配置项，本批仅改变其缺失时的行为）。

**J01—J08 通过即停止交回；不自行继续下一批。**
