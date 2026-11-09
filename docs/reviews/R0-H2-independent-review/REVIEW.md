# R0-H2 独立审核：F11 有界通过，冻结并进入原 F12

审核日期：2026-11-07。对象是当前工作区及 R0-H2 结束哈希，不以 IDE 自述替代独立证据。只增加本目录审核材料，没有修改业务源码或正式测试；没有访问真实数据库、环境密钥、供应商或支付服务。

## 1. 结论与范围

**R0-H2 在上一轮 N01—N05 的范围内通过；原 F11 的 Studio 平台模型固定点数兼容模式成本准入止损可以冻结。不再发 R0-H3。**

这次使用上一轮已明确允许的最小方案：以最终服务端模型计划所绑定部署的完整 `contextLimit` 为保守输入成本预算，另加实际输出硬上限的成本。该上限来自注册表，没有在本次准入里猜默认数值，也不读客户端的上限。`model-registry.ts:824` 直接带入部署登记值，未注册模型没有环境变量兜底；支持协议共用当前部署的完整硬限制，不再依赖协议封装的经验余量。

这属于信任服务端部署登记事实的边界；本轮没有验证实际部署登记是否与供应商真实硬限制一致。登记错误需纠正登记事实，不能凭本轮测试宣称真实供应商行为已验证。使用完整上下文输入预算可能比实际费用高，导致一些本来低成本的长上下文模型被拒绝，这是上轮允许的保守止损取舍，后续不得暗中缩小上限来恢复放行。

名义点数预算不等于现金收入。通过 F11 不能推导平台整体盈利、支付闭环、所有模型入口或生产就绪；多步/重试、其他入口和经营成本不在本轮范围。

## 2. 与上轮要求逐项核对

| 验收项 | 当前独立结果 |
| --- | --- |
| N01 缺失、非法及客户端伪造 | 真实 `runStudioPost`：undefined/null/0/-1/NaN/Infinity/非数值/超安全整数均 422；小正数由已有输入限制先拒绝。全部零扣点、hold、execute、退款调用，零任务/流水。客户端伪造 contextLimit/inputTokens/budget/maxOutputTokens 不改变结果。 |
| N02 正常可信来源 | 三种支持协议的最终计划均使用服务端 8192 上限；伪造客户端上限 1 不覆盖。正常返回 200、固定扣点调用 100、执行一次、任务 SUCCESS。纯准入结果来源 REGISTRY_CONTEXT_LIMIT_FULL、数值 8192；独立复算为 9 微元。协议/注册表 IO 夹具不等于真实适配器/供应商验收。 |
| N03 金额与实际参数 | 真实 handler 独立复算 100/101/150/200/201 点：等值 100 放行，其余拒绝且零执行副作用；客户端 maxOutputTokens=1 不覆盖实际 300。另独立覆盖输出成本与既有 markup 的临界值。 |
| N04 保持已过行为 | 未知规则、非零缓存类别拒绝；FREE/VERIFIED 0/0 正向对照，免费也不绕过缺失上限。BYOK 7 点报价透传、仅测试启用的结算 hold、正常 SUCCESS、失败 FAILED/退款调用一次都保持。生产结算开关未修改。 |
| N05 冻结交付 | 3 份开始副本匹配 H1 结束哈希，4 份结束哈希匹配当前；17 个保护源文件保持。定向回归、独立测试、受控组件和类型检查通过。 |

扣点/退款/hold 的 spy 仅证明业务分支、次数和参数，没有证明真实分桶账本、MySQL 锁或支付退款。

## 3. 本人执行的验证

