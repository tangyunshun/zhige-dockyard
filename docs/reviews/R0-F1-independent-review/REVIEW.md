# R0-F1独立审核：审计事实主体已补齐，变更判定仍不准确

日期：2026-11-07（Asia/Shanghai）。结论：**R0-F1暂不签收；仍是原F-AUDIT/P2的一项残留，不进入F10。** 本次不修改业务源码，只提交审核证据与限定补修指令。

## 1. 一项问题的两个表现

### A. 已修改业务内容，审计却标记未变化

`src/app/api/system/maintenance/route.ts:63/74`中的scheduleFacts/releaseFacts只选择部分元数据；更新分支在316/460行仅遍历这些字段。实际持久化仍包含description/scope/actualResult/manager以及公告items/author。因此只改这些内容时，before/after是空对象、changed=false，即使数据库新值已生效。

实际route/helper+封闭内存IO复现6组：

| 动作 | 只改字段 | 持久化结果 | 审计结果 |
| --- | --- | --- | --- |
| update_release | items正文数组 | 已更新 | before={}、after={}、changed=false |
| update_release | author | 已更新 | 同上 |
| update_schedule | description | 已更新 | 同上 |
| update_schedule | scope | 已更新 | 同上 |
| update_schedule | actualResult | 已更新 | 同上 |
| update_schedule | manager | 已更新 | 同上 |

这不是仅增加理想日志字段：**changed=false与实际修改事实矛盾**。公告items也是当前管理页真实编辑表单提交字段（page.tsx:681—703），不是假设的未来API参数。原G02要求修改日志有实际前后变化，尚未完整满足。

### B. 完全未变化的计划同步，审计却标记有变化

route.ts:360同步分支固定`fact.changed=true`。将既有计划置为IN_PROGRESS，维护状态已true、说明与将写入的内容完全相同，再重复提交相同计划及syncMaintenanceMode=true：配置全部原样，审计仍changed=true。

这直接违反原G01—G03的无变化诚实记录要求。它与A是同一个“实际变更事实不准确”问题，合并修复，不分开排成新功能。

要求：审计比较覆盖当前计划/公告允许修改的业务字段；items按内容比较，避免数组引用不同造成假变化；计划同步按计划、维护模式和实际写入说明的差异决定是否改变，不固定赋值true。沿用现有审计表、接口、权限及事务，不新增系统。

## 2. 本轮已通过的范围

- 原“更新设置详情为空”已修：不传版本仍有设置目标及真实前后值，版本单改/混改、设置重复提交有独立控制。
- 原“创建缺生成ID”已修：计划/公告目标与实际生成ID一致，保留创建事实。
- 普通开关/DELETE解除维护有模式前后；开关说明/时长有事务内旧值、实际新值，清会话仅记数量而非原值。
- 标题等已选元数据修改、删除事实正常。存在上述内容遗漏不等于整套审计没有实现。
- 公开GET零写、拒绝权限零写、专用权限及同步AND、合法管理流程有效。
- 配置中途失败、会话清理后审计失败、回调完成后提交失败均回滚；双方向缓存保持原状态，未见ROOT写逃逸。
- 列表坏JSON/事务读取失败拒绝写入，不编造空旧值；管理页面确认、失败与成功处理保持。

独立验证复用上轮冻结的封闭IO夹具及110个控制场景，不修改其脚本/历史verification.json；另执行24组当前审计观察，其中7个反例归于上述唯一残留。三份F1开始快照与上轮独立哈希一致，当前三文件与IDE结束哈希一致；7个支付/账务/权限/页面保护文件未变化。

## 3. 实际验证

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
=> 9 files / 290 tests passed，exit 0（中断前本轮已执行；恢复后核对对应源码/测试哈希未变化）

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断

node docs/reviews/R0-F1-independent-review/verify.cjs
=> 110控制、24审计观察，复现7个残留反例，1个问题；NOT ACCEPTED
=> exit 0表示复现成功，不代表验收通过

原管理页实际handler/onConfirm脚本受控执行，JSON输出重定向到本目录
=> 403/500/网络失败/成功共4组通过；未运行真实浏览器或网络

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs => 10/10，exit 0
node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs => 5/5，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs => 24/24，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs => 18/18，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs => 21/21，exit 0
```

IDE新增18项用例未覆盖只改公告正文、只改计划说明或无变化同步，所以290项通过不能代表这些剩余路径已符合验收。其新增commit故障、缓存及实际清会话后审计失败用例有进步，本轮不再为此追加独立问题。

## 4. 状态与下一关口

| 项 | 当前结果 |
| --- | --- |
| 用户可见结果 | 既有维护/公告管理可用，访客只读、失败不假成功；部分变更日志仍与实际内容矛盾 |
| 后端/数据闭环 | 权限、事务、回滚、主要审计目标有效；内容差异与无变化判定尚需补齐 |
| 本次实际影响 | 仅审核脚本、审核输出、报告和提示词；零业务代码修复，零真实库/配置/会话/支付/模型/费用/部署 |
| 验证边界 | 内存事务/权限/持久化及受控组件；未验真实MySQL、生产RBAC、浏览器DOM或多实例缓存；不因此扩展本批 |
| 未完成项 | 只剩F-AUDIT的两个已复现表现及对应正式回归 |
| 发布性 | 本批暂不签收，不宣称生产就绪或商业盈利得到保证 |
| 下一关口 | 按IDE-R0-F2-PROMPT.md完成同一审计缺口；通过后冻结F09，才进入原F10 |

R0-A/B/C/D/E及本批已经通过的行为保持。审核不会借本次补修加入新页面、新权限体系、新商业规则或一般优化。
