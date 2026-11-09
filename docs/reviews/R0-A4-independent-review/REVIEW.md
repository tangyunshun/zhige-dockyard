# R0-A4 独立审核：仍不通过

日期：2026-11-06（本轮跨越午夜；定向测试启动于11月5日23:59）。范围仍为个人→企业升级权益边界、迁移止血、配置确认、相关页面与交付证据。

本轮结论：**已有修复有效，但关键要求仍未完整实现；继续同批补修，不进入下一批。** 不修改业务代码，不操作真实数据库、支付、模型或额度。

## 状态与证据

| 项目 | 本轮事实 |
| --- | --- |
| 用户流程 | 核对免费/付费升级、retain/upgrade/delete，以及三页面付款/成功/失败反馈 |
| 认可的成果 | 公开POST拒绝delete；历史PENDING迁移履约拒绝；普通自助服务delete拒绝；原地/并行稳定免费流程正常；改价/停用在原地升级中拒绝；缺workspaceId/free冲突响应防御有所改善 |
| 现存阻断项 | 资源/赠送变化不比较；retain先写后验；内部管理员/签约迁移仍可执行；类型检查失败 |
| 定向自动化 | 4文件83/83通过，exit0；不等于类型或业务流程验收通过 |
| 类型检查 | exit1；新增r0a4-combo-regression.test.ts有5处TS2740 |
| 独立验证 | 8个正常/阻断对照、5个后端反例观察、27个实际页面handler场景；verification.json保留结果与源码SHA256 |
| 数据与外部影响 | 内存Prisma/支付/赠送/迁移IO替换；只新增本目录审核材料，无真实额度发放、外部收费或业务库操作 |
| 未验证与下一关口 | 浏览器DOM、真实MySQL/并发/历史全量测试残留、生产构建均未由本轮验证；执行IDE-R0-A5-PROMPT.md后复核 |

## E1 / P1：一致性校验没有比较资源和赠送，仍会使用变化后的配置

位置：`src/lib/workspace-upgrade-service.ts:108–125`。

当前仅比较key、priceMonthly、priceYearly、purchasable四项，通过后`targetConfig=curr`。实际写入依赖的maxMembers/maxStorage等，以及trialGift的enabled/points/expireDays完全没有比较。

真实route+套餐服务+provision/upgrade组合验证：

- 首次：免费STANDARD、成员上限2、存储100MB、赠送关闭。
- 命名IO边界模拟管理员变更：价格/key不变，成员上限99、存储900MB、赠送开启777点/30天。
- 第二次核验通过，返回HTTP200/free:true；最终空间/配额使用99席位、900MB，并调用赠送入口请求777点。

这些数值是测试夹具，不是实际运营配置。赠送入口为记录参数的stub，**没有真实发放777点，也没有线上亏损证据**。需要请求执行期间发生配置变化，不能说用户可任意指定777点。可确认的是：前批要求“资源/赠送变化则拒绝”，本批没有做到，且成本相关副作用已经进入调用路径。

修复：比较实际写入及成本相关的规范事实，包括资源、功能权益、赠送开关/数量/期限等；全部一致才继续使用已确认配置。不能只补maxMembers而遗漏其他实际使用字段，不能用整个展示DTO任意序列化来混入无关排序/营销文案。列明字段与写入用途。

## E2 / P2：retain仍在最终核验之前写入，业务错误又被包装成500

位置：`src/lib/workspace-upgrade-service.ts:423–452`；`src/app/api/workspace/upgrade/route.ts:294–306`。

最终核验在upgradePersonalToEnterprise里，而retain先workspace.create/workspacemember.create再调用它。真实调用链中模拟首次免费、之后改价或停用，两种情况均：建空间→建成员→最终拒绝→删除成员→删除空间。响应为500，error为“创建升级订单失败”，稳定错误码只出现在details。

本轮补偿成功，最终只剩原空间、无账单/迁移；不声称已产生线上残留。但不满足明确要求的“核验拒绝前业务写调用0”。页面也无法从message/error得到“套餐已变化，请重新确认”的正确原因。

修复：把自助最终核验放到provision所有分支第一次写入之前，传递同一核验结果；不能最终核验后在更深层再读另一份配置导致先写后拒绝。保留直接调用底层服务的安全边界。对已知配置变化/停用/读取失败返回稳定错误码与中文message及合适4xx/503，不一律变500，不伪装开通成功。

## E3 / P1：管理员/签约的内部provision仍能进入危险迁移