| 验证 | 实际结果 / 退出码 |
| --- | --- |
| `node docs/reviews/R0-H2-independent-review/build-review.cjs` | 3 开始副本、4 结束哈希、17 保护文件通过，exit 0 |
| `vitest run --no-color --config docs/reviews/R0-H2-independent-review/vitest.review.config.ts` | 6 项独立测试通过，exit 0；见 handler-verification.json |
| 下述 11 文件定向正式回归 | 381 项通过，exit 0；H2 正式测试由 16 重组为 18，不冒充原用例逐字全保留 |
| `tsc --noEmit --incremental false -p tsconfig.json` | 无诊断，exit 0 |
| 原 F/E/D/C/B2 受控组件脚本 | 分别 10/5/24/18/21，通过，均 exit 0 |
| 当前 Studio 真实回调 AST 提取执行 | 422/400 两种成本拒绝恢复 busy，展示真实错误，无成功状态写入；见 page-verification.json；不是浏览器 DOM |
| F12 当前计价源码纯函数隔离执行 | 15% 得 1150 点、0% 仍 1000 点（基础价 1000 点的夹具），exit 0；见 f12-baseline.json |

正式回归命令（使用项目现有本地工具，不下载依赖）：

```powershell
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```

独立测试只复用正式测试中的 IO 内存夹具，新增断言和观察；真正调用当前 handler 与准入函数，不 mock 成本判定。所有测试限定文件运行，没有全量测试、读写真实库或调用真实模型。故障注入与合成结算产生的预期 stderr 不代表生产错误。

## 4. 本批差量

- handler 仅改准入参数来源：最终文本参数改为 `modelPlan.contextLimit`，并更新说明。
- model-cost-admission 移除字节+128 上界，增加登记上限校验与来源标识；金额比较、规则/缓存拒绝保持。
- 正式 H 测试按新方案调整；tsconfig 沿用 H1，没有再改。
- 关键哈希见 manifest-verification.json；本轮结束重新核对同一批源文件，防止核验期间换版。
- 历史 H/H1 独立反例没有改写造绿。旧签名和旧缺陷期望不再适用，使用本目录新回归。

## 5. 下一批原 F12 的已核实现状

下一批命名 **R0-I：BYOK 任务收费口径止损**，对应原方案 F12，不新增功能路线。

1. `pricing-center.ts:149` 的 BYOK_OFFICIAL 为 `10000 + byokServiceRateBps`，本轮从当前源码独立离线复算：基础 1000 点、费率 15% 得 1150 点；这是基础价加服务费，而非只有 150 点服务费。不能据此确认谁实际向供应商付款或断言线上已经重复收款。
2. `studio/handler.ts` 的注释称“平台只收服务费”，实际在 BYOK 报价可用时使用上述点数；`billing/estimate` 也展示官方单价折算加服务费。展示、收费性质与供应商付款责任需要负责人确认。
3. `studio/handler.ts:2894` 附近，BYOK 无价或报价不可用时继续沿用组件固定点数，异常也可仅记录后继续；这没有解决 BYOK 收费依据缺失。
4. 服务端 BYO 计划使用空间保存的端点和解密凭证。凭证归属不是付款责任的独立证明，不能据此直接把 115% 改成 15%。总纲也没有将默认费率等同于商业批准。

**下一批采用已有 R0 同类止损方式：仅暂停 Studio 任务中收费口径未获确认的 BYOK 执行，并让关联预估/页面诚实显示暂停；保留配置与历史，不改费率，不决定代付采购或仅服务费。** 详细范围与停止条件见 IDE-R0-I-PROMPT.md。该提示词不授权实际部署或真实业务操作。

## 6. 精简状态表

| 项目 | 本轮结论 |
| --- | --- |
| 目标用户流程 | Studio 平台固定点数任务执行前，可靠边界缺失/成本超预算则拒绝，正常任务仍可执行 |
| 页面可见结果 | 沿用实际后端错误提示与忙碌恢复，本批无 UI 改动 |
| 数据/API | 真实 handler + 内存 IO 验证；真实数据库与供应商未访问 |
| 验证 | N01—N05 有界通过；381 正式、6 独立、78 组件检查、2 Studio 回调场景、类型检查通过 |
| 账务影响 | 仅验证调用和参数，无真实扣点、退款、补账 |
| 未完成项 | 注册表与实际供应商限制的一致性、真实持久化/生产验证、现金收入及整体盈利等仍未验收 |
| 是否可发布 | 本报告不签发生产发布或商业化上线许可 |
| 下一关口 | 只做原 F12 / R0-I，交回独立审核；不再返修已通过 F11，不并行扩展 F13—F16 |
