# R0-A5 修复报告

**状态：R0-A5 待独立复核**（不部署、不进入下一批）

本批只修 `docs/reviews/R0-A4-independent-review/IDE-R0-A5-PROMPT.md` 的 E1—E5，不扩范围。

---

## 〇、修改前快照与最小差量

- 快照：本批未保存独立快照文件（与前批一致）。回滚依据 = git diff 中下列本批文件的差量 + 本报告修改清单手动操作。本批不把累计 git diff 冒充本批精确补丁，也不冒称先前批次快照。
- 本批修改文件（最小差量）：

| 文件 | 变更 |
|---|---|
| `src/lib/workspace-upgrade-service.ts` | E1 核验字段扩展、E2 私有写函数拆分 + provision 前置核验、E3 全来源 delete 拒绝 |
| `src/app/api/workspace/upgrade/route.ts` | E2 稳定错误码 + 中文 message 映射（11 个服务层错误码） |
| `src/lib/upgrade-response-protocol.ts` | E5 新增：三入口共用的响应协议判定（实际生产模块） |
| `src/app/workspace/upgrade/page.tsx` | E5 接入协议模块（修正 success 先于 payUrl 的判定顺序）+ 迁移卡片诚实禁用 |
| `src/components/studio/UpgradeModal.tsx` | E5 接入协议模块 |
| `src/components/workspace-hub/modals/UpgradeModal.tsx` | E5 接入协议模块 + 迁移卡片初始即显示「暂不可用」 |
| `src/app/api/__tests__/r0a4-combo-regression.test.ts` | E4 fixture 修复 + E1/E2/E3/E5 新用例（17→43 用例） |
| `docs/reviews/R0-A5-fix-report.md` | 本报告 |

未改动：历史报告、审核脚本、verification.json；未 reset/clean/整文件 restore；未删除既有测试用例（D1/D2 组全部保留）。

---

## 一、E1：一致性核验覆盖全部实际写入事实

### 写入事实盘点（先列字段及去向，再定比较范围）

`targetConfig` 在开通链路中被实际写入的位置：

| 字段 | 去向 |
|---|---|
| `key` | `workspace.plan`、操作日志/账单 metadata |
| `name` | 账单标题（billingrecord.title） |
| `priceMonthly` / `priceYearly` | 账单 amount（cycleAmount） |
| `purchasable` | 自助购买资格门禁 |
| `maxComponents` / `maxMembers` / `maxStorage` / `maxApiCalls` | `workspace.quota`（四项 + features）与 `workspacequota`（storageLimit/apiCallsLimit/enterpriseSlots） |
| `features` | `workspace.quota.features` |
| `trialGift.enabled/points/expireDays` | `grantNewSpaceTrialQuota` overrides（差异化赠送） |

未写入本链路、因此**不纳入**比较（避免把无关字段当账务版本）：`sortOrder`、`description`、`poolLowThreshold`、`maxConcurrency`、`maxSingleFileBytes`、`maxModelAllocations`、`maxByoModels`、`tokenLimit`。未引入报价有效期/赠送政策/版本号框架。

### 实际修改

新增私有函数 `verifyPlanSnapshotConsistency(targetPlanKey, snap)`（workspace-upgrade-service.ts）：重新严格读取当前配置，比较上表全部事实——`key/name/priceMonthly/priceYearly/purchasable/maxComponents/maxMembers/maxStorage/maxApiCalls` 逐值比较，`features` 按排序集合比较（顺序无关），`trialGift` 三元组合并成 `enabled:points:expireDays` 规范串比较（DB NULL 时按 `0:0:0`）。任一变化 → `PLAN_CONFIG_CHANGED`，零写入；停用/缺失/价格非法/读取异常 → 透传 `PLAN_INACTIVE / TARGET_PLAN_NOT_FOUND / PLAN_NOT_PURCHASABLE_ONLINE / PLAN_PRICE_INVALID / PLAN_CONFIG_UNAVAILABLE`。

