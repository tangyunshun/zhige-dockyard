# R0-H1 修复报告：可信成本边界 + 实际计费模式隔离

**状态：R0-H1 待独立复核**（不进入 F12、不部署）

只修 R0-H 独立审核确认的两项：H-BOUND/P1（字符粗估被当成本上界、未知费用规则被忽略）与 H-MODE/P2（已启用结算分支误入固定预算判断）。已通过的基础金额判断、价格缺失拒绝、最终参数复用、拒绝前不扣点、失败退款流程全部保留。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-H1-fix-snapshot/manifest.json` + `frozen-source/`（3 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T16:01:37+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | handler `0c486109…` / admission `46f02efa…` / 测试 `1160d748…`（与 R0-H 结束哈希一致） |
| 结束 SHA256 | handler `0ebac90f…` / admission `ff233368…` / 测试 `4fe6505c…` / tsconfig `ccda8316…`（`after-hashes.json`） |

**修改差量**：admission 函数重写（边界构造 + 规则/缓存检查）；handler 准入调用点（模式隔离三条件 + 新签名 + 注释）；测试重写（16 用例）；`tsconfig.json` 仅新增 `"docs"` 到 exclude（审核目录的冻结 `review.test.ts` 引用旧函数签名，属历史证据不参与项目编译——不改其内容）。售价/充值比例/markup 配置/BYOK 费率/settlementEnabled/退款原语零改动。

## 二、H-BOUND：可证明输入边界与未知费用处理

### 边界来源（M01/M04）

| 项 | 来源与依据 |
|---|---|
| 输入 Token 上界 | **`UTF-8 字节数(最终systemPrompt) + UTF-8 字节数(最终userPrompt) + 128`**。依据：任何分词器的一个 Token 是 UTF-8 字节序列的子串、至少编码 1 字节 → 文本 Token 数 ≤ 其 UTF-8 字节数（可证明性质，对字节级 BPE 与字符式分词器均成立）。上界由准入函数**从最终请求文本直接构造**（与 adapter.execute 同一字符串变量），杜绝「传入恰好是整数的估算值冒充上界」 |
| 协议封装余量 | `PROTOCOL_FRAMING_TOKEN_ALLOWANCE = 128`（system/user 消息角色与框架开销）——**显式声明的工程保守余量，不是数学证明的一部分**；文本部分严格成立。已在模块注释与报告披露 |
| 输出上界 | `maxOutputTokens` 即实际传给适配器的请求参数，本身是硬上界（无估算成分） |
| 字符粗估 | `estimateCombinedTokenCount` 仅保留用于输入防爆阀（INPUT_TOO_LARGE）与校准告警——展示/诊断用途，不再进入成本计算 |

测试证明边界被采用（M01）：1000 个非 CJK 字符（Ж，2 字节/字符）+ costIn=5×10⁸ 的请求——字符粗估折算约 20 点（旧口径会放行）、字节上界折算 >100 点 → 真实 handler 返回 400 `MODEL_COST_EXCEEDS_BUDGET` 且零副作用。正常短材料低单价正向对照放行（不永久拒绝）。

### 未知费用处理（M02）

| 类别 | 处理 |
|---|---|
| `pricing.rules` 非空对象/数组/非对象形态 | 拒绝 `MODEL_COST_NOT_TRUSTWORTHY`（存在无法证明与本次费用无关的规则；不实现通用规则引擎、不把规则加到账单、不涨价）。真实 handler 级用例证明零副作用 |
| `rules` 缺失/空对象 | 不误拦（对照用例） |
| 缓存成本类别已登记非零（cacheRead/Write） | 拒绝——本次请求是否命中缓存不可预知，无法保守覆盖；未登记（null）不误拦 |
| 基础价格校验 | 缺失/不可信状态/非 CNY 币种/单侧缺失全部保持拒绝；FREE 与 VERIFIED+0/0 明确免费对照放行（仍受原输入/能力/权限限制） |

## 三、H-MODE：按实际生效分支隔离（M03）

准入条件从「非 BYOK 且 billingBasis=兼容」扩为 **「非 BYOK 且 billingBasis=兼容 且 `!settlementFeatureEnabled`」**——按服务端实际生效计费分支判定，不只依赖 billingBasis 字符串。三分支真实 handler 证据：

| 分支 | 夹具 | 结果 |
|---|---|---|
| 固定兼容（PLATFORM、未启用结算） | 高成本定价 | 400 `MODEL_COST_EXCEEDS_BUDGET`、hold=0——**仍受新准入保护** |
| BYOK（deploymentId=byo:w1、estimatePoints mock 返回 CONVERTED_PRICE 7 点） | 高成本定价（若误入固定预算会拒绝） | 200 SUCCESS：`estimatePoints` 被调用、consumePoints 恰 1 次 **points=7**（按换算点数扣，不被固定 100 预算拦截）、execute 1 次 |
| 合成已启用真实结算（`TEST_TOKEN_SETTLEMENT_ENABLED=true` + 内存 systemconfig `billing.settlementMode="ALL"` + `priceSource=VERIFIED` 通过**真实 evaluateSettlementReadiness**） | 高成本定价（折算远超 100 点） | 202（结算异步契约）：hold=1、consumePoints=0、execute=1——**未被固定预算拒绝**；`releaseSettlementHold`=0（无失败） |

生产开关硬关闭逻辑未改（`NODE_ENV=production` 恒 false 的实现零改动；合成开关仅在测试环境生效）；原结算就绪门禁（SETTLEMENT_NOT_READY）、模型权限、价格就绪检查全部保留（源码级断言 + 未授权/合同缺失用例通过）。

## 四、M04 数额边界（修正旧用例参数）

审核指出旧「恰好 100 点」用例实际只算 10 点——已按正确参数重写：输入上界精确构造为 1,000,000 Token（999,872 字节 ASCII + 0 userPrompt + 128 封装），`costIn = 1,000,000 微元/百万 → 恰好 100 点`（放行，等值边界）；`1,010,000 → 101 点`、`1,500,000 → 150`、`2,000,000 → 200`、`2,010,000 → 201` 全部拒绝。每例先以测试内独立字节/微元复算对照（不调用被测函数），再断言决策一致。最终请求与边界一致：execute spy 与准入消耗同一字符串变量，无检查后放大。

## 五、M05 流程保持

安全请求按原金额（100 点）扣点、任务 SUCCESS + 成果物；模型失败 → 原路退款恰一次 + FAILED(chargeAttempted=true) + 502 既有契约；BYOK 按换算 7 点扣费。页面已由本轮独立核验（审核方 `verify-pages.cjs` 实际执行回调），本批未重写页面；其脚本在本批修复后仍 PASS（"2 cost-rejection cases, no false success and busy restored"）。

## 六、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts
→ 1 file, 16 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts
→ 11 files, 379 tests passed, exit 0（377 既有 + 新 16 中替换重组后的有效全量）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs → 10/10, exit 0
node docs/reviews/R0-H-independent-review/verify-pages.cjs
→ PASS actual Studio page callback: 2 cost-rejection cases, no false success and busy restored；exit 0

冻结证据脚本（预期失败，零改动）：
- build-review.cjs → exit 1（AST 查找旧门槛代码块不再存在）
- verify-manifest.cjs → exit 1（handler 哈希与冻结清单不一致——本批合法修改）
- vitest.review.config.ts（review.test.ts 冻结反例）→ 4 failed | 1 passed（旧缺陷断言不再成立）
```

