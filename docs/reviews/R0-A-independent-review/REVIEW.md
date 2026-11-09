# R0-A 独立审核：暂不通过，需同批补修

日期：2026-11-05（Asia/Shanghai）。审核对象：当前工作区源码、IDE交付报告和定向测试；不是生产部署验收。

## 已确认有效的修改

- membership/upgrade不再直接更新会员、余额或创建成功订单，原重复补余额路径已从该入口移除。
- workspace/upgrade-plan POST不再直接开通套餐或修改配额。
- 两个企业创建入口对正常正价套餐均有阻断；配置缺失不再从这两个企业创建分支回退常量后直接建企业空间。
- WorkspacePlanSection失败分支已删除onUpgraded调用。

## 独立验证

1. 已检查测试导入链的Prisma/认证/装配/赠送等隔离mock，然后独立运行本地已安装Vitest：`node_modules/.bin/vitest.cmd run src/app/api/__tests__/r0a-business-boundary.test.ts`，18/18通过。
2. 独立运行 `node_modules/.bin/tsc.cmd --noEmit --incremental false -p tsconfig.json`，exit 0，通过；未运行应用、生产构建或业务脚本。
3. 新增独立离线取证 `node docs/reviews/R0-A-independent-review/verify.cjs`，观察到5个反例场景，详见[verification.json](verification.json)。真实源码函数在隔离VM中运行，数据库、认证、开通副作用均stub，没有真实费用或业务写库。
4. 未做浏览器渲染/真实用户验收、线上数据库和配置核对，也未验证实际损失。

## 必须修复的发现

### A1 / P1：零价格被误当成免费资格，未限制既有免费基础档

位置：`src/lib/workspace-plan-service.ts:259`（免费判定）及两个企业创建调用者。

当前函数只要真实行启用、可在线、月年价格为0就返回FREE，并未验证该行属于项目既有免费基础档。价格为0可能来自schema默认值或未批准的配置，不能代替免费资格。原任务明确禁止其他未批准零价档。

独立复现：提供零价PRO记录，两条真实创建handler均返回200并调用workspace.create，写入plan=PRO及其高阶配额。第一个入口还调用装配与赠送helper（均stub；不代表真实发放）。这证明任务边界未满足，不代表当前生产有该零价配置。

要求：引用现有DEFAULT_WORKSPACE_PLAN等已定义免费策略，严格核验免费身份及真实价格；不在本批新增免费PRO/CUSTOM政策。价格检查应为安全、非负整数，负价不能归类成正常PAID。

### A2 / P1：企业门禁越界影响个人空间创建

位置：`src/app/api/user/workspaces/create/route.ts:90`。

原逻辑的企业套餐可用性检查只在ENTERPRISE分支，本次将verifyEnterprisePlanForCreation放到分支外。因此PERSONAL创建也依赖企业套餐purchasable和价格，违反“个人空间分支不修改”。

独立复现：PERSONAL请求，在STANDARD价格为正时返回402“需在线购买”；STANDARD行缺失时返回503。旧代码个人分支使用既有配置读取兼容，新增行为会造成条件性回归。只有“STANDARD恰好零价”这一条正向测试不足以证明个人空间未受影响。

要求：将本批企业付费资格门禁限定到ENTERPRISE，恢复并明确个人初始化原有业务语义；不能为了免费企业安全而让所有个人注册路径依赖企业购买资格，也不能移除企业分支新增保护。

### A3 / P1：相关个人转企业入口仍用宽松回退来决定免费开通

位置：`src/app/api/workspace/upgrade/route.ts:172`，以及 `src/lib/workspace-plan-service.ts` 既有读取回退。

目标配置查询失败/不存在时可回退常量；cycleAmount<=0就调用provisionEnterpriseUpgrade。它是本轮要求检查的邻近入口，与“不得按回退资费免支付授予权益”同一边界，不能因内部还包含迁移和资金操作就直接宣布不在范围。

