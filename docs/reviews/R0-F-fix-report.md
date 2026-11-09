# R0-F 修复报告：原方案 F09 公开维护查询只读、维护写操作授权与审计

> **状态：R0-F 待独立复核**。本批只完成风险关闭；不宣称全站权限体系重构完成、生产就绪或平台增长指标达成。
> 不顺势开发 F10、全站权限重构、增长功能、价格调整，也不恢复企业转个人或人工退款批准能力。

---

## 〇、理解确认与范围

| 项 | 内容 |
|---|---|
| 唯一目标 | 未登录用户可查看维护状态、公告与版本，刷新页面不修改系统；管理员只有获得对应权限，才能通过明确写请求修改维护状态或公告；失败显示真实原因，不假成功 |
| 依据 | `docs/reviews/R0-E-independent-review/IDE-R0-F-PROMPT.md`、AGENTS.md、`docs/PROJECT-DEVELOPMENT-CHARTER.md`、原重构方案 F09、`REVIEW.md`、`next-maintenance-verification.json` |
| 已核实事实 | 公开 GET 曾可经 `emergency_disable` 无认证解除维护（写库）；读取公告/计划时会把内存清洗结果回写 DB（旧 ID 命中即清库）；POST/DELETE 仅凭 `isAdminRole`（任意管理员角色即可写）；`writeAuditLog` 吞错；`requirePlatformPermission` 多键为 OR |
| 实际改动 | `src/lib/maintenance.ts`（+53/−0，新增事务化审计帮助函数）、`src/app/api/system/maintenance/route.ts`（+259/−184）、`src/app/admin/maintenance/page.tsx`（**0 改动**）+ 1 个新增定向测试 + 2 个隔离脚本 + 报告与快照 |
| 约束遵循 | 零真实库写入/迁移/seed、零真实维护配置或会话操作、零真实支付/模型/短信邮件、零部署、零密钥读取；未替换共享源码；未删除或修改历史测试、报告、scratch 或其他未提交修改 |

**上一批（R0-E）换源问题的更正说明**：R0-E 曾因 swap 脚本用文件名 `route.ts` 互相覆盖而临时损坏 3 个路由文件（已还原并在其报告中说明）。本批从流程上避免了同类风险：**未替换任何共享源码做旧版对照**；旧反例仅通过内存隔离脚本重放；快照副本命名保留完整相对路径（如 `src__app__api__system__maintenance__route.ts`），不存在同名覆盖；冻结副本加 `.frozen` 后缀以退出 `tsconfig` 的 `**/*.ts(x)` 编译收集。历史 `verify-next-maintenance.cjs` 与 `next-maintenance-verification.json` 未改动（JSON SHA256 前后一致：`d3dd1122…`）。

---

## 一、F01 公开 GET 全程只读

- 删除 GET 的 `emergency_disable` 写分支。兼容旧危险查询改为**明确 400 + 稳定错误码**（契约已固定并有测试）：`{ error: "维护变更须通过授权写操作", code: "MAINTENANCE_DISABLE_REQUIRES_AUTH" }`，不关闭维护、不写任何持久化、不清会话。
- 移除读取公告/维护计划时把内存清洗结果回写 DB 的行为（`getReleasesFromDB`/`getSchedulesFromDB` 中的 `prisma.systemconfig.update` 已删）。旧 ID 记录**只在内存过滤**展示，DB 原记录字节保留；读取旧 ID 记录不顺手清库。
- 保留访客读取（未登录可查维护状态、公告、版本），不以整条接口要求登录代替修复；正常查询契约保持（200、字段不变）。

## 二、F02 写操作使用现有专用权限（含 AND）

| 操作 | 所需权限 |
|---|---|
| GET 维护状态/公告/版本（公开） | 无需登录，全程只读 |
| POST 基础维护开关（无 `action` 的 `enabled`/`message`/`estimatedMinutes`） | `system:maintenance_toggle` |
| DELETE 解除维护 | `system:maintenance_toggle` |
| POST 维护计划增删改 | `maintenance:publish`；`syncMaintenanceMode` 会改变维护模式时**另需** `system:maintenance_toggle`（两项**分别校验**，等价 AND） |
| POST 公告增删改与公示开关 | `maintenance:publish` |
| POST 展示配置保存 | `maintenance:publish` |
| 未知非空 `action` | `400 UNKNOWN_ACTION`，不落入默认维护切换 |

- 权限判定改用现有权威 `requirePlatformPermission`（`@/lib/security`），移除原 `validateUser` + `isAdminRole`（任意管理员角色即可写）的宽松门槛。superadmin 按现有权威 helper 规则放行，**未另建角色后门**。
- `requirePlatformPermission` 多键参数为 OR 语义；需要同时满足时**分别调用两次**（publish → toggle），不把 OR 当 AND 使用。只读权限（`maintenance:read`）或普通管理员角色**不能写入**。

## 三、F03 保留正常管理功能

