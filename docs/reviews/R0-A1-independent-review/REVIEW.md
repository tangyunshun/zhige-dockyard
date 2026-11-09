# R0-A1 独立审核：暂不通过，需针对开通调用链补修

日期：2026-11-05。审核对象为当前工作区，不是线上部署或真实资金损失判定。未修改业务源码、未连接真实数据库、未调用付费服务。

## 1. 已确认改善

- 两个企业创建入口不再把零价PRO直接当免费基础档。
- PERSONAL分支已恢复既有配置读取路径，不再执行企业购买门禁。
- 企业创建页提交了plan，非基础选项有不可购买提示及提交限制。
- 会员弹窗原“任选支付方式即可开通”内容已移除。
- 认证fixture已能切换角色，部分装配/赠送/支付测试改用spy。

## 2. 独立验证

- 经检查导入链后运行本地Vitest定向测试：`node_modules/.bin/vitest.cmd run src/app/api/__tests__/r0a-business-boundary.test.ts`，39/39通过。
- 运行 `node_modules/.bin/tsc.cmd --noEmit --incremental false -p tsconfig.json`，exit 0。
- 新增本目录`verify.cjs`，隔离运行**真实route、真实套餐读取与真实provision/upgrade服务**，仅Prisma、认证、支付、通知等外部副作用使用stub，复现5个反例场景。见[verification.json](verification.json)。
- 未做真实MySQL事务/渠道验证或浏览器渲染。隔离观察不能证明线上已经发生相同损失。

## 3. 阻断签收的问题

### B1 / P1：目标套餐未绑定，省略参数可“核验免费，开通收费”

定位：`src/app/api/workspace/upgrade/route.ts:173`及`:202`；`src/lib/workspace-upgrade-service.ts:90`、`:272`。

route将缺失targetPlan归一为STANDARD并按其0价免支付，但传给provision的仍是原始targetPlan（undefined）。后续upgrade服务对undefined重新从可购买套餐排序中选择目标，并不必然是STANDARD。

**完整真实调用链隔离复现：**存在合法0价STANDARD、付费PRO排在STANDARD之前；用户有个人空间所有权和企业名额；请求省略targetPlan、option=upgrade。返回200/free:true，空间变为PRO，写入金额19900分的SUCCESS账单，支付函数调用0次。金额为测试fixture，不是生产定价。

这个路径证明IDE报告“深层最多降级，不会免费授予高阶”的判断不成立。没有查询线上排序，故不声称当前线上必然可触发。修复必须绑定同一服务端规范目标与核验事实，不能只补前端必填。

实际网页`src/app/workspace/upgrade/page.tsx:158`提交体就没有targetPlan，因此不是只有人工构造请求才会省略该参数。两处UpgradeModal则会传targetPlan，应一并核对兼容。

### B2 / P1：所谓严格读取丢掉停用状态，并在核验前清洗价格

定位：`src/lib/workspace-plan-service.ts:194`、`:200`、`:76`；`src/app/api/workspace/upgrade/route.ts:179`。

getWorkspacePlanStrict直接返回dbToConfig(row)，该DTO不含isActive，route只检查purchasable，停用套餐仍可开通。真实链隔离复现isActive=false、STANDARD 0/0仍返回200并变为企业空间。

dbToConfig还先执行Number(row.priceMonthly || 0)，使null/undefined/NaN等值可能先变成0，再通过route后置整数校验。null价格场景隔离复现免费开通。**schema当前价格为非空Int，null不是正常MySQL行的预期值；该反例证明错误的验证顺序和不完整数据处理，不能冒充已验证的生产空值漏洞。**停用状态遗漏使用普通合法schema数据即可触发。

应先对原始行核验目标、active、purchasable、安全非负整数价格，然后才转换展示DTO；不可将“查到行且不回退”当成完整严格核验。

### B3 / P1：免费基础条件仍不一致，零价高级档被送去0元收银台

