# R0-G独立审核：主要止损有效，两个既定边界仍未通过

日期：2026-11-07（Asia/Shanghai）。结论：**R0-G暂不签收；只补G-BINDING、G-CONFIG两项，不进入后续批次。** 本轮未修复或替换业务源码，仅新增独立审核证据和补修提示词。R0-A/B/C/D/E及原F09维护审计保持冻结。

## 1. G-BINDING / P1：扫描时空绑定，写前新增quota的变化没有被保护

位置：`src/app/api/cron/workspace-subscription-expire/route.ts:70—89`。workspace条件写只包含id/plan/planExpiresAt；绑定校验只在`if (ws.workspacequotaId)`内进行。

真实handler+内存事务复现：候选为已到期PRO，扫描结果workspacequotaId=null；在写边界前模拟另一个已提交操作绑定q2（30席）。当前条件写仍成功，因旧候选为null而完全跳过绑定核验及quota写，响应200、downgraded=1、skipped=0。最终空间为STANDARD、期限清空，新q2仍30席。

这违反上一轮第5节“quota绑定变化时不覆盖新事实”及J05。并非新增关联功能或要求暂停所有无quota空间；**null也是需要匹配的候选事实**。建议在原条件写边界同时匹配候选workspacequotaId（包含null）或等价可靠保护；条件不匹配必须零相关写/诚实跳过。保留未改变绑定的合法降级。

## 2. G-CONFIG / P2：STANDARD配置缺失时仍硬编码2席继续降级

位置：同一路由55行`BigInt(std?.maxMembers ?? 2)`。

独立将STANDARD查询结果设为null，当前仍返回200、降级1个空间，并把20席覆盖为2席；没有有效配置却报告正常处理。此项不等同于配置查询抛错（后者原catch会500）。

上一轮第5节已经要求“标准套餐席位继续来自现有配置”“配置无法安全支持处理时诚实拒绝”。这里只要求落实该保护，不新增套餐/定价规则。缺失或无法使用的配置应在降级写入前拒绝，不自动建配置、不seed、不用另一个写死数字代替。有效配置如4席必须精确使用实际值。0/-1等特殊值沿用权威既有规则，不能擅自决定商业语义。

## 3. 已通过部分与证据缺口

| 验收项 | 本轮结果 |
| --- | --- |
| J01 | 三环境×缺失/空串/纯空白密钥均503，数据库读写/事务全0 |
| J02 | 缺失/空白/错误key、登录token及查询参数旁路均拒绝，零业务IO；无密钥回显 |
| J03 | 固定合成时钟验证过期/未来/无期限/STANDARD/相等临界分类；严格lt规则符合本批已声明契约；但配置缺失保护未满足 |
| J04 | 旧回收开关缺失/false/true/TRUE/1均保留余额/来源资产；true明确暂停，reclaimedPoints=false；正常席位回落使用夹具实际4席 |
| J05 | 续费、换套餐、旧到期期限变化、q1→q2、q1→null、quota归属错误均跳过/回滚；并发及重复请求有效；null→q2仍有缺口 |
| J06 | 套餐写、quota写、回调后commit失败均单空间完整回滚，无ROOT写逃逸 |
| J07 | 仅POST，无新增GET旁路；既有席位下单/履约到期拒绝由重跑r0b覆盖；不宣称全站请求权益兜底已完成 |
| J08 | 351项定向测试、类型检查和各组件检查通过；当前route及新测试与结束哈希一致，开始副本与上轮独立证据一致，9个冻结文件无变化 |

独立控制31组，另2组反例。IDE35项新增用例只覆盖非空q1→q2；STANDARD种子始终存在且为2席，不能发现空配置仍用2的路径。临界测试原先只用过去1ms/未来5秒，并没有真正固定时间验证相等；本轮已用合成固定时钟补证，未发现临界业务缺陷，不因此追加第三个补修项。

## 4. 本轮实际命令

```text
.\node_modules\.bin\vitest.cmd run --no-color
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
=> 10 files / 351 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断

node docs/reviews/R0-G-independent-review/verify.cjs
=> 31组控制、2个缺陷复现，NOT ACCEPTED
=> exit 0表示预期观察/反例成功复现，不表示本批通过

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs => 10/10，exit 0
node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs => 5/5，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs => 24/24，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs => 18/18，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs => 21/21，exit 0
```

## 5. 状态与下一关口

| 项 | 当前状态 |
| --- | --- |
| 用户可见结果 | 调度凭证错误拒绝；授权到期处理保留余额；但空绑定变更与缺STANDARD配置仍可能产生不应发生的降级 |
| 后端闭环 | 大部分续费条件写和同事务回滚有效，两项边界未闭合 |
| 本轮实际影响 | 仅审核材料；未修改业务源码，零真实库/降级/配置/会话/支付/模型/费用/部署 |
| 未验证 | 真实MySQL锁/隔离级别、线上调度配置、其他cron、全站请求权益及生产发布；不因此扩大本批 |
| 下一关口 | 仅按IDE-R0-G1-PROMPT.md补齐上述两项及对应回归，然后交回审核 |

以上是代码路径和合成数据复现，不证明线上已发生错降级或资金损失。不得把351项通过扩大为J01—J08全部通过，不回退已经通过的鉴权、资产保持及维护审计。
