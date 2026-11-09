# R0-G1独立审核：通过，冻结原F10订阅到期调度止损

日期：2026-11-07（Asia/Shanghai）。结论：**K01—K05源码/隔离验收通过，R0-G/G1冻结，不追加到期调度补修。** 本轮未修改业务代码，只新增审核证据、报告和下一批提示词。

## 1. 固定验收

| 项 | 独立核验 |
| --- | --- |
| K01 绑定矩阵 | null→q2、q1→q2、q1→null均0降级、skipped=1，外部已提交新事实保留，旧/新quota未写；null→null、q1→q1均合法降级 |
| K02 配置 | STANDARD缺失/0/-1均503及稳定码、零降级写；读取失败500且零写；4/7席准确使用；错误凭证在配置读取之前拒绝 |
| K03 原子保护 | 重跑31组既有控制中的续费/套餐/期限/绑定/归属变化、并发重复、各写点和提交失败回滚，未发现ROOT写逃逸 |
| K04 凭证与资产 | 三环境缺配置拒绝、错误key/token/查询参数拒绝、旧回收开关全部不清零及true暂停提示保持 |
| K05 冻结 | 10文件363项、类型检查和原组件检查通过；2份开始副本与上轮独立哈希一致，当前route/测试与结束哈希一致，9个冻结保护文件未变化 |

新增独立观察12组，另用开始副本和当前路由做2组同输入对照：

- null→q2：旧版仍降级，当前跳过并保留新绑定。
- 缺STANDARD：旧版按2席降级，当前503且空间仍PRO。

差量已逐项阅读：生产文件仅候选绑定条件、STANDARD可用性检查及必要注释；没有价格/账务/维护审计改动。0/-1采取本批已允许的“无法确定规则则阻断”方案，不表示产品决定了0/无限席位的商业含义；未来需规则确认也不能悄悄改写本批范围。

## 2. 实际验证

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
=> 10 files / 363 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断

node docs/reviews/R0-G1-independent-review/verify.cjs
=> 31个控制、12个观察、2组开始副本/当前对照，PASS，exit 0

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs => 10/10，exit 0
node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs => 5/5，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs => 24/24，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs => 18/18，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs => 21/21，exit 0
```

业务处理器真实执行，数据库/调度环境为内存夹具，固定合成时钟；事务串行与提交故障是受控模型，不能冒充真实MySQL锁测试。

## 3. 状态与下一关口

| 项 | 结果 |
| --- | --- |
| 用户/平台结果 | 无凭证不执行；有效到期处理保留点数；扫描后事实变化跳过；缺配置不猜席位数 |
| 后端闭环 | 当前订阅到期任务的条件写、关联核验、单空间回滚及准确计数通过 |
| 本轮影响 | 零业务代码修复、真实库/配置/会话/降级/支付/模型/费用/部署 |
| 未验证 | 真实MySQL、生产调度配置、其他cron及全站请求侧到期权益；不因此重启本批 |
| 冻结 | R0-A/B/C/D/E、原F09及原F10订阅到期调度止损范围保持冻结 |
| 下一关口 | 原F11：平台模型固定点数兼容路径，执行前成本未知/超预算时阻断；不擅自涨价、不启用真实结算 |

当前不是生产、全站安全或盈利验收。来源点数完整回收仍暂停，全站其他cron和请求权益不在本次签收范围。

## 4. 原F11当前事实：下一批只修执行成本准入

`POST /api/studio`的action=simulate实际走REAL_MODEL。当前固定收费为componentcatalog.estimatedModelTokens；平台模型执行前成本判断仍是`projectedPoints > rawCost * 2`，后面的成本底线巡检只告警。

本轮运行真实computeCostFloorFromPricing及从当前handler AST原样提取的成本if语句：

| 合成场景 | 本地成本闸门 |
| --- | --- |
| 固定100点、成本测算150点、markup=0 | 放行 |
| 固定100点、成本测算201点 | 拒绝（正向拒绝对照） |
| pricing缺失或两侧成本均缺失 | 跳过/放行 |
| 有输入价、输出价缺失，仍有输出预算 | 缺失输出按0计，仅算出1点并放行 |

代码差异也已核对：成本闸门用合同steps输出上限合计（缺失0），实际adapter.execute用目录estimatedOutputTokens×3或env/default2000；预检系统提示词未展开COST_BASELINE，真实调用前还可能展开。因此只把2倍改为1倍，仍不能证明成本预算覆盖真实请求。

证据见next-cost-verification.json。**这是局部成本分支与纯函数运行，加静态调用数据流核对，不是完整handler/真实调用复现，不证明所有其他门禁都会放行。** 下一批实现必须补真实handler的隔离集成证据。

商业边界：点数面值只是本次名义预算，不等于真实现金收入；赠送/会员/补贴来源、退款后的供应商沉没成本、运维/税费及目标利润仍需商业决策。当前默认markup注释不能覆盖总纲“售价与利润规则待批准”。下一批不发明毛利/补贴率，不把成本止损声称为盈利保证。
