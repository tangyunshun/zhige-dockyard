# R0-F2独立审核：通过，冻结原F09维护读写与审计批次

日期：2026-11-07（Asia/Shanghai）。结论：**H01—H06源码及隔离验收通过，R0-F/F1/F2冻结，不再追加维护审计补修。** 下一批只进入原方案F10订阅到期调度止损（R0-G）。本轮未修改业务代码。

## 1. 固定验收结果

| 项 | 独立核验 |
| --- | --- |
| H01 公告字段 | version/title/type/publishDate/isPublished/author/items逐项单改；日志前后值与独立保存的旧记录及实际存储一致，diff仅含该字段；实际创建ID、删除正文事实保持 |
| H02 计划字段 | title/type/status/isDowntime/startTime/endTime/manager/scope/description/actualResult逐项单改，实际变更均记录；缺失可选字段旧值明确null |
| H03 无变化 | 同内容新数组、全同计划及设置不虚构变化；数组顺序变化能识别；计划/模式/说明全同同步changed=false |
| H04 同步 | 仅模式变化、仅说明变化、计划与模式变化及关闭方向准确；说明旧值在写入前由同一事务读取 |
| H05 原子性与门禁 | 继承并重跑110个控制场景，含GET只读、40组未授权写、40组动作权限、同步AND、配置中途/审计/提交失败及双方向缓存回滚；无ROOT写逃逸 |
| H06 冻结回归 | 9文件316项、类型检查、各组件检查通过；3份开始副本与上轮独立哈希一致，当前3文件与结束哈希一致；8个保护文件未变化 |

独立审计观察32组，另对冻结副本/当前路由进行2组同输入对照：

1. 只改公告正文：旧版changed=false且空diff → 当前changed=true并有原/新正文。
2. 全同计划、模式及说明重复同步：旧版changed=true → 当前changed=false。

以上执行真实route/helper，身份、持久化和审计IO为封闭内存夹具；没有替换共享源码。固定范围内未发现需要继续补修的阻断项；不把无关风格或一般优化加入本批。

## 2. 实际执行证据

```text
.\node_modules\.bin\vitest.cmd run --no-color
  src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts
  src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts
  src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts
  src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts
  src/app/api/__tests__/r0a4-combo-regression.test.ts
=> 9 files / 316 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断输出

node docs/reviews/R0-F2-independent-review/verify.cjs
=> 110个控制、32组审计观察、2组冻结副本/当前同输入对照，PASS，exit 0

原管理页实际handler/onConfirm脚本受控执行，JSON重定向到本目录
=> 403/500/网络失败/成功4组通过；不是浏览器DOM

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs => 10/10，exit 0
node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs => 5/5，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs => 24/24，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs => 18/18，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs => 21/21，exit 0
```

实际差量已阅读：业务源码仅route中的字段提取、值比较和同步事实；maintenance.ts未改。测试新增用例范围与本批一致。本轮审核只新增本目录证据、报告及下一批提示词。

## 3. 当前状态与限制

| 项 | 结果 |
| --- | --- |
| 用户可见流程 | 访客维护查询只读；管理员合法修改保留、失败不伪成功；内容变更与重复提交有真实审计事实 |
| 后端闭环 | 专用权限/AND、事务内旧值/实际新ID、配置/审计/会话回滚、提交后缓存有隔离证据 |
| 数据与费用 | 零真实库/配置/会话/审计操作、迁移/seed/支付/模型/短信邮件/费用/部署；未修改业务源码 |
| 未验证 | 真实MySQL、部署RBAC、多实例缓存/并发、浏览器DOM、人工业务及生产发布；不据此再开本批一般优化 |
| 冻结范围 | R0-A/B/C/D/E保持；原F09的R0-F/F1/F2源码/隔离验收完成 |
| 下一关口 | 原F10：订阅到期调度缺凭证拒绝、禁止直接清零点数、到期写边界防止覆盖续费事实 |

不宣称全站无漏洞、真实交易/生产就绪、运营成本或利润已经验收。

## 4. 下一批F10当前代码证据

实际`src/app/api/cron/workspace-subscription-expire/route.ts`只在CRON_SECRET为真值时检查请求头；middleware把/api/cron列为公开前缀。实际处理器+合成env+内存Prisma复现：

| 场景 | 结果 |
| --- | --- |
| production未配置secret、匿名 | 200，读取2次，事务写2次，PRO→STANDARD |
| development未配置secret、匿名 | 同样放行，不仅是生产环境问题 |
| 已配置secret、错误key | 401，零读写（正向拒绝对照） |
| 正确key、回收开关false | 正常降级，余额850保持 |
| 正确key、回收开关true | 余额850→0，来源grant仍850、没有来源账务写（夹具哨兵） |
| 扫描后、事务写前空间已续费 | 仍被无条件改成STANDARD，续费期限被清空 |

后两项属于同一个订阅到期任务的安全写边界，不涉及新收费/回收规则。下一批通过暂停直接清零、保留来源资产解决账务风险，不实现完整到期点数回收引擎。续费竞态应在当前任务条件写/事务边界处理，不能靠扫描前检查。

旁边其他cron也存在类似旧鉴权样式，尚未在本批执行；不据此扩展R0-G为全部调度体系重构，也不能声称全部cron已修。请求侧套餐到期的全站权益体系未由本次证明；既有席位下单/履约已有到期拒绝，本次要求保持。

证据为next-cron-verification.json；全部为受控直接调用，不是线上事故或真实业务数据调查。下一批完整范围与验收见IDE-R0-G-PROMPT.md。