- 合法授权的开关、公告、计划、展示配置管理全部可用（F05 有断言）；未知非空 `action` 返回 `400 {error:"未知的操作类型", code:"UNKNOWN_ACTION"}`，不再落入默认维护切换分支。

## 四、F04 配置、审计与缓存一致

- 新增 `withMaintenanceAudit(actorId, action, details, writes)`（`src/lib/maintenance.ts`）：`prisma.$transaction(async (tx) => { await writes(tx); await tx.operationlog.create({...}) })`。
  - `writes` 回调内所有持久化**必须使用传入的 `tx`**，禁止逃逸到根 `prisma` 客户端；
  - 审计写与配置写**同事务提交**；审计失败（或任一写入失败）→ 整体回滚并抛错 → 路由 `catch` 返回 500，**绝不留下无审计的成功变更**；
  - **未使用**会吞错的 `writeAuditLog` 完成强审计（审计经 `tx.operationlog.create` 直写既有表）。
- `setMaintenanceModeTx(tx, enabled)`：仅落库（事务内用），不更新内存缓存；`setMaintenanceCache(enabled)` **仅在事务提交成功后调用**；回滚时缓存不刷新，不会显示一个未提交的维护状态。
- 开启维护的普通用户会话清理（`tx.user.updateMany`，作用域沿用 `ADMIN_ROLE_VALUES`）放在**同一事务**内：回滚时**不残留**会话清理结果；权限拒绝、GET 与回滚均不清会话。

## 五、F05 合法管理流程保持

- 超管/双权限管理员：开关维护（含 message/estimatedMinutes + 会话清理）、DELETE 解除维护、公告增删改与公示开关、计划增删改与同步模式、展示配置保存，全部 200 且配置/审计一致；开启后 GET 仍可读并反映新状态。

## 六、F06 配置/审计/提交失败回滚（故障注入验证）

- 审计写失败注入 → 返回 500（不假成功）；`maintenance_mode` 不变、`operationlog` 为 0、普通用户会话未清（整体回滚）。
- 配置写失败注入 → 返回 500；事务回滚，审计未落。
- 缓存/会话不保留未提交变更（回滚时缓存未刷新、会话未被清）。

## 七、F07 真实页面处理

- 管理页 `src/app/admin/maintenance/page.tsx` **零改动**：既有接线已满足要求——`ConfirmDialog` 承载危险操作；失败分支（`!res.ok`）只展示后端真实原因，**不本地切成功**；成功分支才 `setMaintenanceMode(targetMode)` 并 `loadData()` 刷新（已用受控执行/源码级核对确认）。
- 三个公开消费页面（维护页、更新页、预警横幅）**受控执行**：挂载仅发 `GET /api/system/maintenance`（不带 `emergency_disable`、无任何写方法），访客可读且无副作用。
- 明确区分：本批为**组件受控执行**（TS 转译 + vm，替换 React hooks/JSX runtime/路由/图标等 IO），**非浏览器 DOM 渲染**；动态授权行为由真实路由测试覆盖。

## 八、F08 冻结回归与相邻功能保持

- 既有 **253 项定向回归** 全绿 + 新增 19 项 = **272/272 通过**；R0-C 企业池 18/18、R0-B2 收银台 21/21、R0-D 页面 24/24、R0-E 页面 5/5、R0-F 页面 10/10；`tsc` 退出码 0。
- 相邻功能文件哈希**零差量**（与开始态一致）：`src/lib/security.ts`、`src/middleware.ts`、`src/components/MaintenanceUpcomingBanner.tsx`、`src/app/releases/page.tsx`、`src/app/maintenance/page.tsx`、`src/app/api/admin/permissions/route.ts`。真实回调、计费层、席位核心、支付模式均未触碰。

---

## 九、F01—F08 验收结果总表

| 编号 | 场景 | 结果 |
|---|---|---|
| F01 | 匿名/普通/管理员 GET，带 `emergency_disable`、重复/`t` 参数 → 不关闭维护、零持久化写、不清会话；正常查询契约保持 | **通过**（19 项含 4 项直接断言） |
| F02 | 旧 ID 命中/空配置/读取失败路径 → 零清洗写；旧 ID 仅内存过滤，DB 原记录字节不变 | **通过** |
| F03 | 未登录/普通登录/只读管理员 POST/DELETE → 401/403，零写 | **通过** |
| F04 | 动作权限精确（仅 toggle 可开关、仅 publish 可发布、双权限才可同步模式）、未知 `action` → 400 零写 | **通过**（含 OR≠AND 反例：仅 publish 请求 sync → 403） |
| F05 | 合法开关/DELETE/公告/计划/展示配置写 → 正常保持；配置、审计与既有会话作用域一致；GET 仍可读 | **通过** |
| F06 | 配置写/审计写/提交失败注入 → 不假成功、事务整体回滚、缓存与会话不保留未提交变更、无根客户端逃逸 | **通过**（2 项故障注入断言） |
| F07 | 实际管理 handler/确认交互、三个公开消费页面 | **通过（10/10，含受控执行）** |
| F08 | 冻结回归与相邻功能保持 | **通过（272/272 + 各页面脚本 + tsc）** |

