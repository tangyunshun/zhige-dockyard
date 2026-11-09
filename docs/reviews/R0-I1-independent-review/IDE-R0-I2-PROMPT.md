# 给 IDE 的 R0-I2 修复指令：只补默认报价的只读解析链路

## 任务目标与边界

你正在完成原 F12 / R0-I 的收尾，不是开始新一轮产品开发。先阅读：

1. `docs/PROJECT-DEVELOPMENT-CHARTER.md`。
2. `docs/reviews/R0-I-independent-review/IDE-R0-I1-PROMPT.md`，特别是 J03。
3. `docs/reviews/R0-I1-independent-review/REVIEW.md` 和本目录五个 `cold-*-verification.json`。

本轮唯一问题：**GET `/api/billing/estimate` 在省略 deploymentId、auto 或个人默认命中 BYOK 时，冷启动仍尝试 ALTER TABLE。** 显式 BYOK 已只读；月度额度顺序、管理员暂停说明已通过，不要重新开发这两项，也不要进入 F13。

用户可见目标：无论用户直接选择模型还是沿用默认模型，获取报价都不会触发表结构或数据修改；命中 BYOK 时仍如实展示当前暂停状态，不产生可执行报价、扣费或模型调用。正常平台模型报价和既有权限校验继续有效。

## 已确认的断点

`src/app/api/billing/estimate/route.ts:115`
→ `resolveDefaultDeployment`
→ `src/lib/model-registry.ts:1133` 的 `tryResolveWorkspaceByoDefault`
→ `src/lib/workspace-byo-model.ts:232` 的无参数 `ensureByoShareWithMembersColumn()`。

显式分支已经有 `readOnlyResolution: true`。默认链路尚未接入，导致冷启动走 ALTER。不要只修改注释或报告，也不要把正式解析器整体 mock 掉后声称通过。

## 实现要求

1. 沿既有只读参数机制补齐默认解析调用链：报价 GET 的默认/auto 分支必须由服务端强制只读；`resolveDefaultDeployment` 接收并传递只读语义；`tryResolveWorkspaceByoDefault` 将其传递给 `ensureByoShareWithMembersColumn`。可增加最小可选参数，保持非报价调用方原有语义，不为本修复改造整个模型注册系统。
2. 只读模式必须使用现有 SELECT 探针或等效的严格只读校验；缺少必要列时明确拒绝，沿用 `503 / BYO_SHARE_COLUMN_NOT_READY`。不得自动 ALTER、补数据、迁移或吞掉该结构错误后改用另一个模型报价。
3. 参数由服务端决定，不允许客户端关闭只读。保留个人偏好优先级、空间默认选择、模型白名单、共享权限、私有归属、合同能力检查及既有可用性回退规则；不要靠跳过 BYOK、固定平台模型或跳过权限检查绕开问题。
4. 正常 BYOK 暂停报价仍返回 `blocked=true`、`canExecute=false`、`points=null`、`yuan=null`、`BYOK_BILLING_POLICY_UNCONFIRMED`。保留任务入口的暂停门禁，不恢复 Studio BYOK，不决定服务费率，不增加收费开关。
5. 不改变已通过的月度重置顺序、管理员保存说明、F11 成本准入和生产结算边界。不要顺手重构其他调用点、删除历史文件或清理工作区。

## 验收标准与必须提供的证据

### K01：默认与显式路径的真实冷启动只读证据

使用实际 GET + 实际默认/显式解析器 + 实际 BYO 辅助函数，数据库和密钥解密等 IO 只用内存夹具，至少逐一覆盖：

- 显式 BYOK；
- 不传 deploymentId，空间默认 BYOK；
- deploymentId=auto，空间默认 BYOK；
- 个人默认 BYOK，空间默认为平台模型（包括当前代码兼容的历史 `byo` 偏好值）。

每条均在独立文件/隔离模块上下文中冷启动，避免全局 `_byoShareColumnChecked` 被其他测试预热。不能仅在同一模块中按“显式 SELECT → 默认报价”的顺序测试。不要为测试向生产代码添加缓存重置接口。

记录原始 SQL 和所有 ORM 写方法，断言 DDL/DML 尝试为 0，并断言进入了实际只读解析过程和正确的暂停响应。既要观察返回值，也要观察副作用。

### K02：缺结构时诚实拒绝，其他边界保持

模拟 shareWithMembers 列缺失，显式路径及默认路径分别冷启动；默认至少覆盖省略参数、auto、个人默认三种入口，全部返回稳定的 503/错误码，零 DDL/DML，无模型调用、无扣费。只在测试夹具中制造缺列，不连接真实数据库。

保留未登录 401、无空间权限 403、正常平台模型报价，以及 BYOK 任务暂停等已通过行为；不能将正常默认平台模型也一律拒绝。

### K03：修正会漏报写 SQL 的测试断言

现有夹具 rawSql 形如 `EXEC ALTER TABLE ...`、`QUERY SELECT ...`，直接 `startsWith("ALTER")` 等不成立。按实际格式解析并断言，或直接对原始执行方法的调用及 SQL 作断言；所有使用到的 raw 执行/查询变体和普通 ORM 写均纳入记录。不要只修一个测试的文字描述。

增加最小的断言自检：给该断言/分类逻辑一条夹具记录 `EXEC ALTER TABLE ...`，必须识别为写尝试；真实 GET 的无写断言则要求写集合为空。若不新增分类函数，可用等效的受控失败演示证明写调用确实会使测试失败。禁止用执行真实 ALTER 的方式验证。

原独立审核目录的缺陷复现测试有三项故意期望写尝试为 1，是旧版本证据；不要把它们改为期望 0，也不要拿其“通过”表示修复通过。为新版本新增正向验收证据，保留旧证据原貌。

### K04：定向回归和类型检查

只运行明确的安全测试清单，不运行 `npm test` 或无过滤的 Vitest（仓库含真实数据库集成测试）。沿用本轮已通过的 11 个定向文件，再加本修复的隔离冷启动文件：

```powershell
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```

原基线为 396 项通过；按实际新增/拆分用例报告测试数量和原因，不强行凑数。提供新冷启动配置的明确 include 范围与命令，不能夹带旧缺陷复现测试冒充新验收。未改动的 UI 可引用同版本哈希匹配的旧证据；若有变动，补核受影响部分。

### K05：交付与停止条件

- 开始前记录本轮实际起点的源码哈希和快照；结束后记录实际版本哈希、最小改动清单及前后差异，不覆盖其他轮的报告/快照。
- 新交付放在 `docs/reviews/R0-I2-fix-report.md` 和独立的 `docs/reviews/R0-I2-fix-snapshot/`，包含 K01—K04 逐项结果、SQL/ORM 写记录、错误响应、命令退出码、测试数量、未验证项和实际数据/账务影响。
- 只修改与这条参数传递链及其回归测试直接相关的文件。若发现必须改变业务规则、权限、默认优先级、收费或数据库结构才能完成，停止该部分并说明，不自行扩大范围。
- 完成本轮后停止，等待独立审核；不得自行进入 F13 或启动其他开发批次。

## 数据、费用和操作禁区

只允许离线夹具和本地定向验证。不得读取真实密钥或 .env，不得连接或写入真实数据库，不得运行迁移/seed、真实模型或连通性测试、支付/退款/充值、短信/邮件、部署和清理操作。不得改变生产结算开关、算力点汇率、BYOK 服务费口径或恢复 BYOK 任务。报告必须区分源码完成、夹具验证与生产业务验收。
