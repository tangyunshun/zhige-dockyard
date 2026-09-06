# 功能需求更新文档：工作空间停用期限管控、自动自愈解封与用户申诉闭环系统

## 1. 业务背景与目标
为防止平台工作空间因偶发违规被“一刀切”永久封禁导致客户体验受损，同时满足合规安全风控对分级、分类、分期限治理的诉求，本次迭代上线了**工作空间分级停用期限管控**机制与**所有者解封申诉风控闭环**系统。
通过将停用到期时间直观显性化展示给前台用户，消除用户困惑；支持无人值守到期自动解封自愈；并为空间负责人提供严格受控的单次申诉机会，工单打通平台“风控与审核中心”，形成安全且人性化的治理闭环。

---

## 2. 详细功能架构与业务流程

```
                      【管理后台：工作空间管控】
                                 │
                   选择停用期限 (1d/3d/7d/30d/365d/永久)
                                 │
                                 ▼
                     写入 workspace.quota JSON
               (disabledUntil, disabledReason, duration)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       【前台工作空间中枢】              【无人值守到期自愈引擎】
   - 显性展示截止节点与剩余天数         - 列表/详情/Dashboard 探测时
   - 红态管控锁定（阻断进入与调用）       - 若 now > disabledUntil：
   - 空间所有者展示【申请解封】按钮      - 自动恢复 ACTIVE 并清除封禁限制
                 │
                 ▼
         【发起空间解封申诉】
   - 限制：每个空间严格限申诉 1 次
   - 校验：仅空间 Owner / Admin 可提交
   - 写入 accountappeal 表 (businessType: '空间解封申诉')
   - 空间标记 appealStatus: 'pending', appealCount: 1
                 │
                 ▼
        【管理后台：风控与审核中心】
   - 工单分类：展示「🏢 空间解封申诉」专属徽标
   - 档案卡片：展示目标空间名称、ID、管控期限、停用原因
                 │
         ┌───────┴───────┐
         ▼               ▼
     【审核通过】      【审核驳回】
   - 空间即刻恢复 ACTIVE  - appealStatus 标记为 'rejected'
   - 清空停用到期限制      - 向申诉人发送驳回站内信
   - 空间全员推送恢复站内信 - 前台展示“申诉已驳回”，无法二次申诉
```

---

## 3. 数据库持久化方案（零破坏性 ALTER）

利用 `workspace` 表的原生 `quota` JSON 字段与现有 `accountappeal` 工单表，在不改动表结构的前提下实现 100% 结构化无损持久化：

### 3.1 `workspace.quota` JSON 扩展字段
```json
{
  "tokenBalance": 100,
  "disabledUntil": "2026-09-13T06:58:00.000Z",
  "disabledReason": "违反平台运营与合规规范",
  "disabledDuration": "7d",
  "disabledDurationDays": 7,
  "disabledAt": "2026-09-06T06:58:00.000Z",
  "appealStatus": "none | pending | approved | rejected",
  "appealCount": 1,
  "lastAppealAt": "2026-09-06T07:00:00.000Z",
  "lastAppealId": "appeal-ws-1788673...",
  "approvedAt": "2026-09-06T07:05:00.000Z",
  "approvedComment": "整改措施符合要求，予以解封",
  "rejectedAt": null,
  "rejectedComment": null
}
```

### 3.2 `accountappeal` 表映射规范
*   `id`: `appeal-ws-${timestamp}-${random}`
*   `userId`: 申诉人（空间所有者）用户 ID
*   `businessType`: `"空间解封申诉"`（与 `"账号解封申诉"` 精准隔离）
*   `banReason`: 空间停用管控原因
*   `appealReason`: 用户录入的申诉事实与整改理由
*   `appealEvidence`: 序列化 JSON，包含 `{ workspaceId, workspaceName, disabledUntil, disabledDuration, disabledReason, extraEvidence }`
*   `status`: `"pending"` (待审核) | `"approved"` (已解封) | `"rejected"` (已驳回)

