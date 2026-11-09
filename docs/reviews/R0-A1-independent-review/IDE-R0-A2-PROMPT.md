# IDE 同批补修 R0-A2：套餐核验与真实开通必须使用同一目标、同一授权事实

项目：D:\Project Development\ZhiGe-Dockyard\zhige-dockyard-web。

R0-A1独立审核仍未通过。请只补修本文件指定的自助升级权益边界，保留已有有效修复，完成后停止交回审核，不进入下一批，不发布。

## 1. 开始前

阅读AGENTS.md、docs/PROJECT-DEVELOPMENT-CHARTER.md、R0-A/R0-A1原任务，以及本目录REVIEW.md和verification.json。先核对真实源码，再说明理解、文件范围与验证方式。

git工作区含大量未提交内容；禁止reset/clean/restore整文件或删除既有测试。记录本批修改前快照和最小差量。旧报告保留，不重写成“历史一直通过”。

## 2. 本次必须修复的真实问题

B1：workspace/upgrade将缺失targetPlan按STANDARD核验，却把原始undefined传给provision。实际服务又选择排序最前的可购买套餐。独立审核以真实route+真实plan服务+真实provision/upgrade服务、内存Prisma重现：STANDARD免费、收费PRO排序靠前，省略targetPlan就free:true开通PRO，未调用支付还写SUCCESS账单。

B2：getWorkspacePlanStrict调用dbToConfig，丢失isActive并先将非法/缺失价格清洗成0，后置校验失效；停用STANDARD仍开通。null价格仅为不完整记录稳健性反例，不是正常MySQL非空Int行事实，不夸大线上影响。

B3：免费分支只检查当前周期0而不是月年都0；未批准零价PRO被创建0元PENDING订单并调用支付，现有测试错误地期待此结果。

B4：开通服务没有使用前面核验结果，仍选择默认/宽松读取。报告称其“只会降级”不成立；它也被免支付分支调用，不是仅供支付回调。

B5：中文message仍被机器码覆盖，报告仍建议git restore到并无提交快照的旧状态；缺少真实服务组合回归。

B6：workspace/upgrade/page.tsx不传targetPlan，收到200便写已升级标记、提示成功，不区分PENDING/payUrl与真正开通。两处UpgradeModal已部分处理payUrl，行为不一致。

## 3. 实现要求

### A. 固定服务端规范目标，贯穿写入

重点：
- src/app/api/workspace/upgrade/route.ts
- src/lib/workspace-plan-service.ts
- src/lib/workspace-upgrade-service.ts中本次自助免支付调用边界

目标为空/缺失时，要么明确拒绝并同步所有调用者，要么由服务端按既有政策选定唯一目标。无论哪种，规范化后的真实key必须用于查询、资格判定、传入开通服务、订单metadata和实际workspace.plan，不得一路STANDARD、下一路undefined再重新选默认。

拒绝非字符串、空白、未知等非法目标，不能借toString或常量回退猜测授权。若保留默认，则返回/展示清晰目标，不自动挑更贵套餐。

免费开通的服务端已验证配置/授权事实必须贯穿provision→upgrade写入边界，或由写边界重新严格核验并拒绝与已确认目标不一致。不要用客户端trustedPlan/free/paid/source字段获得信任。

不得前面严格读，后面又宽松读覆盖目标或改资源；配置发生不一致时安全停止/要求重新确认，不自动变成收费或更高级权益。实际写入套餐、配额和记录必须来自同一核验目标。复用现有事务/服务边界作最小修改，不引入新支付类型或大规模迁移。

保留管理员、签约和付费履约的既有职责边界；不能把管理员来源作为公网请求可选的免付款开关。若共享函数修改会影响它们，明确列调用者和兼容策略，必要时仅限定本次自助免支付来源。

### B. 先核验原始数据库记录，再转展示DTO

严格写路径应核验原始row：
- key与目标一致；isActive===true；purchasable===true。
- 月年价格是原始安全非负整数，不能先Number(x||0)再检查。
- 查不到、读取异常、停用、非法配置都明确拒绝，拒绝前不下单、不支付、不provision、不改类型/迁移/赠送。

只读展示兼容函数不在本批全局改写；但自助写入口不得使用其兜底结果授权。两个企业创建入口的既有保护保持一致，PERSONAL恢复保持，不回退已有效修复。

### C. 统一免费与下单条件

只有项目已定义免费基础身份，且真实月年价格都为合法0，才可免支付直接开通。

没有批准的零价高级档政策：PRO/ENTERPRISE等非基础档0价必须拒绝且无订单、无支付调用，不得借“PENDING0元订单”转成另一条免费开通路径。

