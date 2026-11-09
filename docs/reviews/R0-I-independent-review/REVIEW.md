# R0-I 独立审核：未通过，仅修三个原范围问题

日期：2026-11-07。审核对象：R0-I 报告、开始副本、结束哈希及当前实现。只增加本目录审核材料，没有修改业务源码、正式测试或既有报告；无真实数据库、模型、支付、密钥、配置切换或部署操作。

**结论：R0-I 暂不签收，不进入原 F13。** BYOK 任务暂停主分支、最终计划复核、报价暂停数据和 Studio 错误提示已生效，但 I06 平台正常流程、I04 GET 只读和 I05 管理员说明仍有三个确定问题。只发布 R0-I1 修复提示词，不增加新功能范围，也不重做已冻结 F11。

## 1. P1 / I-MONTH-ORDER：先查旧用量再做月度重置，新月份可能一直被拒绝

- 定位：`src/app/api/studio/handler.ts:2905` 读取成员，2912 用 monthlyTokenUsed 判断是否超月额度；直到 3398 才调用 checkAndResetQuotaCycle。
- `src/lib/quota-cycle.ts` 的现有职责正是：quotaResetAt 缺失/到期后，将月度已用计数重置。它不是每次请求无条件清零。
- 本批为了 BYOK 拒绝前不写配额，把重置移后，却没有相应调整依赖重置结果的额度校验，形成了顺序回归。
- 独立对照：同一内存数据，企业空间成员月额度 1000、旧已用 1000、quotaResetAt=2000-01-01，本次平台模型任务收费 100。
  - 修改前 R0-H2 handler 快照：HTTP 200、真实 quota-cycle 逻辑调用一次、旧计数归零、模型执行一次、任务 SUCCESS。
  - 当前 handler：HTTP 400，错误为“当前已用 1000/1000，本次需要 100”；quota-cycle 调用 0、模型执行 0，旧计数仍为 1000。
  - 当期未过期但已用 1000：当前版本仍应拒绝；当期已用 0：正常执行。两个对照均核过，避免把修复变成随意清零配额。
- 影响：旧月份用满额度的成员在新月份可能无法继续使用正常平台模型。若依赖本入口触发重置，重试本入口也走不到重置。其他入口若已重置则可能解除，不能断言线上所有成员都被锁住。
- 修复目标：最终模型计划的 BYOK 暂停裁决先完成；允许的平台任务再维护自然月、重新读取当前计数并检查月额度；所有额度检查仍在扣点/hold/任务/execute 前。不能把重置无条件挪回 BYOK 裁决之前。

证据：handler-verification.json 中 I-MONTH-ORDER、I06-month-controls。对照 handler 仅复制到本目录 baseline-handler.ts，不替换共享源码；quota-cycle 使用实际函数，Prisma 使用内存 IO；真实扣点和退款仍是调用 spy。

## 2. P1 / I-GET-DDL：只读报价通过解析器仍会尝试 ALTER TABLE

- 链路：`GET /api/billing/estimate` → 实际 resolveDeploymentForWorkspace → `src/lib/model-registry.ts:1410` → `ensureByoShareWithMembersColumn()` → `src/lib/workspace-byo-model.ts:113` 的 `$executeRawUnsafe("ALTER TABLE ... ADD COLUMN ...")`。
- helper 的进程缓存初始为 false；首次进入会直接尝试 ALTER，列已存在时吞掉数据库异常。缓存已热不能证明冷启动 GET 只读。
- 独立复现：保留当前 GET handler、实际注册表解析、实际热补列函数，仅用假的 Prisma raw 执行器记录 SQL，并以固定合成返回值替换解密 IO。GET 最终返回 HTTP 200 的正确 BYOK 暂停数据，但同一次请求记录了 **1 次 ALTER TABLE 尝试**。
- 本人没有向真实数据库执行 SQL，也没有读取或解密真实密钥。若真实库没有 ALTER 权限或列已存在，实际可能报错被吞；不能称本轮已观察到真实改表或锁表。
- IDE 的 GET 零写入用例将注册表解析整体替换成了计划对象，因此没有经过该 helper，未能覆盖这条副作用链。
- 这是原提示词明确要求的“GET 不触发惰性 DDL”，不是增加新的全仓迁移整治。只需让本批报价/暂停所需的解析链路严格只读；缺少必要结构时诚实拒绝，不能在用户读请求里自动补表，也不能让调用方传入模型来源来绕过真实裁决。

证据：handler-verification.json 的 I-GET-DDL，包含实际 SQL 文本与调用次数。其他配置/绑定/连接测试的全局迁移问题不在本轮整改范围。

## 3. P2 / I-ADMIN-COPY：管理员卡片和确认弹窗仍宣称收费立即生效