`upgradePersonalToEnterprise` 原内联比较（仅 4 字段）替换为该函数。通过核验后**继续使用同一配置**写入（curr 与快照逐字段一致），不存在"比较少数字段后换成未确认 curr 资源"。快照来自 route 层 `getWorkspacePlanStrict` 产物，客户端传参不作为信任凭据。

### 验证证据

E1 组 11 用例：分别改变席位(99)/存储(900MB)/组件/调用额度/features 增项/赠送开关/赠送点数(777)/赠送期限/套餐名 → 全部 `PLAN_CONFIG_CHANGED`，断言零空间写、零配额写（wsqWrites=0）、零账单、零赠送调用；对照组 2 用例（features 仅顺序变化、赠送三元组全同）不误拦、正常开通。

---

## 二、E2：最终核验前置到 retain 任何业务写入之前

### 实际修改（调用顺序重构，不是原地补判断）

1. **私有写函数拆分**：`upgradePersonalToEnterprise` 的事务写入段拆出为私有 `applyEnterpriseUpgrade(args, workspace, targetConfig)`——只做写入（套餐/配额/模型策略/操作日志/账单原子事务 + 差异化赠送），不做配置核验。公开入口 `upgradePersonalToEnterprise` 仍完整核验（delete 守卫 → 幂等 → 快照核验或 resolveTargetConfig → purchasable 门禁 → 写入），调用关系清楚。
2. **provision 前置核验**：`provisionEnterpriseUpgrade` 在读取空间/属主校验之后、**任何分支第一次业务写入之前**执行 `verifyPlanSnapshotConsistency`；核验失败直接抛错——不建空间、不建成员、无配额/账单/赠送/迁移/支付。
3. **同配置贯穿**：核验通过的配置以参数传入 `applyEnterpriseUpgrade`，retain/upgrade 分支不再经深层 `upgradePersonalToEnterprise` 二次读取核验，消除"更深层另一次读取又造成先写后拒绝"的窗口。
4. 管理员/线下授予（无快照）沿用既有宽松解析职责（仍走 `upgradePersonalToEnterprise` 写边界解析），未引入公网可选的 skipValidation/trusted/paid 开关。
5. **route 稳定错误码**：POST catch 增加 11 个服务层错误码映射，`PLAN_CONFIG_CHANGED`→409「套餐配置已更新，请刷新页面后重新确认升级内容」、`PLAN_INACTIVE`→400、`PLAN_CONFIG_UNAVAILABLE`→503 等，均带中文 message；不再一律 500「创建升级订单失败」塞机器码（未知错误仍 500 兜底）。

### 验证证据

E2 组 5 用例：
- retain 变价/停用 → 拒绝，`workspace.create=0`、`workspacemember.create=0`、`workspace.deleteMany=0`（**没有 create 再 cleanupOrphan**）、wsqWrites=0、零账单、零赠送；
- upgrade 变价 → 拒绝且 `workspace.update=0`（连改名都不发生）；
- retain 配置一致 → 正常创建企业空间（不误拦）；
- **route+服务真实组合**：用 `planMutateOnRead` 在第 2 次 workspaceplan 读取（provision 核验）时变价，真实 `POST` 返回 409 + `PLAN_CONFIG_CHANGED` + 中文 message，且 retain 零 create、零 deleteMany。

已知边界（如实声明）：核验失败时内存模型证明零写入；内存 Prisma 代理不证明 MySQL 回滚与并发隔离级别，"应用层快照比较"不等于数据库并发已验证。正常开通过程中非校验故障的孤儿空间补偿（cleanupOrphan）保留，未扩成分布式事务。

---

## 三、E3：delete 迁移不分来源统一拒绝

### 实际修改与调用方核对