基础档月0年正价/年0月正价不符合本批免费条件；不自行设计赠送周期，应拒绝或给出需确认规则的错误，不直接开通。

合法正价按原PENDING链路处理；若该周期金额<=0或不满足既有收费定义，应拒绝，不新增优惠/收费规则。不得把下单成功当成收款成功或开通成功。

### D. 修正实际调用者与页面状态

检查所有/api/workspace/upgrade调用者，至少：
- src/app/workspace/upgrade/page.tsx
- src/components/workspace-hub/modals/UpgradeModal.tsx
- src/components/studio/UpgradeModal.tsx

若目标改为必填，所有调用者必须从已有服务端配置/用户确认得到合法目标；不写死默认高级套餐。待支付返回只进入正确收银台/待支付状态，不显示已开通、不写已升级localStorage、不迁移页面状态。实际开通响应才显示成功；失败保留输入并展示具体说明。

同步修正WorkspacePlanSection、useEnterpriseWorkspace和workspace-hub/create的相关错误分支，优先可理解message，再兜底error，不能只向用户显示机器码。不要扩大到无关营销文案或全站UI重构。

## 4. 验证要求：必须包含真实服务组合

继续使用隔离Prisma、认证、支付、模型、通知、赠送与文件操作，不连接真实库或外部服务。

除了route单元测试，至少新增一组使用真实route+真实严格读取+真实provision/upgrade服务的组合回归。该组不得mock整个provisionEnterpriseUpgrade，不得mock掉导致错误的默认选择/配置转换；只stub持久化和外部副作用，明确不冒充真实MySQL事务测试。

必须覆盖：
1. STANDARD免费、收费PRO排序更前，请求省略/空目标：明确拒绝，或仅开通已核验STANDARD；绝不能无支付开通PRO。断言最终workspace.plan、配额与账单，而非仅断言函数被调用。
2. 显式免费STANDARD目标，三种option按实际分支验证不会重新选其他目标；不能在retain/delete路径核验前新建或迁移资产。
3. 真实停用/不可购买记录、缺失/读取异常、原始非法价格：零订单、零provision/迁移/赠送/支付。不要只测独立helper而不测真实调用链。
4. 免费身份月年均0才免支付；混合零/正价格不能免费。
5. 非基础档0/0：拒绝且不创建0元订单、不调用createCharge。修改当前“零价PRO应成功下0元订单”的错误断言。
6. 合法正价：只创建PENDING，不提前开通或成功记账；付款/履约仍是后续事实。
7. 改变套餐排序、缺失目标、第二次查询返回不同配置时，核验与写入不漂移；不可绕过写边界，不能伪造SUCCESS。
8. 已有两个企业创建保护、PERSONAL恢复、会员/套餐旧入口拒绝、不同角色/未认证/失败认证回归保持。
9. 页面收到PENDING/payUrl、真正开通、配置错误三类结果时，分别验证提示、跳转、localStorage/成功回调；message优先。可用隔离行为测试，不用连真实库页面点击试错。未做浏览器就明确未验证。

历史审核脚本及JSON保留，它们断言缺陷存在；不要修改旧脚本以制造通过。正式回归改为验证缺陷消除。

## 5. 运行与授权边界

只授权源码和隔离测试。不运行生产/共享库写入、迁移、seed、补账、退款、价格/权限同步，不读取打印密钥，不调用真实支付、模型、邮件短信。

测试先检查依赖导入链，再使用已安装本地工具定向运行；禁止全量npm test，因为部分现有测试连接真实MySQL。类型检查可用tsc --noEmit --incremental false。构建/浏览器无法保证隔离就报告未执行，不擅自放宽权限或试用真实服务。

不更改席位并发、企业池回收、人工退款、定价/免费额度/BYOK/结算开关，不把本批扩成R1。若写边界修复确需数据库迁移或新的收费政策，阻断受影响功能并停下说明，不按猜测实现。

## 6. 交回材料

新增docs/reviews/R0-A2-fix-report.md，逐条回应本次B1–B6：
- 文件差量、调用者兼容和工作区保护。
- 新增真实服务组合测试与实际结果、定向命令、类型检查。
- 页面行为证据和未验证项目。
- 资金/数据库/外部费用实际影响与证据边界。
- 遗留风险/停止项，不再以“该服务只用于支付/最多降级”代替实际调用分析。
- 仅基于本次事先保存快照或可识别补丁的回滚方法，不建议git restore整文件，也不删除原有测试。

状态只能为“R0-A2待独立复核”。完成后停止，不发布、不进入下一批、不宣称费用漏洞清零或保证盈利。
