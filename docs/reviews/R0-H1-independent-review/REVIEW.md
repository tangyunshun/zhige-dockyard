# R0-H1独立审核：模式与未知费用已通过，仅剩可信边界适用性

日期：2026-11-07（Asia/Shanghai）。结论：**R0-H1暂不签收；只剩原H-BOUND/P1的一项残留，不进入F12。** H-MODE和未知规则/缓存费用拒绝已核验通过，不再要求重做。本轮只新增审核材料，未修改业务源码或配置。

## 1. 唯一残留：统一“UTF-8字节数+128”尚未建立按模型/协议适用的可靠边界

位置：`src/lib/model-cost-admission.ts:34/106/138`及handler准入调用。

这次不再使用字符÷4，而是从最终文本构造字节数，再统一加PROTOCOL_FRAMING_TOKEN_ALLOWANCE=128。它比旧估算保守，也确实会拦截更多高成本输入；但报告和注释承认128仅是工程余量。函数没有接受或校验模型/协议适用性、已验证的封装限制或其它可信硬上限，也没有“无法验证这种边界则拒绝”的分支。只要数字计算未超预算，所有部署都自动得到UTF8_BYTES_PLUS_FRAMING的上界声明。

原H1第2节明确要求边界来源适用于当前部署/协议/请求、无法可靠限定时拒绝。本轮缺口是**没有条件区分已验证和未验证的边界**，不是要求把128改成更大的经验值。

独立执行真实handler：分别给OPENAI_COMPATIBLE、ANTHROPIC、GEMINI三种合成计划，contextLimit=0且没有其它可信边界声明，均返回200、consume与execute spy各1次。同一577字节最终文本一律得到705输入上界（+128），不检查计划是否支持该假设。注册表和适配器IO为夹具，证明该准入链路缺失适用性裁决；**不证明真实供应商实际使用了多少Token，也不证明任何厂商封装必定超过128或线上发生亏损**。

模块“任何分词器的Token均是原UTF-8字节子串”的绝对注释不能代替适用性证据。无需为所有未知分词器建立通用证明：只支持有现有可信硬限制/适用依据的路径，其余付费路径安全拒绝即可。可以采用已核实的模型完整硬上下文限制做更保守预算，而不引入新分词/配置平台；不能把未知缺省值包装成可信来源。

## 2. 已通过，保持冻结的部分

| 项 | 当前独立结果 |
| --- | --- |
| H-MODE / M03 | 固定兼容高成本拒绝；合成已启用且通过真实readiness的结算走hold+execute、不误套rawCost；BYOK按换算7点调用。生产硬关闭未改变 |
| 未知费用 / M02 | 非空未知规则、非零缓存类别在真实handler拒绝，零扣点/hold/execute/任务；空规则及明确免费正向对照保持 |
| M04金额 | 当前公式下真实100点允许、101/150/200/201拒绝，BigInt和正确等值参数通过；这证明算术，不证明128的适用性 |
| M05正常与失败 | 原100点调用、任务SUCCESS及成果物保持；上游失败时退款调用一次、任务FAILED。账务函数仍为IO spy，不声称真实账本闭环 |
| 页面 | 重新执行真实handleExecuteSimulation回调，两种成本拒绝均恢复忙碌、仅错误提示、无成功状态写；不需改页面 |
| 冻结文件 | 3份开始副本与上轮独立版本一致，4个结束哈希一致，17个价格/账务/维护/cron/页面保护文件未变 |

tsconfig新增exclude docs用于避免冻结审核用例引用历史签名进入主项目编译，未扩大到src或修改vitest收集；属于历史材料与正式源码隔离的常规处理，不作为新阻断。审核用例使用独立配置只收集本目录，不因docs编译排除而跳过复核。

## 3. 实际验证

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
=> 11 files / 379 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断

node docs/reviews/R0-H1-independent-review/build-review.cjs
.\node_modules\.bin\vitest.cmd run --no-color --config docs/reviews/R0-H1-independent-review/vitest.review.config.ts docs/reviews/R0-H1-independent-review/review.test.ts
=> 5项复核通过，包括唯一残留复现；exit 0不表示验收通过

node docs/reviews/R0-H1-independent-review/verify-manifest.cjs
=> 3开始/4结束/17保护文件，exit 0

当前页面回调受控重放（输出到本目录page-verification.json）=> 两种成本拒绝通过
既有组件脚本F10/E5/D24/C18/收银台21均重跑通过，exit 0
```

IDE将原14项成本用例重组为16项，合计379，不是全部旧断言逐条保留再新增16项。其新用例仍以128为期望常量，能证明代码按公式计算，不能独立证明协议封装开销适用于所有模型。报告需严格区分这两种证据，不以更大的用例数字替代边界来源。

## 4. 交付状态

| 项 | 结果 |
| --- | --- |
| 用户可见结果 | 价格未知/规则未知/超公式预算拒绝；正常任务及模式隔离保持；未知边界仍可被当作可靠来源 |
| 后端闭环 | 仅剩可信边界选择/适用性/缺失拒绝未闭合，其他本批修复保持 |
| 审核影响 | 仅本目录审核脚本、证据、报告和提示词；零业务修复、真实库/模型/配置/开关/费用/部署 |
| 未验证 | 真实厂商分词/封装、真实MySQL、浏览器DOM、现金毛利/补贴和运营成本；不据此新增产品要求 |
| 下一关口 | 只完成IDE-R0-H2-PROMPT.md的一项补修，再复核；通过后冻结F11执行成本止损范围 |

本结论不要求继续扩大分词研究、平台预算管理或厂商接入。没有可信证据的路径可明确暂停；不能一边承认边界未知，一边将所有路径标为已证明。