| 入口 | 守卫 |
|---|---|
| route POST | `option==="delete"` → 400（前批已有，保留） |
| `provisionEnterpriseUpgrade` 入口 | **本批修改**：去掉 `source === "SELF_SERVICE_PURCHASE"` 条件，所有来源（含 `ADMIN_MANUAL`/`SALES_SIGNUP`/省略 source 的默认来源）在任何业务写入前抛 `MIGRATION_OPTION_UNAVAILABLE` |
| `upgradePersonalToEnterprise` 入口 | 不分来源拒绝（前批已有，保留） |
| `fulfillEnterpriseUpgradeFromOrder` | 历史待支付订单 `meta.option==="delete"` 拒绝（前批已有，保留）；其转调 provision 也被入口守卫兜住 |
| 迁移实现 `movePersonalAssetsToEnterprise` | 已不可达（dormant）；未恢复迁移、未重建迁移事务，cleanupOrphan 不当作恢复完成 |

### 诚实区分（按 prompt 要求）

- **内部服务漏洞**：修复前 `provisionEnterpriseUpgrade` 对 `ADMIN_MANUAL`/`SALES_SIGNUP`/省略 source 的 delete 不拒绝，可进入危险迁移路径——这是内部服务层漏洞。
- **公开可利用路径**：未证明存在。route 层对自助请求在前批已拒绝 delete；`ADMIN_MANUAL`/`SALES_SIGNUP` 来源需要内部调用方传参，普通用户公开 HTTP 入口未见可注入这些 source 的路径。
- 历史订单：不修改金额/状态、不擅自退款、不制造 SUCCESS。带 `option=delete` 的历史 PENDING 订单支付后履约仍被拒绝，**需人工处置**（此类订单的处置单列为待批准事项，不在本批暗含）。

### 验证证据

E3 组 5 用例：`SELF_SERVICE_PURCHASE` / `ADMIN_MANUAL` / `SALES_SIGNUP` / 省略 source（默认）四种组合 + 携带已核验快照的 delete，全部 `MIGRATION_OPTION_UNAVAILABLE`，断言零空间创建/零成员/零 workspace.update/零资产迁移（asset.updateMany=0）/零孤儿删除/零账单/零配额写/零赠送，个人空间 plan 未变。

---

## 四、E4：类型错误修复（当前 tsc exit 0）

### 修复内容

`r0a4-combo-regression.test.ts` 的 5 处 TS2740（原 296/314/329/343/362 行）：DB 行 fixture 缺 `WorkspacePlanConfig` 必需字段。修复为类型化 fixture：

- `type PlanRowFixture = WorkspacePlanConfig & { id: string; isActive: boolean }`，`FREE_ROW`/`PAID_PRO_ROW` 补齐全部必需字段（`maxConcurrency/maxSingleFileBytes/maxModelAllocations/maxByoModels/tokenLimit/poolLowThreshold`、完整 `trialGift` 对象）——明确区分原始 DB 行（含 id/isActive）与服务 DTO；
- 不使用 `as any`/`@ts-ignore`、未削弱生产类型、未排除测试、未改 tsconfig；
- 快照不再手拼原始行：新增 `snapshotViaStrict()` 通过**真实 `getWorkspacePlanStrict`** 生成（与 route 同源）。这是修复过程中发现的实质问题——`dbToConfig` 对 features 做动态派生（`buildDynamicPlanFeatures`），手拼快照与真实 DTO 不同源，会导致假阳性/假阴性。

### 类型检查记录（含对前批报告的更正）

```text
命令：npx tsc --noEmit --incremental false -p tsconfig.json
本轮独立复核前：exit 1（R0-A4 报告"类型检查 exit0"的记录与事实不符，在此更正；历史报告不倒改）
本批修复后：exit 0，无诊断输出
```

### 更正声明

- R0-A4 修复报告第六节"npx tsc … exit 0"在当时未复现于独立复核，本批以修复后实测 exit 0 为准；
- 本批未运行危险集成测试（未执行 `refund-integration.test.ts`、未连真实库）；前批全量测试对环境的残留影响**仍未核实**，保留该事实，不做自动清理、不自行连库，需要真实库调查/清理单列待批准。

---

## 五、E5：页面协议真实化 + 诚实禁用

### 协议重构（测试执行实际生产代码，不再手写副本）

