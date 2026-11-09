# R0-F1 修复报告：补齐维护审计的实际目标与变更前后事实

**状态：R0-F1 待独立复核**（不进入原 F10、不部署）

只修 R0-F 独立审核唯一实质缺陷 F-AUDIT/P2：审计虽同事务落库，但缺少实际目标、新建记录 ID 与必要变更前后事实。R0-F 的 GET 只读、专用权限、双权限 AND、事务回滚、提交后缓存与管理页面行为全部保留；R0-A/B/C/D/E 保持冻结。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-F1-fix-snapshot/manifest.json` + `frozen-source/`（3 文件修改前副本 + SHA256；副本扩展名为 `.snapshot.txt`，避免被 tsc 编译） |
| 真实采集时间 | `2026-11-07T02:53:43+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | route `06746ea0…` / maintenance.ts `29ff06b7…` / 测试 `7e7e0bfe…` |
| 结束 SHA256 | route `c7e4b71f…` / maintenance.ts `9ec33aaf…` / 测试 `d67ee7b4…`（`after-hashes.json`） |
| 独立性 | 该基线独立于 R0-F 批次快照；未覆盖他人修改；未 reset/clean/restore；历史报告/测试/快照/scratch 零改动 |

**修改差量**（git diff --stat）：`route.ts` 大幅重构（各写分支读取移入事务 + 审计事实）；`maintenance.ts` +105 行；测试 +18 用例。无其他文件改动。

## 二、审计字段与动作映射（修复后）

审计写入仍用既有 `operationlog` 表（同事务、复用 userId/action/createdAt），`details` 在原请求摘要之上补齐：`target`（配置键或计划/公告 ID，创建含实际生成 ID，多目标按序数组）、`before`/`after`（仅实际涉及字段的最小旧/新值，来自**同一事务**的真实读取/写入）、`changed`（无变化如实 false）、以及必要的扁平补充事实（`syncMaintenanceMode/maintenanceModeBefore/After/maintenanceMessageWritten/sessionsCleared/via/matched`）。不记录 token、会话、密钥或整个系统配置。

| 动作 | target | before/after 内容 |
|---|---|---|
| `maintenance:update_settings` | `SYSTEM_UPDATE_SETTINGS_V1`（+`system_version` 仅当传入） | 只提交 popupTitle/forceUpdate 等时，diff 为实际变化字段（版本不传入即不出现）；版本写入记录旧版本→新版本；重复值 changed=false |
| `maintenance:schedule_save`(create) | **实际生成的 `maint-…` ID**（sync 时 +`maintenance_mode`） | before=null，after=创建事实（title/type/status/isDowntime/startTime/endTime）；sync 附模式前后与实际写入的维护说明 |
| `maintenance:schedule_save`(update) | `scheduleData.id` | 仅实际变化字段 diff；目标不存在如实 `matched:false` |
| `maintenance:schedule_delete` | `scheduleId` | before=被删目标事实，after={deleted, remainingCount} |
| `maintenance:release_save`(create/update) | 实际生成 `rel-…` ID / `releaseData.id` | 创建事实 / 实际变化 diff |
| `maintenance:release_delete` | `releaseId` | 原目标事实 + 删除后事实 |
| `maintenance:release_publish_toggle` | `releaseId` | 公示状态实际前后 |
| `system:maintenance_toggle`(POST 开关) | `maintenance_mode`（+message/estimated 各自实际传入时） | 模式/说明/时长实际前后（事务内读取）；`sessionsCleared` 实际清理数 |
| `system:maintenance_toggle`(DELETE) | `maintenance_mode` | `maintenanceMode before→false`；`via:"DELETE"` |

## 三、实现方式（最小调整）

1. **`maintenance.ts`**：`withMaintenanceAudit` 的 `writes` 回调改为返回 `MaintenanceAuditFact`（target/before/after/changed/extra），审计 details 由事务内返回的事实构成；新增 `readJsonArrayConfigTx`（事务内严格读取 JSON 数组：行不存在按空数组合法态，解析失败/非数组抛错 → 整体回滚，**不编造空旧值继续写**；仅沿用既有假数据过滤，不新增清洗）。
2. **`route.ts`**：各写分支把"读取旧列表/旧设置/旧维护状态"移入**现有事务**（用 tx 客户端，不用根客户端缓存或 GET 兜底默认冒充旧值）；新对象构造与列表计算随读入事务；事实从同一事务的实际读取与写入结果构建。所有持久化仍全部使用 tx；审计失败/任一写入失败/提交失败整体回滚；`setMaintenanceCache` 仅在事务成功返回后调用（原逻辑未动）。
3. **GET 零新增持久化写**：GET 代码未改动（其只读性由既有用例继续保持）。

## 四、G01—G06 验收证据（测试比对实际旧状态、新状态与日志内容）

