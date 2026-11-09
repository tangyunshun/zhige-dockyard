# R0-C独立审核：企业转个人止损通过，按约定冻结

日期：2026-11-07（Asia/Shanghai）。结论：**C01—C08在约定的源码与隔离范围内通过，关闭R0-C止损批次，不追加C1。** 原F06的企业资产转个人功能保持暂停，尚未恢复为安全迁移/退款功能。

本轮只新增审核材料，未修改业务源码、真实业务数据或历史报告。R0-A/R0-B已冻结的验收不重开；没有把一般加固列为本批新阻断项。

## 1. 固定验收结果

| 项 | 实际核验与结论 |
| --- | --- |
| C01 服务直接调用 | 完整真实credit-service模块的recycleEnterprisePool统一抛ENTERPRISE_POOL_RECYCLE_DISABLED，开启事务前拒绝；付费/赠送来源均零事务、零业务写 |
| C02 空间OWNER/ADMIN | 真实workspace POST均返回409、success:false和稳定code；无扣池/加钱包/新桶/成功账务 |
| C03 平台后台 | 真实admin POST同样409，无向owner或任意接收者转点，无成功通知 |
| C04 身份边界 | 未登录401；非成员、普通成员、无平台管理权限403；响应不包含成功余额结果；权限IO为身份夹具，非线上RBAC验证 |
| C05 重复与并发 | 服务重复调用及三种有资格角色各6次并发全部拒绝；池100、原桶100、钱包0不变，事务与业务写为0 |
| C06 真实入口 | 18项受控页面/handler检查通过，三个入口显示暂停、执行控件禁用，防御handler不发回收请求、无成功Toast；旧页HTTP由后端拒绝 |
| C07 相邻功能 | 26个相邻账务函数/局部函数内容与开始副本一致；5个关键余额读取/阈值/充值handler保持；成员→企业池路径未修改。不是用非法输入测试证明合法转账已做真实验收 |
| C08 冻结回归 | 218项定向测试、21项收银台检查、类型检查通过；11个先前审核记录中的其他源码文件哈希保持 |

实现符合上一轮授权：在服务入口直接拒绝，两个API保留身份校验后诚实暂停，页面停止执行危险转移。没有新增可开启后门、清理旧桶或恢复转个人策略。两个API的重复错误包装可以后续整理，不作为本批新增任务。

## 2. 本轮重新执行的验证

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
6 files / 218 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
exit 0，无诊断输出

node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs
18/18 checks passed，exit 0

node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs
21/21 checks passed，exit 0

node docs/reviews/R0-C-independent-review/verify.cjs
exit 0；10组真实服务/接口组合、6组开始/结束副本、相邻函数与冻结源码检查通过
```

独立脚本执行真实模块/两个POST/只读guard，认证/权限、持久化、通知等IO封闭替换。服务与接口没有被mock成拒绝函数。6份开始副本哈希与上一轮next-pool-verification一致，结束副本与manifest及当前文件一致；没有改写旧脚本让历史证据变绿。

审核脚本自身开发中，初次使用“相邻函数数目>20”的无依据数量断言，以及未识别useCallback包装的函数提取器而失败；随后改为检查真实所需函数存在、逐项比对全部函数，并识别包装函数。未改变业务源码或放宽业务零写/权限/快照验收。

## 3. 事实边界与本批状态

| 项 | 状态 |
| --- | --- |
| 目标用户流程 | 企业池管理/充值回收入口清楚说明暂停；直接请求不能改变资产 |
| 页面变化 | 暂不可用、原余额保留；相邻余额和阈值入口保持 |
| 后端闭环 | 服务与两API均拒绝，零事务/业务写；旧页无法绕过 |
| 实际数据与费用影响 | 本轮只新增审核文件；零真实库、支付、模型、迁移、seed、补账、清账、退款或部署 |
| 自动化证据 | 218项定向测试+18项相关页面+21项收银台+类型检查+独立组合通过 |
| 未完成 | 企业资产转个人的授权政策及安全迁移恢复；历史账务核查；真实浏览器/库/渠道/运营发布门 |
| 发布性 | 只签收本批源码/隔离止损性质，不宣称生产就绪或回收功能完成 |
| 下一关口 | 原方案F07人工退款权限与错误发放止损，见本目录IDE-R0-D-PROMPT.md |

不为“看起来功能完整”恢复已明确不安全的转移；也不把暂停说成完成完整退款/迁移。恢复依赖仍按C报告列出，不在本轮偷偷实现或批准。

## 4. 下一批仍沿用原方案F07，有当前代码证据

以下属于下一批旧风险，不影响C通过：

- `src/app/api/admin/refund-requests/[id]/resolve/route.ts`向权限系统只请求order:read，却可APPROVE/REJECT；权限目录实际已有order:refund_approve，不能把查看权当资金裁决权。
- APPROVE按申请单points调用真实grantPoints(scope=WALLET)，没有从任务净实扣扣除既有自动退点，也不按原扣款来源恢复。
- 用户POST只累计本人CONSUME，已经自动退过的任务仍能申请原扣点总额。

独立执行真实用户POST→真实管理员APPROVE→真实grantPoints（所有持久化/权限等IO为夹具）复现3组：

| 原始事实 | 当前结果 |
| --- | --- |
| 企业池扣100，尚未退 | 人工批准给申请人钱包加100，改变原企业资金归属 |
| 企业池扣100，已自动退100 | 仍可申请100并批准，个人钱包再加100；任务REFUND累计200 |
| 个人钱包扣100，已自动退100 | 仍可申请并批准，再加100，钱包200；任务REFUND累计200 |

权限夹具只批准路由实际请求的order:read，三组均成功；拒绝该权限的对照为403且零写。因此证据证明路由权限请求不当及受控数据下重复/错来源发放，不代表实际部署角色、中间件配置、生产数据或已经发生的损失。

证据：`next-refund-verification.json`及`verify-next-refund.cjs`。审批幂等键按申请单去重，不能阻止另一个自动退款路径对同一任务退过后再次人工发放。

下一批限定为人工退款审批安全止损：使用既有专用审批权限；暂停当前不能证明净额与原来源的人工批准加钱包；保留正常自动失败原路退款、工单受理/查询/有权限驳回。完整统一退款引擎与争议补偿政策另列后续，不能在这一小批中同时重写。
