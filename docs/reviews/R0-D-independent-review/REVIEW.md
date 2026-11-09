# R0-D独立审核：人工退款止损通过，按约定冻结

日期：2026-11-07（Asia/Shanghai）。结论：**D01—D08的源码/隔离范围通过，关闭R0-D止损批次，不追加D1，不重开R0-A/B/C。** 完整退款引擎、真实环境与发布验收仍是独立后续工作。

本轮只新增审核与交接材料，未改业务源码，未删除清理候选、scratch、审核目录、快照或测试。用户插入的清理选择已经结束，不扩展本轮范围。

## 1. 固定验收结果

| 项 | 核验结果 |
| --- | --- |
| D01 专用权限 | 真实resolve路由对APPROVE/REJECT均请求order:refund_approve；只有order:read的夹具403，未登录401。权限拒绝前不读指定申请，不写工单/资产 |
| D02 批准零写 | 有专用权限仍409 MANUAL_REFUND_APPROVAL_PAUSED；返回在读取申请之前，工单PENDING、资产不变，无人工退点/成功通知 |
| D03 来源及已自动退款 | 钱包、企业、个人赠送、已自动退点夹具均不能走人工加钱包路径；原资产和历史流水保持。缺失/混合等完整组合以本轮定向套件为附属证据，不声称净额引擎已实现 |
| D04 重复/并发 | 不同来源各8次并发人工批准全部409，零资产及成功状态写；没有通过换申请幂等键恢复加点 |
| D05 合法驳回 | 有专用权限可合法REJECT，不加点；理由/已处理限制保留；4路并发仅1次成功，其余409；状态条件真实求值并检查count |
| D06 查询/受理/撤销 | 用户POST→本人GET→后台列表/导出GET→本人DELETE组合可用；两个GET只读且返回暂停及参考金额能力事实；后台读取/导出分别请求order:read/billing:export |
| D07 页面 | 24项受控真实组件/handler检查通过：批准禁用、防御handler不发批准请求/成功Toast，用户说明暂停及参考值，驳回与历史入口保持 |
| D08 冻结与自动退款 | 234项定向测试、18项企业池页面、21项收银台和类型检查通过；credit-service整个文件及4个重要支付/展示helper与上一轮哈希一致 |

现有GET返回capabilities供调用方使用，两个页面主要使用固定暂停文案与禁止操作；资金安全由后端保证。上一轮“优先由GET提供能力事实”已落接口，不要求为展示接线再增加一个补修批次。

历史APPROVED状态/流水仍保留，不将暂停变成自动驳回，不抹历史。完整净可退额、来源守恒与自动/人工统一并发恢复均未在本批实现，报告没有把止损冒充完整退款功能。

## 2. 重新执行与证据

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
7 files / 234 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
exit 0，无诊断输出

node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs
24/24 checks passed，exit 0

node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs
18/18 checks passed，exit 0

node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs
21/21 checks passed，exit 0

node docs/reviews/R0-D-independent-review/verify.cjs
exit 0；10组真实接口组合、5组开始/结束副本、5个冻结文件校验通过
```

独立夹具执行真实resolve POST、用户GET/POST/DELETE、后台GET，权限IO按真实请求键求值；持久化记录读/写及前后资产。APPROVE夹具记录申请读取0、业务写0；REJECT允许工单状态写但不产生资金写。不是把被修路由mock成拒绝。

开始副本5份与上一轮next-refund-verification对应哈希一致，结束副本与manifest及当前文件一致。credit-service中的原路自动退款实现完整文件零差量；这不代替对所有调用者及真实任务失败的线上验证。

本轮未采用IDE报告提到的临时换入旧源码复现方法，未切换/恢复当前业务文件。报告称“临时替换后恢复”不应被称作完全未触碰工作区；当前恢复哈希已核对。后续对照应在VM双加载或隔离副本完成，该过程说明不重开已通过的功能项。

## 3. 状态与限制

| 项 | 当前结论 |
| --- | --- |
| 目标用户流程 | 可提报/查询核查诉求；人工批准明确暂停；合法驳回保持 |
| 用户可见结果 | 不再承诺人工批准立即退钱包；累计扣点标参考；自动退款没有被本批全局暂停 |
| 后端闭环 | 专用权限前置，APPROVE先于查询/资金写拒绝，REJECT条件裁决 |
| 本轮真实数据/费用影响 | 只新增审核文件，零真实库/支付/模型/退款/迁移/seed/清账/部署 |
| 自动化证据 | 234项定向测试、24+18+21项受控页面、类型检查、独立接口/快照验证 |
| 未验证 | 真实部署RBAC/中间件、MySQL并发、浏览器DOM、实际渠道、生产数据与历史损失 |
| 未恢复能力 | 人工批准净额/原来源退点与企业转个人的安全恢复，继续按原路线图独立处理 |
| 发布性与下一关口 | 仅本批源码/隔离止损通过；下一批原F08生产模拟支付入口，不宣称生产就绪 |

## 4. 下一批原F08的当前事实

原方案RESTRUCTURING-PROPOSAL.md的F08已经列明：production显式配置mock仍能进入MOCK确认并发点。本轮仅刷新该旧风险，不增加新需求，不影响D通过。

实际加载当前payment-gateway.resolvePaymentMode/createCharge、mock确认GET/POST、grantPoints/getBalanceSummary及期限helper，使用完全模拟的process.env、内存PENDING订单与持久化：

- NODE_ENV=production、PAYMENT_MODE=mock（包括大小写/首尾空格变体）：解析MOCK，生成模拟收银台地址，GET200，POST200，真实grantPoints代码给钱包加100，订单SUCCESS、metadata.paymentMode=MOCK。
- production+real、未配置、非法值：按当前规则REAL，模拟GET/POST均403，无业务写。
- development+mock、test未配置：原有联调MOCK可用。

未读取真实环境/密钥，未创建真实支付、访问供应商或连接业务库；订单为内存预置，没有执行实际payments/create POST。证据证明此配置下的代码风险，不声称生产当前正在用mock，也不证明已经发生现金损失或真实模型成本。

证据：next-production-mock-verification.json及verify-next-production-mock.cjs。下一批必须明确拒绝生产显式MOCK，不能默默把它改成REAL并发起真实渠道下单；仍保留非生产联调与已有可信真实回调。

固定范围与E01—E08见IDE-R0-E-PROMPT.md。
