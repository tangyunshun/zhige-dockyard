# R0-I1 独立审核报告

审核日期：2026-11-07。范围：R0-I1 对上轮三个问题的修复；仅审核，不修业务代码。

## 结论和范围

**R0-I1 未完全通过。上轮三个问题已关闭两个，剩余一个：J03 默认模型报价链路仍可能尝试 ALTER TABLE。** 本轮只要求 R0-I2 补齐这条只读传递链路，不进入 F13，不增加产品功能，不重新决定 BYOK 定价或恢复调用。

依据：项目开发总纲、原重构方案、`docs/reviews/R0-I-independent-review/IDE-R0-I1-PROMPT.md` 的 J01—J06，以及当前源码和本目录独立验证证据。执行方报告只用于核对交付范围，不作为独立验收结论。

| 上轮问题 | 本轮结论 | 依据 |
| --- | --- | --- |
| I-MONTH-ORDER：跨月成员额度先检查后重置 | 关闭 | 实际 handler + 实际 quota-cycle、内存数据库夹具；过期额度先重置再检查，当期耗尽仍拒绝 |
| I-GET-DDL：GET 报价触发改表 | 部分修复，继续阻断验收 | 显式 BYOK 已只读；省略 deploymentId、auto、个人默认 BYOK 的独立冷启动仍各尝试一次 ALTER |
| I-ADMIN-COPY：管理员收费说明矛盾 | 关闭 | 实际组件 JSX 与确认回调；保存成功/失败均符合仅保存配置、任务仍暂停的口径 |

已通过的月度额度、管理员说明，以及原 F11 等已验收范围保持冻结；本结论不代表整个系统生产验收完成。

## 唯一未关闭问题：I-GET-DDL-DEFAULT（P1）

### 代码事实与影响

1. `src/app/api/billing/estimate/route.ts:114—121`：显式 deploymentId 分支传入 `readOnlyResolution: true`；省略参数或 `auto` 分支调用 `resolveDefaultDeployment` 时未传递只读约束。
2. `src/lib/model-registry.ts:1133`：默认模型命中 BYOK 后，调用 `tryResolveWorkspaceByoDefault`，没有只读参数。
3. `src/lib/workspace-byo-model.ts:232`：该辅助函数无参数调用 `ensureByoShareWithMembersColumn()`。冷启动下进入同文件 138 行的 `$executeRawUnsafe("ALTER TABLE ...")`，而不是 124 行的只读 SELECT 探针。

因此，同一个报价接口仅因用户使用默认模型，就可能在返回“BYOK 暂停”之前尝试改表。缺少表结构时，用户读请求仍可能承担自动补表职责，违背上一轮 J03 的明确要求。实际是否成功改表取决于数据库结构和权限；**本次没有连接真实数据库，不能声称生产数据库已被修改或发生锁表。**

### 独立冷启动结果

每条路径使用独立、隔离的 Vitest 测试文件；调用实际 GET、实际 model-registry 和实际 BYO 辅助函数，仅数据库/密钥解密等 IO 使用夹具，避免模块级 `_byoShareColumnChecked` 被其他用例预热后掩盖问题。

| 请求路径/条件 | HTTP 与业务结果 | 原始 SQL 记录 | 写操作尝试 |
| --- | --- | --- | --- |
| 显式 `deploymentId=byo:w1` | 200，暂停，无可执行报价 | `QUERY SELECT shareWithMembers ...` | 0 |
| 显式 BYOK，探针模拟缺列 | 503，`BYO_SHARE_COLUMN_NOT_READY` | SELECT 探针 | 0 |
| 省略 deploymentId，空间默认 BYOK | 200，暂停 | `EXEC ALTER TABLE ...` | **1** |
| `deploymentId=auto`，空间默认 BYOK | 200，暂停 | `EXEC ALTER TABLE ...` | **1** |
| 个人默认 BYOK，空间默认平台模型 | 200，暂停 | `EXEC ALTER TABLE ...` | **1** |

对应证据：本目录 `cold-*-verification.json`，其中三条默认路径证据的 `rawWriteAttempts` 为 1，常规 ORM 写记录为空。8 项独立测试中的这三项是“确认现存缺陷可复现”的断言，测试通过不能解释为业务验收通过。

### 现有测试为何未挡住

R0-I1 新增真实只读解析测试主要覆盖显式模型分支，未覆盖上述三条默认冷启动路径。此外，正式测试 `r0h-cost-admission.test.ts:1068、1083` 用 `startsWith("ALTER")` 等断言判断写 SQL，但夹具实际记录形如 `EXEC ALTER ...`（QUERY 同样带前缀）。这些断言不能可靠排除实际写调用。此测试缺口属于同一个 J03 修复，不另立新业务需求。

## 已关闭项的证据

月度额度：独立对照 R0-I 快照与当前 handler，同样的过期满额成员，旧版本返回 400 且没有触发周期检查，当前版本先执行真实周期维护再继续，返回 200。缺失重置日期会初始化；未过期满额仍 400；未过期剩余额度不会清零。消费与执行使用 IO 替身，不能据此声称真实入账完成。详见 `handler-verification.json`。

BYOK 暂停：显式、默认以及最终解析切换至 BYOK 的任务均返回 409 / `BYOK_BILLING_POLICY_UNCONFIRMED`；周期维护、额度查询、消费、冻结和模型执行均未发生。夹具观察到的访问/操作日志不是扣费记录，因此不将“暂停”描述为整个请求完全零写。

管理员说明：实际组件卡片、确认框、警告和成功提示均说明“仅保存配置、Studio 自带模型任务仍暂停”；失败分支只展示错误。独立验证 2 条流程，以及 IDE 原脚本 4/4 通过。此处为 JSX/回调验证，不是浏览器 DOM 验收，也未实际保存管理员配置。详见 `admin-verification.json`。

## 验证与版本

- 11 个明确列出的 R0 定向正式测试文件：396/396 通过；没有运行全量测试。
- 本目录独立测试：6 文件、8 测试通过；其中 3 项为当前缺陷复现。
- `tsc --noEmit --incremental false -p tsconfig.json`：退出码 0。
- 独立管理员回调验证：2/2；原管理员脚本：4/4；原 Studio 暂停页面脚本：3/3。
- 开工快照 6 份、当前交付文件哈希 6 份已核对；22 个保护文件与上一轮基线一致。详见 `manifest-verification.json`。结束时再次核验，详见 `validation-results.json`。

运行命令和测试清单记录在 `validation-results.json`。审核只新增本目录证据/报告；没有修改正式源码和正式测试，没有读取真实密钥、连接真实数据库、调用真实模型、付款、迁移、部署或执行清理。

本轮没有验证真实 MySQL DDL 行为、浏览器端完整交互和生产账务，也不保证整体盈利或生产可用。修复后的验收必须重新覆盖当前缺陷路径，不能复用本轮的失败状态作为通过证据。

下一关口：按本目录 `IDE-R0-I2-PROMPT.md` 完成唯一剩余 J03 修复，再做独立审核；通过后才判断是否进入原方案 F13。