位置：`src/lib/workspace-upgrade-service.ts:61,369,389–395,446–458`。

provision只在option=delete且source=SELF_SERVICE_PURCHASE时拒绝。虽然底层upgradePersonalToEnterprise新增了`input.option===delete`守卫，provision调用它时**没有传option**，因此这层守卫不会阻止ADMIN_MANUAL/SALES_SIGNUP的provision迁移。

本轮直接调用真实provision，分别传这两个内部来源，在赠送迁移IO处注入失败：实际先建企业并移动资产，再cleanup删除目标，资产引用指向不存在的空间。报告称“所有来源均阻断”与代码不符。

边界：当前找到的生产provision调用者是自助路由和订单履约，它们均已拒绝delete；当前管理员路由直接调用不搬资产的底层upgrade。**本轮没有证明普通用户能通过公开接口利用这一内部绕过**。但本次指令明确要求所有来源的危险迁移停用，不能把可直接调用的服务留为危险通路。

修复是小范围止血：provision入口对delete不分来源拒绝，并核对调用参数传播/其他实际可达入口。不要为了通过测试恢复迁移、改账务、自动退款或重建分布式事务。历史订单保留原状态，清楚列待人工处置。

## E4 / P2：本轮类型检查确实失败，不能采信报告的“exit0”

命令：`.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json`。

实际exit1，5处TS2740，均在`src/app/api/__tests__/r0a4-combo-regression.test.ts:296,314,329,343,362`：将数据库原始行fixture作为WorkspacePlanConfig传给verifiedPlanConfig，缺maxConcurrency、maxSingleFileBytes、maxModelAllocations、maxByoModels等必需字段；trialGift形态也应按真实DTO定义。

Vitest转译通过不会代替TypeScript类型检查。修复应使用完整、正确的服务配置fixture或由真实严格读取获得DTO，不用as any/@ts-ignore、削弱生产类型、排除测试或改tsconfig掩盖。报告所称构建通过没有可核对日志，本轮不据此认定当前源码可构建，也没有重跑生产构建。

## E5 / P2：页面测试复制了逻辑，未测试实际页面；可见禁用提示不完整

位置：`src/app/api/__tests__/r0a4-combo-regression.test.ts:375–431`、`src/app/workspace/upgrade/page.tsx:179–186,483–484`、`src/components/workspace-hub/modals/UpgradeModal.tsx:264–285`。

- processUpgradeResponse是手写的简化副本，并未从TSX提取或导入实际handler；不能称“模拟handler提取”，也没有覆盖两个弹窗/HTTP/网络错误。
- 实际独立页先判断payUrl，再判断result.success。HTTP200、`success:false`但带payUrl仍提示订单已创建并跳转。两个弹窗对同样响应会拒绝。当前后端正常路径未见返回该矛盾形态，此项是协议防御缺陷，不是已经扣款或授予权益的证据。
- 独立页迁移卡片用了pointer-events-none，点击提示不会触发；卡片仍展示完整搬迁能力，没有直接写暂不可用。中枢卡片点击会提示，但初始仍像可用方案。应直接展示不可用标签/原因，不依赖不可触发的点击。

本轮直接执行三个实际TSX handler共27场景：正常待支付及真正免费完成正常；free但缺空间、success:false/free:true原反例已修复；上述失败带payUrl场景仍可复现。未做浏览器DOM验收。

## 交付记录与授权边界

R0-A4报告已更正PENDING不等于收款、git restore建议来源、前批未保存快照，方向正确。也明确承认上一轮执行过纳入真实Prisma集成测试的全量命令。**当前无法确认当时连接环境及残留影响，不能写已无影响，也不据此声称污染了生产库。** 本轮没有重跑全量测试、连接数据库核查或做清理；真实库调查/清理需单独批准。

报告仍未保存本批开始快照。本轮当前git diff不是独立批次补丁，不能声称精确回滚到先前未提交状态。新批次开始应保存可核对快照；历史缺失如实登记，不编造。

## 实际命令

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
4files、83passed、exit0。

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
exit1，5处TS2740，详见E4。

node docs/reviews/R0-A4-independent-review/verify.cjs
exit0，8个对照、5个后端反例观察、27个实际handler场景。
```

本目录脚本的断言记录本轮反例存在，后续不修改它制造通过，另建正确回归。内存IO不证明真实MySQL事务/约束/线上发生率，页面handler执行不等于DOM或浏览器测试。源码哈希见verification.json。
