# 活动日志角色化改造交付报告（个人中心 + 工作台收口）

> 日期：2026-11-06
> 范围：用户显式选择「个人中心 + 工作台一起收口」
> 状态：**待独立复核**（本环境仅跑 tsc + lint，未跑浏览器与真实库）

## 一、先纠正一个事实（重要）

原方案设想里「补工作台 LogsTab 的成员只看自己隔离」——**其实项目里早就有了**，
位置在 `src/app/api/workspace/[id]/logs/route.ts` 第 87-93 行：对普通成员（`!isManager`）
只返回 `l.userId === userId || det.uploaderId === userId` 的日志；且 `LogsTab` 的删除按钮
只对 `isWorkspaceAdmin` 显示。所以这次没有重复造轮子，只补了真正缺失的两块。

## 二、本次实际改动

### 1. 统一删除保护名单（核心）
- 新建 `src/lib/log-protection.ts`：导出 `PROTECTED_ACTION_PATTERN` 与 `isProtectedActivity`，
  作为**全站唯一**的合规删除保护来源（登录/密码/支付/退款/转让/注销/踢出/二次验证等）。
- 个人中心路由 `src/app/api/user/activities/route.ts`、个人中心页面
  `src/app/user/activities/page.tsx` 改为引用共享模块，删除各自重复的本地正则。
- 工作台删除接口 `src/app/api/studio/handler.ts` 的 `delete_operation_log` 与
  `clear_expired_logs` **首次套用同一套保护**：
  - 删除前先剔除合规日志；整批都是合规日志 → 返回 403 拒绝；混合批 → 只删可删的并提示跳过条数。
  - 1 年定期清理也排除合规日志，不再物理清除登录/支付等溯源记录。
- 效果：此前空间所有者/管理员能删掉登录、支付、注销这类合规日志的缺口被堵上；
  **合规日志现在任何角色都删不掉**（与个人中心口径一致）。

### 2. 个人中心新增「空间维度」筛选 + 显示当时身份
- 后端 GET 新增 `workspaceId` 参数：`all`=全部；`personal`=个人空间动作（workspaceId 为空）；
  具体 id=该空间内动作。
- 后端随响应返回用户作为所有者/成员的全部空间列表（`workspaces`，含 `myRole`），
  并在每条日志上附带 `workspaceName` 与 `myRole`。
- 前端新增空间下拉（全部空间 / 仅个人空间 / 各企业空间带「所有者·管理员·协同者」标注），
  每行描述下显示空间名 + 当时身份徽标；无空间归属的动作显示「个人空间」。

## 三、改动文件清单（共 5 个，含 1 个新增）
- 新增 `src/lib/log-protection.ts`
- `src/app/api/user/activities/route.ts`
- `src/app/user/activities/page.tsx`
- `src/app/api/studio/handler.ts`

未改数据库 schema、未引入新依赖、未触碰其余 ~90 个未提交文件。本批零真实库写入。

## 四、验证
- `tsc --noEmit` 全量通过（exit 0）。
- 改动文件 lint 零诊断。
- **未验证项（如实说明）**：浏览器真人点击、真实 MySQL 取数/删除、工作台 LogsTab 实际渲染——
  本环境跑不了或不应保证副作用隔离，建议独立复核阶段在隔离预览补一次点击。

## 五、回滚
把 4 个文件恢复到本次改动前（`git checkout` 对应文件），并删除新增的 `log-protection.ts` 即可；
无需数据回滚。

## 六、边界提示（需用户/复核关注）
- 本次改动属于生产代码新增/修改，触及「批次 2B 暂停生产代码」协议的边界；已按用户显式授权执行，
  但仍建议走独立复核。
- 个人中心「空间筛选」下拉依赖用户当前空间成员关系；若该用户在某空间已退出，历史日志仍按
  `workspaceId` 保留并标注原空间名，但下拉不再列出该空间（符合预期）。