定位：`src/app/api/workspace/upgrade/route.ts:192`、`:197`及下单分支；`src/app/api/__tests__/r0a-business-boundary.test.ts:471`。

- 注释/要求是基础档月年价格都0，但route仅检查当前周期cycleAmount===0。月0/年10000的STANDARD按月请求仍被当免费；与两个企业创建入口的规则不一致。真实链隔离复现200/free:true。
- 非基础PRO 0/0进入PENDING分支，创建金额0订单并调用createCharge(0)。隔离复现已确认；支付函数为stub，未完成真实支付/履约。现有测试竟将这种行为固定为期望成功。

0元订单不是已有“未批准零价高级档拒绝”的实现；模拟路径不会因此产生真实付款，真实渠道也未在本轮验证能接受。不能新创零价高级套餐购买政策来绕过本批止损。要求拒绝且不下单、不调用支付；只有合法正价保留现有PENDING路径。

### B4 / P1：自助开通服务仍重新宽松读取，核验结果未贯穿写边界

定位：`src/lib/workspace-upgrade-service.ts:90`、`:324`、`:380`。

route核验的配置未传入后续服务，后者仍可重新选默认或调用宽松读取，未落实上一轮“不能核验后又用回退替换目标”的要求。B1已给出具体可达后果。报告把该服务统称“支付履约层”不准确，它也被同一请求的免支付分支直接调用。

自助免支付开通必须贯穿明确的规范目标和免费授权事实；可以传服务端已验证配置或在写边界重验并拒绝不一致，不能接受客户端传来的trusted/paid/free标志，也不能影响已有管理员/线下授予职责而不说明。

### B5 / P2：错误提示、测试层级与报告回滚仍未按要求补齐

- `WorkspacePlanSection.tsx:215`仍优先toast(data.error)，`useEnterpriseWorkspace.ts:87`先error后message，`workspace-hub/create/page.tsx:409`也未优先message。后端中文说明可能仍显示为机器码。
- 当前39项测试将provisionEnterpriseUpgrade整体mock，无法发现核验STANDARD、实际选择PRO；缺少真实服务组合测试。
- 测试明确期望零价PRO创建0元订单，应更正断言，不可用测试通过证明其业务合理。
- 报告仍建议git restore至未提交的R0-A状态并删除本来已存在的测试文件，实际无法由git默认restore恢复该未提交快照，可能覆盖既有工作。不得执行，应改成事先保存的快照或可识别补丁级回滚。
- 尚未有前端行为测试或隔离浏览器证据；源码改善可认可，不能等同页面完整验收。

### B6 / P1：独立升级页把下单成功当成开通成功

定位：`src/app/workspace/upgrade/page.tsx:175`，及同文件`:158`请求体。

该页面省略targetPlan，收到HTTP成功就Toast“升级成功”，写personalWorkspaceUpgraded等本地标记并返回中枢，不区分返回payUrl/PENDING还是实际free开通。若默认目标是合法正价，route只创建待支付订单，页面也会显示已升级；与已经处理payUrl的两处UpgradeModal逻辑不一致。

这是同一自助升级链路的用户状态问题。需要把待支付、已开通、失败分开，不能先写成功标记；目标必须来自服务端支持/用户确认，并在服务端严格绑定。未运行浏览器，以上为可达源码分支确认。

## 4. 结论

R0-A1已有多项修复有效，39项测试与类型检查通过；但费用门禁在真实服务组合中仍失守。暂不签收，不进入新批次。本次补修应聚焦“核验哪一套餐就只能开通哪一套餐；无完整免费授权就不免支付开通”，而不是继续只在route外层增加mock断言。

同批补修指令见[IDE-R0-A2-PROMPT.md](IDE-R0-A2-PROMPT.md)。既有会员/直开套餐旧入口的拒绝、两个企业创建保护、PERSONAL恢复应保留，不能回退已有效的修复。
