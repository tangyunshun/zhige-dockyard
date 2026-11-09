# R0-A5 独立审核：本批代码与隔离验证通过

日期：2026-11-06。

**结论：此前E1—E5的代码阻断项已关闭，可以结束R0-A补修，进入下一有边界批次。** 该结论限于本批源码和隔离验证，不是浏览器/真实MySQL/真实交易验收，也不是生产发布或全站盈利结论。

## 本批验收状态

| 项目 | 本轮证据与结论 |
| --- | --- |
| 用户目标 | 免费基础套餐开通或正价待支付；保留/原地升级可用，危险迁移明确不可用；页面区分待支付、完成与失败 |
| E1 配置/赠送 | 实际使用的价格、资格、资源、features权益、trialGift开关/数量/期限与账单名纳入一致性比较；变化返回409，实际组合中零业务写/赠送 |
| E2 写入顺序 | provision先完成最终核验，再走私有applyEnterpriseUpgrade；retain不再建空间/成员后因配置拒绝清理；稳定配置正常写入 |
| E3 迁移阻断 | provision的delete不分来源拒绝；自助、管理员、签约、省略source及历史PENDING订单均拒绝；本轮没有恢复迁移 |
| E4 类型 | 本轮tsc无输出exit0；前批5处类型错误已消除，没有改tsconfig缩小检查范围 |
| E5 页面 | 三入口使用实际生产协议模块；独立执行三个实际TSX处理函数，失败带payUrl、失败带free、缺workspaceId均不再写完成状态或回调；卡片源码显示不可用原因 |
| 自动化 | 本轮4个定向测试文件109/109通过；独立42个后端场景、27个实际handler场景全部符合断言 |
| 数据影响 | 本助手只写审核/快照材料；数据库/认证/支付/赠送IO均替换为内存stub，未发生真实业务写入、发点、收费或模型调用 |
| 未验证/发布 | 浏览器DOM、真实MySQL锁/回滚、真实支付、生产构建未由本轮验证；不批准发布 |
| 下一关口 | R0-B：席位订单在重复/并发确认下只能履约一次，并保证订单状态与席位写入原子一致 |

## 源码核对说明

- `src/lib/workspace-upgrade-service.ts`：新增的私有verifyPlanSnapshotConsistency覆盖实际写入事实；provision在分支写入前调用，并把核验结果传给私有applyEnterpriseUpgrade，后者不再重新选择套餐。公开底层upgrade仍有自身核验。没有发现公网body能取得verifiedPlanConfig/source/paid/free的授权信任。
- `src/app/api/workspace/upgrade/route.ts`：已知服务错误映射为稳定error、中文message和相应状态，配置变化为409；收费路径仍仅PENDING，未提前开通。
- `src/lib/upgrade-response-protocol.ts`及三个调用者：原独立页先payUrl后success的问题消除；实际handler执行证明前端接入有效，不再只依赖手写测试副本。当前API正常返回应遵守免费完成/待支付的明确契约；本轮不验证恶意后端或所有任意畸形字段。
- 此前每条反例按相同业务阶段重新验证；配置变化注入点为第二次读取之前。未把最后确认之后的数据库线性一致性冒充已证明，也未新增锁价政策。

本轮未发现需要继续R0-A6的代码阻断项。不要把此前已经修复的收费配置覆盖、资源/赠送漏比、retain先写后验、内部迁移绕过、5处TS2740继续记为未修复。

## 实际运行

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
结果：4files，109tests passed，exit0。

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
结果：无诊断输出，exit0。

node docs/reviews/R0-A5-independent-review/verify.cjs
结果：exit0；42个后端场景与27个实际handler场景通过。
```

定向测试中输出的PLAN_CONFIG_CHANGED错误日志来自预期的409拒绝用例，不是测试失败。未运行全量测试、真实集成套件或生产构建。

## 冻结与限制

本助手已将审核时的非敏感源码/相关记录保存为.snapshot.txt，清单及SHA256见freeze-manifest.json；这是**本轮审核结束时快照**，不能冒称IDE此前保存了修改前快照。当前IDE报告仍明确未保存本批开始快照，此历史缺失不能补造。下一批必须先保存新的开始基线。

以下仍为独立限制/待办，不因本批通过而关闭：

1. 危险迁移功能仍不可用；历史delete订单需授权后处理，不自动退款或改状态。
2. 前批全量测试使用过真实Prisma，环境和残留影响未核实；本轮没有连库调查或清理。
3. 真实MySQL事务/并发、页面浏览器验收、配置/密钥、运维与商业化发布门仍未完成。
4. 席位订单、企业池回收、人工退款、鉴权和模型成本预算等已登记问题不在本批完成结论内。

## 下一批事实：同一席位订单可重复授予权益

本轮只为制定下一批做隔离诊断，不修改席位源码。证据见NEXT-BATCH-EVIDENCE.json和verify-seat-boundary.cjs。

位置：`src/lib/payment/fulfill.ts:43–105`与`src/app/api/payments/mock/confirm/route.ts:125–150`。

两个入口都在事务前读取PENDING并判断，事务中直接extraSeats增加，未在事务写边界重新争取同一订单的唯一处理权；并且使用闭包中的根billingModel.update，而非事务客户端账单模型。

对同一夹具订单（2席位）让两次读取都看到PENDING，再串行执行事务回调：

| 实际执行代码 | 应增加 | 实际增加 | 结果 |
| --- | --- | --- | --- |
| fulfillPaidOrder（真实支付回调使用的服务） | 2 | 4 | 两次均返回FULFILLED |
| 模拟确认POST | 2 | 4 | 两次均HTTP200 |

后续串行重试能返回ALREADY_PROCESSED，因此“只测付款后再点一次”不足以发现并发问题。根账单update在事务外还使失败时状态/席位原子性不足，需要下一批故障测试。

这里的REAL仅为函数输入夹具，不是已发生真实收款；没有对接验签或真实网关。内存证明业务时序缺陷，不证明线上已发生或MySQL实际锁行为。不存在本轮重复扣用户款的证据，问题是同一订单多发权益。

下一批严格聚焦SEAT_ADDON履约。席位报价的月年周期、折算/舍入与零价边界仍需单独商业复核；本批不批准改定价或宣称席位售卖商业闭环完成。