独立复现：真实配置读取函数抛错，实际route仍因回退STANDARD价格0返回200并调用开通函数。开通函数本次是stub，因此只证明错误放行到开通边界；未证明当前线上已完成收费权益写入。实际服务仍使用相同宽松读取，需要在修改前继续核对。

要求：自助升级写路径严格核验真实目标配置与免费资格；查不到、异常、非法或未知目标不得创建订单/迁移/发放。合法正价的既有PENDING支付流程与免费直接开通明确分开，不因此重做付款履约/席位/资金算法。无法安全修补时阻断受影响路径并列停止项，不能继续标记“无绕行通过”。

### A4 / P2：页面仍有与后端相反的开通承诺，错误提示优先显示机器码

位置：`src/app/pricing/page.tsx:1025`、`src/components/pricing/WorkspacePlanSection.tsx:215`、`src/hooks/useEnterpriseWorkspace.ts`和`src/app/workspace-hub/create/page.tsx`的错误分支。

会员弹窗子内容仍写“演示支付：选择任一方式即可完成开通”，并保留支付方式选择；刚修改的正文却说暂不开放，后端一定拒绝。同时新增后端中文在message，部分调用者优先展示error机器码。未经部署事实核实，也不能将整个系统称作演示环境。

要求：删除矛盾的支付/开通承诺，使用明确的暂不可购买状态，不让用户先选支付方式再执行注定失败的操作；错误优先显示可理解message。失败不回调成功、不跳转、不清空输入。

### A5 / P2：创建页仍把用户所选高级空间静默变成STANDARD

位置：`src/app/workspace-hub/create/page.tsx:384`（请求）及`:888`（spaceType选择）。

页面让用户选择PRO/ENTERPRISE并展示其说明，提交却不带该选择，后端按默认STANDARD创建并返回成功。此问题虽早已存在，却直接影响本批明确要求“不得静默将用户选定付费档换免费档”。IDE报告已识别而未处理。

要求：暂不可购买目标清楚显示不可购买并阻止提交，或如实提交目标让后端拒绝；用户主动选择免费基础方案才创建。不能假成功。使用现有套餐来源，不新写一份价格表。

### A6 / P2：验收报告与测试证据存在不一致

位置：`src/app/api/__tests__/r0a-business-boundary.test.ts:82`、`:229`及 `docs/reviews/R0-A-fix-report.md:66`、`:121`、`:127`。

- validateUser始终返回USER，名为管理员的测试未切换角色；未覆盖真实未登录、账号拒绝等返回值。
- 未覆盖零价非基础档、配置抛错、个人分支受企业收费影响、邻近升级回退、前端状态。
- 装配与赠送mock不是spy，所谓“未调用”没有直接断言；测试没有覆盖页面，不应把后端拒绝当作前端完成证据。
- 同一报告既称无遗留绕行通过，又列出相同付费边界仍有回退放行。
- 在已有脏工作区建议git restore整文件回滚，可能覆盖同文件既有工作，不应按该建议执行。
- upgrade-plan POST注释/报告称保留归属检查，实际仅身份后统一拒绝。当前统一拒绝并无因此写权益，但报告应准确描述，不能声称未实施的检查通过。

要求：增加可切换的认证/角色/归属fixture，断言写入和副作用；页面行为单独验证；更新报告为通过/失败/未验证，回滚仅撤销可识别的本批差量。

## 审核结论

R0-A已降低两个旧入口直接开通的风险，但仍有门禁策略遗漏、个人流程回归和用户状态矛盾，暂不签收、不进入新批次。仅需补同批边界，不要求此时处理全部商业化和费用问题。

补修提示词见[IDE-R0-A1-PROMPT.md](IDE-R0-A1-PROMPT.md)。修复后保留原始IDE报告，新增补修报告并更正相关结论。独立取证脚本保留为历史观察，不把缺陷存在断言作为修复后的回归标准。