- 文件：`src/app/admin/models/byok-service-rate.tsx`。
- 页脚新增暂停说明，但第 102 行仍显示“实时生效 · 无需发版”；第 166 行确认消息称“对外收费将按新费率实时重新折算”；第 169 行警告称“立即对全部自带模型的估价 / 结算口径生效”。
- 独立执行当前真实组件的 JSX 返回和确认回调，以合成状态打开弹窗，确认这些文字确实处于同一个操作流程；保存仅命中假的 fetch，没有修改实际费率。
- 影响：管理员容易将“保存费率配置”误解成“已恢复当前任务收费”，与本批暂停策略和页脚相互冲突。只改页脚未满足原 I05 管理员口径要求。
- 修复目标：卡片状态、tooltip、确认消息/警告和保存后提示统一说明“仅保存配置，Studio BYOK 任务仍暂停，需单独授权恢复”；保留现存费率数值和权限，不改算法、费率或保存接口。

证据：page-verification.json 中 I-ADMIN-COPY。是实际组件受控执行，不是浏览器 DOM。

## 4. 已验证有效的部分：保留，不返工

- 显式 BYOK、默认/auto BYOK、先平台后 BYOK 的最终计划交错：在合成正常配额下均返回 409 / BYOK_BILLING_POLICY_UNCONFIRMED；本次请求的扣点、hold、任务和 execute 为 0；配额维护函数和配额行确保函数均未调用。
- 有价、缺价、基础成本为 0、服务费为 0、客户端伪造来源/费率都不改变暂停；暂停先于 estimatePoints。合成结算 ALL 不能恢复 BYOK 任务执行。
- 两个报价入口返回 blocked=true、canExecute=false、points/yuan=null；401/403 边界保持。该结论只说明响应与权限，不能抵消第 2 项真实解析链路的 DDL 副作用。
- Studio 实际回调：报价暂停时不发执行 POST；POST 409 时如实提示；报价网络失败后由后端暂停兜底。三者均无假成功/充值弹窗，busy 恢复。原页面脚本的平台成功对照也通过。
- F11 计算函数、费率/算法/结算开关及 A—G 关键保护源文件没有被本批顺手改写。
- POST 仍有既有的自动装配/审计写入，内存日志也记录了它们；本报告没有把“无任务/资金副作用”扩大成“POST 绝对零写入”。不因这项既有行为追加本轮整改。

## 5. 本人执行的验证与边界

| 项目 | 当前结果 |
| --- | --- |
| 7 个开始副本与 7 个结束哈希 | 均对应；其中 3 个开始哈希可直接与 H2 独立清单对照，其余 4 个核对副本自身。不是声称 H2 曾独立记录所有 7 个文件。 |
| 与 H2 清单可对照且未在本批变更的源文件 | 18 个保持；完整 SHA256 见 manifest-verification.json |
| 11 文件定向正式回归 | 387 项通过，exit 0 |
| 新增独立审核 | 6 项场景组通过，exit 0；其中包含对缺陷现状的复现断言，**测试通过不等于本批验收通过** |
| 当前真实管理员组件 / Studio 回调 | 管理员文案矛盾复现 + 3 个拒绝场景核验，exit 0 |
| IDE 新增 Studio 页面脚本重跑 | 3/3 场景通过，exit 0 |
| 原维护页面脚本重跑 | 10/10，通过，exit 0 |
| tsc --noEmit --incremental false -p tsconfig.json | 无诊断，exit 0 |

执行命令使用现有本地 node_modules 工具，无下载：

```powershell
node docs/reviews/R0-I-independent-review/build-review.cjs
.\node_modules\.bin\vitest.cmd run --no-color --config docs/reviews/R0-I-independent-review/vitest.review.config.ts
node docs/reviews/R0-I-independent-review/verify-pages.cjs
node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs
node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
```

审查夹具校正记录：第一次月度对照额外添加成员行，与 IDE seed 自带的同用户/空间行重复，导致查询命中默认无限制行；已在本目录夹具改成唯一成员行，并用真实 quota-cycle 重跑上述六组，通过后才生成 handler-verification.json。第一次及调试过滤运行不是产品通过/失败证据，未改正式测试或业务实现来消除失败。

## 6. 状态与下一关口

| 项目 | 状态 |
| --- | --- |
| 用户流程 | BYOK 任务暂停主路径有效，正常平台任务存在跨月额度回归 |
| 页面可见结果 | Studio 拒绝提示有效，管理员收费生效说明未统一 |
| 数据/API | 报价暂停响应有效，但真实模型解析冷路径仍尝试 DDL |
| 费用与数据影响 | 本轮仅合成 IO；无实际扣费、退款、SQL 或模型调用 |
| 未验证项 | 真实 MySQL、真实供应商、浏览器 DOM、生产部署；连接测试和 refine-prompt 仍在已声明的范围外 |
| 可发布 | 本轮不签收，不授权发布或恢复 BYOK 收费 |
| 下一关口 | 仅 R0-I1，关闭上述三个问题；F11 保持冻结，不进入 F13 |