---

## 4. 前后端文件修改清单与技术细节

| 文件路径 | 改动职责与技术细节 |
| :--- | :--- |
| `src/app/api/admin/workspaces/toggle-status/route.ts` | 1. 接收 `duration` 参数（`1d`, `3d`, `7d`, `30d`, `365d`, `permanent`）；<br>2. 毫秒级计算 `disabledUntil` 写入 `workspace.quota` JSON；<br>3. 恢复启用时自动清除停用元数据；<br>4. 站内信内容增强：明确告知受管原因与到期时间（或永久）。 |
| `src/app/api/admin/workspaces/route.ts` | 1. 列表查询时自动注入 `disabledUntil`, `disabledReason`, `appealStatus` 等字段；<br>2. 内置超时自动自愈检测：若 `now > disabledUntil` 自动更新库为 `ACTIVE`。 |
| `src/app/api/workspace/[id]/my-membership/route.ts` | 1. 修复 `member` 变量未定义异常；<br>2. 空间身份检测时执行超时自愈解封；<br>3. 返回包含管控期限与申诉状态，供空间内权限守卫使用。 |
| `src/app/admin/workspaces/page.tsx` | 1. 停用模态框中增加 6 个期限选择胶囊（1天、3天、7天、1个月、1年、永久停用），并提供预计自动解封节点计算卡片；<br>2. 提交时向后端携带 `duration` 字段；<br>3. 表格操作列为已停用空间展示截止标签（`至 MM/DD 止` 或 `永久`）；<br>4. 名称列显示 `管控中` 与 `申诉待审` 标签；<br>5. 严格隐藏超级管理员和系统管理员空间名下的停用按钮（防误伤受保护空间）。 |
| `src/app/api/workspace/appeal/route.ts` | **【全新接口】**<br>1. 校验用户登录态及空间所有者/管理员权限；<br>2. 空间状态校验（仅 `DISABLED` 状态允许发起）；<br>3. 严格限 1 次申诉校验：若 `appealCount >= 1` 或 `appealStatus === "pending"` 立即 400 阻断；<br>4. 录入 `accountappeal` 工单表（`businessType: "空间解封申诉"`）；<br>5. 更新工作空间 `quota`（`appealStatus = "pending"`, `appealCount = 1`）；<br>6. 双向系统通知：向用户发送受理通知，向管理员推送待办通知。 |
| `src/app/api/admin/account-appeals/process/route.ts` | 1. 分支处理：针对 `businessType === "空间解封申诉"`；<br>2. 审核通过：解析空间 ID，将空间 `status` 恢复为 `ACTIVE`，清空停用到期限制，`appealStatus` 设为 `approved`，向空间全员（所有者+协作成员）推送服务恢复喜讯站内信；<br>3. 审核驳回：`appealStatus` 设为 `rejected`，向申诉人发送驳回通知，明确告知驳回理由并提醒等待到期自动解封。 |
| `src/app/admin/account-appeals/page.tsx` | 1. 业务类型筛选下拉框增加 `空间解封申诉`；<br>2. 工单列表表格针对空间申诉渲染紫色专属徽标并直观展示 `🏢 目标空间名称`；<br>3. 审核详情弹窗内嵌「目标工作空间与管控档案」卡片（含名称、空间ID、管控期限、停用原因、第1次申诉严格说明）；<br>4. 审核处理确认弹窗区分空间解封语境与通知提示。 |
| `src/app/api/user/workspace-hub/dashboard/route.ts` | 1. 中枢聚合接口提取各工作空间原生 `status` 及 `disabledUntil`, `disabledReason`, `appealStatus`；<br>2. 内置超时自动解封自愈引擎，到期异步刷新数据库为 `ACTIVE`。 |
| `src/hooks/useWorkspaceHubData.ts` | 在 `Workspace` 接口中补充 `disabledUntil`, `disabledReason`, `disabledDuration`, `appealStatus`, `appealCount` 类型定义。 |
| `src/components/workspace-hub/WorkspaceAppealModal.tsx` | **【全新组件】**<br>工作空间解封申诉弹窗：提供目标空间受限信息卡片、单次申诉规则警示、申诉理由及整改说明录入、紧急联系方式输入，对接申诉 API。 |
| `src/components/workspace-hub/EnterpriseWorkspaceCard.tsx` | 1. 空间受限时渲染明明白白的红底管控横条：清晰标注截止节点日期分秒、剩余倒计时天数以及到期自动解封说明；<br>2. 操作按钮区根据状态动态切换：<br>   - `pending`：展示【申诉审核中 (限1次)】禁用按钮；<br>   - `rejected`：展示【申诉已驳回】禁用按钮；<br>   - 未申诉且为所有者：展示【申请解封】高亮按钮，唤起申诉弹窗；<br>3. 挂载 `WorkspaceAppealModal` 并在成功后支持回调刷新。 |
| `src/components/workspace-hub/EnterpriseWorkspaceList.tsx` | 透传 `onRefresh` 属性给 `EnterpriseWorkspaceCard`。 |
| `src/app/workspace-hub/page.tsx` | 在 `EnterpriseWorkspaceList` 上绑定 `onRefresh={refresh}`，保证申诉成功后中枢界面即时刷新最新申诉状态。 |
| `src/components/workspace-hub/PersonalWorkspaceCard.tsx` | 对个人空间受限状态进行同步防护，呈现管控倒计时横条并将进入按钮锁定为【空间已管控】。 |