均定向隔离运行、本地工具、合成数据；零真实库/模型/组件执行、零支付/短信/配置或合同切换/结算启用/迁移/seed/退款/补账/费用/部署；未读取或打印真实密钥；未全量测试。

## 七、夹具更正与未验证项

- **夹具更正**（审核指出）：内存事务 undo 快照改为**写前采集**（旧 R0-H 夹具写后采集，无法证明回滚）；审核指出旧「恰好 100 点」参数错误（实际 10 点）——本批以精确字节构造重写并通过独立复算验证 100 点等值逻辑。
- 账务服务（consumePoints/refund/hold）为 IO spy：仅证明调用次数/参数与任务流程，**不宣称真实来源账本扣退点已验收**（沿用未变账务证据并说明限制）。
- 未验证：真实供应商分词计数（字节上界的 128 封装余量是工程保守值，若未来协议框架开销超过该值需更新常量）；真实 MySQL；浏览器 DOM；多步/重试编排路径；其他模型调用入口（refine-prompt 等）仍不在范围。
- 本批是单次执行成本止损：利润率、补贴规则、赠送来源真实收入及运营成本仍需商业决策，不宣称盈利闭环完成。

## 八、回滚说明

用 `docs/reviews/R0-H1-fix-snapshot/frozen-source/` 三个副本覆盖对应文件、`tsconfig.json` 移除 `"docs"` exclude 即回到 R0-H 结束状态；无 schema/DDL/环境变量依赖。

**M01—M06 通过即停止交回；不进入 F12，不扩展计费/利润系统。**