## 十、实际命令与退出码

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `node docs/reviews/R0-E-independent-review/verify-next-maintenance.cjs`（历史反例重放） | **加载期失败**：修复后路由新引入 `@/lib/security`，历史 stub 列表缺失；其 `next-maintenance-verification.json` **未被写回**（SHA256 前后一致） | **1** |
| 2 | `node docs/reviews/R0-F-fix-snapshot/verify-r0f-repro.cjs`（同结构重放 + 补齐 security stub） | **12/12 通过**（旧反例已闭合 + 新增写路径反例） | **0** |
| 3 | `npx vitest run src/app/api/__tests__/r0f-maintenance-readonly.test.ts` | **19 passed**（F01—F07） | **0** |
| 4 | `npx vitest run <9 个指定隔离文件> --reporter=dot` | **9 files / 272 tests passed**（253 既有冻结 + 19 新增） | **0** |
| 5 | `node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs` | **18/18** | **0** |
| 6 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | **21/21** | **0** |
| 7 | `node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs` | **24/24** | **0** |
| 8 | `node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs` | **5/5** | **0** |
| 9 | `node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs` | **10/10** | **0** |
| 10 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |

过程记录（如实）：新增测试首轮因夹具遗漏（普通用户未纳入权限内存模型、超管未加入 `superadmins`、用例缺 `startTime`、`beforeEach` 重置导致的跨用例断言耦合）出现 9 处失败，逐一定位后全绿；页面受控执行脚本因 hooks 游标未初始化、JSX runtime 未递归执行嵌套函数组件（更新页逻辑在 `Suspense` 子组件内）而两度失败，修正后 10/10；`tsc` 首轮报 4 处测试文件类型错误（`Response` 可空断言、`callGET` 未支持可选 token、`JSON.parse` 参数可空）与冻结副本被 `tsconfig` 收集，分别修正后退出码 0。全部只修正**夹具/断言/脚本**，未放宽零写、权限或回滚验收，未改历史反例脚本或删除旧用例。最终状态全绿。

---

## 十一、最小差量、快照哈希与未验证项

**最小差量（vs 开始态原始副本）**：

| 文件 | 开始态 SHA256 | 结束态 SHA256 | 差量 |
|---|---|---|---|
| `src/lib/maintenance.ts` | `3c9ea09d…` | `29ff06b7…` | +53 / −0（纯新增帮助函数） |
| `src/app/api/system/maintenance/route.ts` | `bfbb49ff…` | `06746ea0…` | +259 / −184 |
| `src/app/admin/maintenance/page.tsx` | `97ea049c…` | `97ea049c…` | **0（零改动）** |

开始态 9 个文件（3 个目标 + 6 个相邻）SHA256 与 `next-maintenance-verification.json` 逐项一致；结束态 6 个相邻文件哈希与开始态**完全相同**（零差量）。

新增：`src/app/api/__tests__/r0f-maintenance-readonly.test.ts`、本报告、`R0-F-fix-snapshot/`（manifest、两份源码副本、`verify-r0f-repro.cjs`、`verify-r0f-pages.cjs`）。

**数据影响**：零真实库写入/迁移/seed、零真实维护配置或会话操作、零真实支付/模型/短信邮件、零部署、零密钥读取；未改变任何真实维护状态、公告、计划、用户会话或审计记录；未批准或驳回任何真实工单。行为上的唯一变化是收紧闸门：公开 GET 只读（危险参数明确 400、旧 ID 不再回写清洗），写操作须持有对应专用权限且配置与审计同事务，失败不再假成功。合法授权管理流程不受影响。

**未验证**：真实浏览器 DOM 渲染（页面为组件受控执行，非 jsdom）；真实数据库事务/行锁与真实 `prisma.$transaction` 行为（内存模型以快照回滚模拟）；真实部署 RBAC/中间件授权状态（权限夹具只验证路由请求的权限判定，不证明线上角色/环境配置）；真实维护页面对线上流量的影响。历史 `verify-next-maintenance.cjs` 未在修复后路由上完整重放（其 stub 列表不含新引入的 `@/lib/security`，属加载期失败而非漏洞仍存在），等效反例已在同结构重放脚本 `verify-r0f-repro.cjs` 中覆盖。

---

## 十二、状态与停止

F01—F08 全部通过，272 项定向回归、各页面组件检查与类型检查全绿，**到此停止并交回独立审核**：

- **最终状态：R0-F 待独立复核**；
- 冻结本批维护只读/授权/审计闸门；不开发 F10、不做全站权限重构、不做增长功能、不调价格；
- 不恢复企业转个人或人工退款批准能力；
- 不宣称全站权限体系完成、生产就绪或平台增长闭环完成；
- 历史报告与历史反例脚本不覆盖；当前工作区保持修复态，未实际回退。