- 新增实际生产模块 `src/lib/upgrade-response-protocol.ts` 的 `resolveUpgradeResponse()`：**先验证 `success===true`，再处理 free/payUrl**。四个判定结果：`pay_redirect`（仅 success:true 才可能）/`free_success`（必须带 workspaceId）/`pending`/`failed`（含 null/undefined 的 HTTP 错误体与网络异常）。
- 三个调用方（独立升级页、studio UpgradeModal、中枢 UpgradeModal）**删除各自手写判定**，统一导入该模块。这修复了实际缺陷：独立页原代码 `result.payUrl` 判断在 `result.success!==true` 之前，`success:false + payUrl` 会跳转收银台——现已按协议先验 success；R0-A4 测试中的手写副本 `processUpgradeResponse` 同样存在该顺序错误（已连同整组删除）。
- 三入口语义保持：正常待支付不写开通标记、不触发完成回调；仅真实免费完成写 localStorage 标记/触发回调；失败/缺 workspaceId/协议不一致保留用户当前选择并显示说明；无自动重试下单。

### 测试覆盖（E5 组 10 用例，直接 import 执行实际协议模块）

payUrl 正常跳转 / 免费完成（含 workspaceId 证据）/ free 缺 workspaceId / **success:false + payUrl → failed 不跳转** / success:false + free:true / success:true 无 payUrl·free → pending / free+payUrl 并存 → 完成证据优先 / HTTP 错误体 null / 网络异常 undefined / 非对象响应体，全部通过。

**如实声明**：协议用例为服务层模块的真实执行，**不冒充 DOM 验收**；本批浏览器隔离环境不可用，三页面渲染后的 toast/跳转/localStorage 实际行为**未经浏览器验证**，已列入未完成项。

### 迁移卡片诚实禁用

- 独立升级页：移除 `pointer-events-none`（原写法使 onClick 提示永不可达），卡片保留灰显 + cursor-not-allowed，**初始即显示**「暂不可用」标签与原因文案（替换原"资料完整搬迁"能力宣传），重要提示区同步说明；点击可触发提示。
- 中枢弹窗：迁移模式卡片**初始即显示**「暂不可用」标签与原因（原为仅点击后才知道），能力宣传语替换为「恢复开放前不可选择」，灰显 + cursor-not-allowed，点击可触发提示。
- studio 弹窗本无 delete 选项 UI（仅 option:"upgrade"），无需修改。

---

## 六、验证命令与结果（本批实测）

```text
npx vitest run --no-color src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 1 file, 43 tests passed（原 17 用例保留通过 + 新增 26）

npx vitest run --no-color src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts
→ 3 files, 66 tests passed（前批保护不回退）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

npm run build
→ exit 0，完整构建通过（编译 + 类型 + 页面产物）
```

均为本地 node_modules 工具、定向测试，未全量跑测试、未连真实库、未下载依赖。

---

## 七、数据/账务边界

- 本批零真实库写入/迁移/seed/退款补账，零真实支付/模型/通知调用，零价格/赠送/名额/权限配置变化。
- 测试全部 mock 数据库/认证/支付/赠送/迁移/守卫，不 mock 被修的核心核验/开通函数（`verifyPlanSnapshotConsistency`、`applyEnterpriseUpgrade`、`resolveUpgradeResponse`、`provisionEnterpriseUpgrade`、`upgradePersonalToEnterprise`、route POST 均为真实代码执行）。

## 八、未完成项 / 待人工处置

| 项 | 说明 |
|---|---|
| 浏览器验收 | 三页面渲染后行为（toast/跳转/localStorage）未在浏览器验证 |
| 历史 delete PENDING 订单 | 存量带 option=delete 的待支付订单需人工处置（不自动退款/不伪成功），待批准后处理 |
| 前批环境残留 | R0-A4 承认执行过含真实 Prisma 的全量测试，环境/残留影响未核实 |
| 休眠迁移代码 | `movePersonalAssetsToEnterprise` 及赠送迁移 import 已不可达，留待迁移恢复批次处理或清理 |
| MySQL 并发 | 应用层快照比较不证明数据库并发/回滚语义，需后续独立验证 |

完成即停止：不发布、不进入下一批、不宣称全站无费用漏洞或生产就绪。
