# R0-H独立审核：基础准入已实现，成本上界与计费模式边界尚未通过

日期：2026-11-07（Asia/Shanghai）。结论：**R0-H暂不签收；仅补H-BOUND/P1、H-MODE/P2，不进入F12。** 本轮未修改业务源码、售价或配置，只新增审核脚本/隔离用例、证据及限定提示词。

## 1. H-BOUND / P1：仍不能把当前输入与费用测算称为保守上界

位置：`src/app/api/studio/handler.ts:3439/3474`，`src/lib/token-estimate.ts:34`，`src/lib/model-cost-admission.ts:21/134`。

handler直接把estimateCombinedTokenCount的字符粗估传为inputTokens。该函数仍按CJK每字1、其他字符每4个约1 Token估算；新准入函数只验证输入数值为整数，未验证它来自可信边界，也没有在无法证明边界时拒绝。新注释称“保守上界”，但代码没有建立对应保证。

实际handler隔离复现：输入1000个非CJK字符Ж，最终提示词/材料字符估算413，UTF-8合计2535字节；无可靠Token边界声明仍返回200、consume spy和execute spy各1次。**字节数不是实际Token数，本轮未测真实供应商计数，更不据此断言实际亏损。** 该证据证明的是“未建立可靠上界却继续执行”，违反原提示词第4节“无法可靠限定时拒绝”。不能用报告写“估算不是数学证明”来免除既定拒绝要求。

同一成本完整性问题还有计费规则遗漏：最终pricing中的rules不会进入准入解析/检查。合成的未知附加费用规则在helper和实际handler均被忽略并放行。本例规则故意不受支持，不证明任何真实厂商收取该费用；它验证原第3节要求的“规则无法可靠解释不得按0继续”。不要求实现通用规则引擎，无法解释的可能费用项应诚实拒绝。

建议只在当前执行路径建立有来源、可核查、能约束真实请求的保守输入/费用边界；不能建立就拒绝。不要增加随意字符倍数后又称证明，也不要借此涨价或改变输出产品承诺。

## 2. H-MODE / P2：新固定预算准入也会进入已启用的真实结算分支

位置：`src/app/api/studio/handler.ts:3286/3463—3465`。

`settlementFeatureEnabled`与`billingBasis`不是同一变量。平台模型即使真实结算已启用，billingBasis仍可为ESTIMATED_COMPATIBILITY，故“非BYOK且billingBasis为兼容”并没有实现只作用于固定兼容模式的约束。

受控测试环境设置TEST_TOKEN_SETTLEMENT_ENABLED=true及已有billing.settlementMode=ALL，使用通过真实evaluateSettlementReadiness的可信成本加价定价夹具。真实handler仍被新固定100点预算判断返回400 MODEL_COST_EXCEEDS_BUDGET，hold/execute均0。

本例是测试环境状态，**没有打开生产开关、没有写真实配置或产生hold**；生产真实结算硬关闭逻辑仍未改。本项是原L07“不得误套真实结算”的范围错误，不是要求启用或放松结算。修复应根据实际生效计费分支隔离新规则，同时保留原结算就绪/价格和原有费用门禁，不用删除旧保护制造通过。

## 3. 已通过的工作与证据表述

| 项 | 独立结果 |
| --- | --- |
| L01/L04基础金额判断 | 独立输入80/100/101/150/200/201点成本，100点预算时前两项允许、其余拒绝；BigInt微元换算无旧2倍容忍区 |
| L02基础价格校验 | 定价缺失/不可信状态的实际handler拒绝，零扣点/execute/任务；但未知费用项与输入可信边界未闭合 |
| L03请求参数一致 | 最终提示词先展开，输出上限与execute同变量；这一改进有效，但不等同于输入成本上界已经可信 |
| L05拒绝顺序 | 已实现的拒绝在扣点/hold/execute和RUNNING创建前，独立正反控制保持 |
| L06正常处理 | 安全夹具保持100点调用、任务SUCCESS；原测试覆盖失败时退款调用。扣点/退款是IO spy，不能称真实来源账本已验收 |
| L07页面 | 本轮实际执行handleExecuteSimulation回调，两种成本拒绝均展示错误、busy true→false，无成功状态写/成功Toast；不需改页面。结算模式边界仍有缺口 |
| L08冻结 | 377项定向测试、类型检查及各既有组件检查通过；开始副本/结束哈希一致，17个价格/账务/支付/维护/cron/页面保护文件未变 |

原14项测试中的“成本恰好100点”用例，50000输入×2000000微元/百万实际为100000微元=10点，没有验证恰好100点；本轮独立用20000000单价已补证实际100点等值逻辑正确，不把原测试标签错误增加为第三个业务缺陷。新报告应更正覆盖口径并补有意义的正式回归。

实际handler测试使用IDE封闭IO夹具并独立增加断言；其内存事务undo快照在写后采集，不能用它宣称真实事务回滚已证明。本批核心拒绝用例不经过该事务模型，未把这一夹具局限当作新的生产缺陷或重构任务。

## 4. 实际运行

```text
.\node_modules\.bin\vitest.cmd run --no-color
  src/app/api/__tests__/r0h-cost-admission.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
  src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts
  src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts
  src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts
  src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts
  src/app/api/__tests__/r0a4-combo-regression.test.ts
=> 11 files / 377 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> 业务交付版本检查exit 0；审核隔离用例加入后最终再次检查exit 0，无诊断（只修正审核用例的取值类型，未改业务源码）

node docs/reviews/R0-H-independent-review/build-review.cjs
.\node_modules\.bin\vitest.cmd run --no-color --config docs/reviews/R0-H-independent-review/vitest.review.config.ts docs/reviews/R0-H-independent-review/review.test.ts
=> 5项独立复核通过（含预期缺陷复现）；exit 0不表示本批签收

node docs/reviews/R0-H-independent-review/verify-pages.cjs
=> 实际页面回调2项拒绝检查通过，exit 0（非浏览器）
node docs/reviews/R0-H-independent-review/verify-manifest.cjs
=> 开始/结束及17保护文件通过，exit 0

原组件脚本F10/E5/D24/C18/收银台21均重跑通过，exit 0
```

审查脚本只生成本目录文件；未修改共享业务源码、已有测试或历史审核JSON。自定义Vitest配置只收集本目录的一个隔离审核文件，没有运行全量测试。

## 5. 状态与下一关口

| 项 | 状态 |
| --- | --- |
| 用户可见结果 | 基础未知/超预算拒绝和正常任务可用，失败页面诚实；尚不能宣称输入与附加费用有可信上界 |
| 后端闭环 | 基础准入和参数复用有效，H-BOUND与H-MODE未闭合 |
| 实际数据/费用 | 零业务源码修复，零真实库/模型/支付/配置/结算启用/费用/部署 |
| 未验证 | 真实分词器/供应商、MySQL、浏览器DOM、真实来源账本、现金毛利及运营成本；不因此增加新产品或收费决策 |
| 下一关口 | 仅按IDE-R0-H1-PROMPT.md补齐两项，再复核；不进入F12 |

已签收的R0-A至G1保持冻结。补修不扩为通用计费引擎、全站模型改造、自动调价或利润系统。