---

## 5. 验收与测试用例验证

| 测试场景 | 操作步骤 | 预期效果 | 验证结果 |
| :--- | :--- | :--- | :---: |
| **受保护空间安全防线** | 登录超级管理员或系统管理员账号，查看其名下工作空间 | 停用按钮彻底隐藏，不展示停用入口 | ✅ 通过 |
| **期限停用管控** | 管理员在后台对普通空间点击【停用】，选择 `7 天` 期限，输入停用原因 | 1. 数据库 `quota` 准确写入 `disabledUntil`（7天后）与 `disabledDuration: '7d'`；<br>2. 空间全员收到包含管控原因与到期时间的通知；<br>3. 管理后台操作列展示 `09/13止` 截止标签。 | ✅ 通过 |
| **前台中枢明明白白展示** | 用户登录前台进入 `/workspace-hub` | 空间卡片高亮显示 `管控截止节点：2026-09-13 14:00 (剩余 7 天 · 到期自动自愈解封)` 及停用原因。 | ✅ 通过 |
| **发起申诉（限 1 次）** | 空间所有者在卡片上点击【申请解封】，录入申诉理由并提交 | 1. 提示工单已进入风控审核中心；<br>2. 卡片按钮立即转为【申诉审核中】；<br>3. 工单入库 `accountappeal`（业务类型为 `空间解封申诉`）；<br>4. 重复发起被服务端 400 严格拦截。 | ✅ 通过 |
| **风控工单处理：审核通过** | 管理员在 `/admin/account-appeals` 筛选 `空间解封申诉`，查看详情卡片并点击【同意解封】 | 1. 目标工作空间即刻自动恢复 `ACTIVE`；<br>2. `disabledUntil` 限制被清除；<br>3. 空间全体在编成员收到恢复正常运营喜讯通知；<br>4. 前台中枢卡片实时恢复正常进入态。 | ✅ 通过 |
| **风控工单处理：审核驳回** | 管理员点击【驳回】，输入驳回理由 | 1. 空间 `appealStatus` 转为 `rejected`；<br>2. 申诉人收到驳回站内信；<br>3. 前台卡片展示【申诉已驳回】，用户无法二次申诉，明确等待到期解封。 | ✅ 通过 |
| **超时自动解封自愈** | 模拟停用到期时间早于当前时间（`disabledUntil < now`），用户访问列表或中枢 | 系统自动判定已超时，无缝自愈恢复 `status: "ACTIVE"`，清空受管标记。 | ✅ 通过 |
