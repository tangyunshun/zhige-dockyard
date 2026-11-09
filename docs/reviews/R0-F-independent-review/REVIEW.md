# R0-F 独立审核：公开查询与权限止损有效，审计事实仍须补齐

日期：2026-11-07（Asia/Shanghai）。结论：**R0-F 暂不签收；只有一项实质性补修 F-AUDIT，不进入原 F10。** 补修直接对应上一轮提示词第5节“最小必要的变更前后事实”，没有新增产品要求。R0-A/B/C/D/E 保持已签收边界。

## 1. 发现：F-AUDIT / P2，审计落库但未记录实际变更事实

涉及：`src/app/api/system/maintenance/route.ts:265/361/448/479/542`，`src/lib/maintenance.ts:64`。

`withMaintenanceAudit` 已把写操作和 operationlog.create 放进同一事务，但只保存调用者传来的请求摘要。事务内没有采集变更前后值，创建记录时没有把生成 ID 传给日志。

真实 route/helper + 内存持久化独立复现：

| 受控操作 | 实际配置变化 | 当前审计详情 | 缺失 |
| --- | --- | --- | --- |
| 保存展示配置，只提交 popupTitle/forceUpdate | old title→new title、false→true | 调用只传未提供的 systemVersion；按 JSON 序列化后为 `{}` | 目标键、实际字段及前后事实 |
| 创建维护计划 | 生成 maint-… ID 并保存计划 | action=create_schedule、syncMaintenanceMode=false；scheduleId 未提供 | 新生成的目标 ID、创建事实 |
| 开启维护并改公告 | mode false→true、公告 old message→new message | enabled=true、hasMessage=true、estimatedMinutes=45 | 原维护状态、公告及实际变更后的值 |

新建发布记录同样传 `releaseData.id`，而新生成 ID 在另一个局部对象中；修改/删除公告计划等只有 ID/动作，不能回溯内容。DELETE 解除维护只有 action=disable，缺少实际状态变化。上述属于同一个审计内容缺陷，不拆成多批。

影响：虽然能知道某位管理员调用了某类操作，但无法从该日志确定他实际修改了哪份新计划、哪些配置从什么值变成什么值。高风险维护、强制更新和公告变更事后排查缺少既定证据。**不据此声称仍能匿名改维护、存在资金损失或线上事故。**

要求：仅在当前维护写入口补齐目标与最小实际 before/after；事实对应同一事务的真实已写值，并随配置一起提交/回滚。创建要有新 ID，删除要有原对象必要事实；不记录 token/会话或整个系统配置；不建新审计平台。

## 2. 已通过的既定范围

| 验收范围 | 当前独立证据 |
| --- | --- |
| F01 公开 GET 只读 | 匿名/普通/只读/超管夹具×普通/重复时间戳/旧危险参数共12组；正常200、危险参数400，零持久化写/认证调用/会话变更 |
| F02 旧记录/空配置/读取失败 | 旧 ID 仅内存过滤，原始值保持；空配置及发布记录读取故障保持现有明确默认，零写；未重做原有默认策略 |
| F03 未授权写 | 匿名、普通、无授予管理员、只读管理员×9种POST及DELETE共40组，401/403且零配置/会话/审计写 |
| F04 动作权限 | toggle/publish/both/super×10种动作共40组；计划同步3种状态×3种权限共9组，两次单权限检查实际为AND；未知action400零写 |
| F05 合法功能 | 允许的开关、计划、发布及设置动作保持200；所有写均使用TX；这是逻辑/内存证据，不是线上角色授权验收 |
| F06 原子性与缓存 | 第二次配置写失败、已清会话后审计失败、回调已完成但提交失败均回滚；关闭维护POST/DELETE提交失败也保持原状态/缓存；未发现ROOT写逃逸 |
| F07 管理交互 | 独立执行实际管理员handler及存入确认框的onConfirm：403、500、网络失败、成功4组；确认前无POST，失败无本地成功/成功Toast，成功重新GET。三个公开消费组件仍仅GET |
| F08 已冻结功能 | 定向272项、类型检查和各组件检查通过；3对开始/结束副本及6个相邻保护文件核对通过；开始快照与上一轮独立记录对应 |

F05的审计“有记录”通过，审计“事实足够”不通过；不能将二者合并标成强审计全部完成。F01—F08整体结论仍为待补修。

独立脚本共110个正向/拒绝/故障场景，另3个审计缺陷复现场景（同一个缺陷）。旧版危险GET通过冻结副本加载，ROOT写由夹具拦截，因此返回500但确有写尝试；当前危险GET为400且无写尝试。没有替换共享源码。

## 3. 本轮实际执行与结果

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
=> 9 files / 272 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
=> exit 0，无诊断

node docs/reviews/R0-F-fix-snapshot/verify-r0f-repro.cjs => 12/12，exit 0
node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs => 10/10，exit 0
node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs => 5/5，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs => 24/24，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs => 18/18，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs => 21/21，exit 0

node docs/reviews/R0-F-independent-review/verify.cjs
=> 110个控制场景通过，3个F-AUDIT复现，明确NOT ACCEPTED；exit 0表示复现成功，不是签收
node docs/reviews/R0-F-independent-review/verify-pages.cjs
=> 实际管理确认/handler 4组通过，exit 0
```

## 4. IDE报告证据需更正，不能用测试数量代替覆盖

原报告声称配置/审计/提交失败均已注入。但其测试fault只有audit/config，没有提交失败开关；两项故障用例均请求enabled=false，未执行清会话分支，也未断言实际缓存。测试名不足以证明这些场景。页面脚本对管理页只做字符串检查，不能用真实路由测试替代确认框/页面handler执行。本轮已独立补证上述当前行为有效，**未发现第二个业务缺陷**。

补修时新增必要正式回归并在新报告说明原证据缺口；不得改写历史报告/JSON。页面旧脚本因hook依赖简化产生多轮挂载请求，不把该请求数量解释为真实浏览器行为。新增any及风格问题不另开阻断或重构任务。

## 5. 交付与边界

| 项 | 状态 |
| --- | --- |
| 用户可见流程 | 访客读取不再修改维护；合法管理员操作保留；拒绝/失败没有伪成功证据 |
| 后端/数据闭环 | 读写权限、事务及回滚有效；审计实际变更事实不完整 |
| 审核实际影响 | 仅新增独立审核脚本/证据/报告/补修提示词；未修改业务源码，未触碰真实库/配置/会话/渠道/收费 |
| 未验证 | 真实MySQL事务/并发、线上权限配置、多实例缓存时序、浏览器DOM、部署/人工业务验收；本批不据此新增功能范围 |
| 可发布性 | 不签收本批，不宣称生产就绪、全站无漏洞或利润得到保证 |
| 下一关口 | 只完成R0-F1的审计事实补修及对应证据，重新审核后才能进入原F10 |

详见verification.json、page-verification.json、IDE-R0-F1-PROMPT.md。R0-A/B/C/D/E及本批已通过的止损逻辑保持，不混入计费/增长/cron或公告公开策略重构。