新增 18 用例（文件 `r0f-maintenance-readonly.test.ts`，19 既有 + 18 = 37 全过）。harness 增强：`commit` 故障注入（**回调执行完成后**才失败并回滚）、事务期间根客户端写直接抛 `ROOT_WRITE_DURING_TX`（封闭 stub）、operationlog 记录模拟 DB 默认 `createdAt`。

- **G01**：只改 popupTitle（不传 systemVersion）→ target=设置键（不含 system_version）、before/after 为真实字段值、changed=true、与落库 JSON 一致；版本单改 → 双目标 + v1.0.0→v2.0.0；混改三字段全真实；重复提交 → changed=false 且空 diff 不虚构。
- **G02**：create_schedule/create_release → `target` 为**响应与数据库中一致的实际生成 ID**，before=null + 创建事实；syncMaintenanceMode → `target=[计划ID,"maintenance_mode"]` + 模式前后（事务内旧值）+ 实际写入说明；update diff 仅变化字段（未变 title 不出现）；delete（存在/不存在 matched=false）→ 原目标事实 + 删除后事实；toggle 公示真实前后。
- **G03**：false→true（含说明/时长）→ 三目标 + 模式/说明/时长真实前后（旧说明"维护中"、旧时长"30"）+ `sessionsCleared=1` + userId/action/createdAt 保留 + 日志不含 `tok-normal`/`r-normal`；true→false → 单目标、清会话 0；DELETE → before true→after false + via=DELETE；仅改说明 → 模式前后如实相同、说明前后真实。
- **G04**：① 配置中途失败（config fault）→ 500、零审计、配置原状；② **enabled=true 真正触发清会话分支后**审计失败 → 会话（sessionToken/refreshToken）完整回滚、零审计、配置原状、`isMaintenanceModeSync()` 保持 false（缓存未提前发布）；③ 回调完成后 commit 失败（true→false 方向）→ 配置/审计完整回滚、缓存保持 true；④ 无 ROOT 写逃逸（封闭 stub 下正常开启流程全部经 TX 成功）。
- **G05**：F01—F08 既有 19 用例（GET 只读/危险参数、无权零副作用、动作权限与 AND、合法动作、F06 原回滚用例、路由契约）全部保持通过。
- **G06**：既有 272 项 + 新增 18 = **290/290 通过**（9 文件定向回归）；页面组件脚本 `verify-r0f-pages.cjs` **10/10**；`tsc --noEmit --incremental false` **exit 0**。

## 五、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
→ 1 file, 37 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 9 files, 290 tests passed, exit 0（272 既有 + 18 新增）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
→ 10/10 checks passed, exit 0

node docs/reviews/R0-F-independent-review/verify.cjs
→ exit 1（预期）：其 F-AUDIT 复现第 1 项断言审计 details 深等于 `{}`（旧缺陷形态），
   修复后实际得到 {target, before, after, changed}，冻结脚本旧断言不再成立。
   该脚本作为历史证据未做任何修改。
```

均定向隔离运行、本地工具；零真实库/配置/会话/审计操作、零迁移/seed/支付/模型/短信邮件/部署；未全量测试。

## 六、对原报告覆盖表述的更正（历史报告不倒改）

原 R0-F 修复报告声称"配置/审计/提交失败均已注入、缓存与页面已验证"，实际缺口（本轮独立审核已指出，本报告确认）：

1. 原 F06 故障用例只有 audit/config 两个开关，**无 commit 故障开关**；两项故障用例均请求 `enabled=false`，**未实际执行清会话分支**；无任何缓存断言。本批补齐：commit 故障在回调完成后注入、enabled=true 真实执行清会话后审计失败回滚、false→true 与 true→false 双方向缓存断言（`isMaintenanceModeSync`）。
2. 原管理页脚本为源码字符串检查，非页面执行；页面行为证据以本轮独立审核的实际 handler/onConfirm 执行为准，本批未重复编造页面级验证。

## 七、未验证项 / 边界

- 真实 MySQL 事务/并发/回滚语义、线上角色授权、多实例缓存时序、浏览器 DOM：未验证（内存隔离证据，不冒充生产验收）。
- `operationlog.createdAt` 在内存夹具中模拟 DB 默认值；真实库时间戳由数据库默认保证。
- 审计 `details` 展示端（若有管理页读取）未做 UI 适配——`details` 为增量扩展（原字段保留），未发现读取端依赖旧"空对象"形态；如需审计详情展示页属新功能范围，本批不做。
- 未宣称生产就绪、全站无漏洞或维护审计体系完备；本批仅补齐原定审计事实。

## 八、回滚说明

用 `docs/reviews/R0-F1-fix-snapshot/frozen-source/` 三个副本覆盖对应源文件即可精确回到 R0-F 状态（副本内容与开始哈希一致）；无 schema/DDL/数据结构依赖。

**完成即停止：不进入原 F10，不扩范围。**
