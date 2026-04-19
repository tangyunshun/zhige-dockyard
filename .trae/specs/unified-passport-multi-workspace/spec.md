# 统一通行证 + 渐进式多空间系统规范

## Why
当前系统只有简单的用户认证，缺乏多空间管理能力。个人用户可能需要独立使用，也需要能够创建或加入多个企业空间。需要建立统一的用户通行证系统，支持多空间管理和无缝切换。

## What Changes
- **数据库 Schema 变更**：新增 Workspace 和 WorkspaceMember 模型，扩展 User 模型
- **注册流程改造**：注册后增加 Onboarding 环节，引导用户创建空间
- **登录路由优化**：根据用户历史和多空间情况智能路由
- **新增页面**：Onboarding 页面、工作空间选择页面
- **通用组件**：WorkspaceSwitcher 空间切换组件
- **API 扩展**：创建工作空间、加入空间、切换空间等 API

## Impact
- **Affected specs**: 用户认证系统、数据库 Schema、路由守卫
- **Affected code**: 
  - `prisma/schema.prisma` - 数据库模型
  - `src/app/api/auth/*` - 认证相关 API
  - `src/app/auth/*` - 认证页面
  - 新增 `src/app/onboarding/*` - Onboarding 页面
  - 新增 `src/app/select-workspace/*` - 空间选择页面
  - 新增 `src/components/WorkspaceSwitcher.tsx` - 空间切换组件

## ADDED Requirements

### Requirement: 数据库模型扩展
The system SHALL provide the following Prisma models:

#### Scenario: Workspace 模型
- **WHEN** 创建新模型 Workspace
- **THEN** 包含以下字段：
  - `id`: String, @id, @default(cuid())
  - `name`: String, 空间名称
  - `type`: WorkspaceType 枚举 (PERSONAL, ENTERPRISE)
  - `ownerId`: String, 空间所有者 ID
  - `description`: String?, 空间描述
  - `logo`: String?, 空间 Logo
  - `createdAt`: DateTime, @default(now())
  - `updatedAt`: DateTime
  - `members`: WorkspaceMember[]

#### Scenario: WorkspaceMember 模型
- **WHEN** 创建关联表 WorkspaceMember
- **THEN** 包含以下字段：
  - `id`: String, @id, @default(cuid())
  - `userId`: String, 用户 ID
  - `workspaceId`: String, 空间 ID
  - `role`: WorkspaceRole 枚举 (OWNER, ADMIN, MEMBER)
  - `joinedAt`: DateTime, @default(now())
  - 唯一索引：[@userId, @workspaceId]

#### Scenario: User 模型扩展
- **WHEN** 扩展 User 模型
- **THEN** 添加字段：
  - `lastWorkspaceId`: String?, 用户最后访问的空间 ID
  - `workspaces`: WorkspaceMember[]

### Requirement: Onboarding 页面
The system SHALL provide an Onboarding page at `/onboarding`:

#### Scenario: 页面布局
- **WHEN** 用户访问 `/onboarding`
- **THEN** 展示左右分栏布局：
  - 左侧：品牌展示区（复用现有登录页样式）
  - 右侧：表单区域

#### Scenario: 创建企业空间表单
- **WHEN** 用户选择创建企业空间
- **THEN** 表单包含：
  - 问候语："欢迎，[用户名]！请设置您的工作空间"
  - 企业名称输入框（.zg-input）
  - 团队规模选择器
  - 主按钮："创建企业空间"（.zg-btn-primary）
  - 提交后调用 `/api/workspace/create` API
  - 成功后更新 `lastWorkspaceId` 并跳转到 `/dashboard?wid={workspaceId}`

#### Scenario: 跳过创建个人空间
- **WHEN** 用户点击"跳过，仅使用个人空间"
- **THEN**：
  - 调用 `/api/workspace/create-personal` API（静默创建）
  - 显示 Toast 提示："已生成个人空间，后续可随时升级"
  - 跳转到 `/dashboard?wid={workspaceId}`

### Requirement: 登录路由守卫
The system SHALL implement smart routing after login:

#### Scenario: 有 lastWorkspaceId
- **WHEN** 用户登录且 `lastWorkspaceId` 有效
- **THEN** 直接重定向到 `/dashboard?wid={lastWorkspaceId}`

#### Scenario: 无历史记录且多个空间
- **WHEN** 用户无 `lastWorkspaceId` 且 `workspaces.length > 1`
- **THEN** 跳转到 `/select-workspace` 页面

#### Scenario: 只有一个空间
- **WHEN** 用户 `workspaces.length === 1`
- **THEN** 记录该空间 ID 为 `lastWorkspaceId`，进入 `/dashboard`

### Requirement: SelectWorkspace 页面
The system SHALL provide a workspace selection page at `/select-workspace`:

#### Scenario: 页面布局
- **WHEN** 用户访问 `/select-workspace`
- **THEN**：
  - 极简居中卡片布局
  - 使用毛玻璃效果（.zg-card）
  - 标题："选择工作空间"

#### Scenario: 空间列表展示
- **WHEN** 展示用户所属空间
- **THEN**：
  - 每个空间显示为独立卡片
  - 标明空间类型（个人/企业）
  - 显示空间名称和 Logo
  - 点击卡片调用 API 更新 `lastWorkspaceId`
  - 跳转到 `/dashboard?wid={workspaceId}`

### Requirement: WorkspaceSwitcher 组件
The system SHALL provide a reusable workspace switcher component:

#### Scenario: 组件功能
- **WHEN** 渲染 `<WorkspaceSwitcher />`
- **THEN**：
  - 下拉菜单展示当前用户所有空间
  - 高亮当前所在空间
  - 每个空间项显示名称和类型图标
  - 点击空间项切换并刷新页面

#### Scenario: 创建新空间入口
- **WHEN** 用户点击"➕ 创建/升级企业空间"
- **THEN**：
  - 触发全局 `.zg-modal` 弹窗
  - 弹窗内含创建企业表单
  - 表单字段与 Onboarding 页面一致
  - 创建成功后刷新空间列表

### Requirement: API 端点扩展
The system SHALL provide the following API endpoints:

#### Scenario: 创建工作空间
- **ENDPOINT**: `POST /api/workspace/create`
- **REQUEST**: `{ name: string, type: "PERSONAL" | "ENTERPRISE", description?: string }`
- **RESPONSE**: `{ success: boolean, workspace: Workspace }`

#### Scenario: 创建个人空间（静默）
- **ENDPOINT**: `POST /api/workspace/create-personal`
- **REQUEST**: `{ userId: string }`
- **RESPONSE**: `{ success: boolean, workspace: Workspace }`

#### Scenario: 获取用户空间列表
- **ENDPOINT**: `GET /api/workspace/list`
- **RESPONSE**: `{ workspaces: WorkspaceMember[] }`

#### Scenario: 切换工作空间
- **ENDPOINT**: `POST /api/workspace/switch`
- **REQUEST**: `{ workspaceId: string }`
- **RESPONSE**: `{ success: boolean, lastWorkspaceId: string }`

#### Scenario: 更新登录 API
- **ENDPOINT**: `POST /api/auth/login`
- **MODIFICATION**: 返回用户空间列表和 `lastWorkspaceId`

#### Scenario: 更新注册 API
- **ENDPOINT**: `POST /api/auth/register`
- **MODIFICATION**: 注册成功后跳转到 `/onboarding` 而非 `/auth/login`

## MODIFIED Requirements

### Requirement: 注册 API 响应
**Original**: 注册成功后返回登录页面
**Modified**: 注册成功后跳转到 `/onboarding` 页面

### Requirement: 登录 API 响应
**Original**: 登录成功后只返回用户信息和 token
**Modified**: 登录成功后额外返回：
- `workspaces`: 用户所属空间列表
- `lastWorkspaceId`: 用户最后访问的空间 ID
- `redirectUrl`: 建议的重定向 URL

## REMOVED Requirements
无

## Technical Implementation Notes

### CSS 类名复用
所有新增组件必须复用现有设计系统的 CSS 类名：
- `.zg-input` - 输入框
- `.zg-btn-primary` - 主按钮
- `.zg-btn-default` - 默认按钮
- `.zg-btn-ghost` - 幽灵按钮
- `.zg-card` - 卡片容器（毛玻璃效果）
- `.zg-modal` - 弹窗容器

### TypeScript 类型定义
```typescript
enum WorkspaceType {
  PERSONAL = 'PERSONAL',
  ENTERPRISE = 'ENTERPRISE'
}

enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  description?: string;
  logo?: string;
  createdAt: DateTime;
  updatedAt: DateTime;
}

interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  joinedAt: DateTime;
  workspace: Workspace;
}
```

### 路由守卫逻辑
```typescript
// 伪代码示例
function handleLoginSuccess(user, workspaces, lastWorkspaceId) {
  if (lastWorkspaceId && isValid(lastWorkspaceId)) {
    return `/dashboard?wid=${lastWorkspaceId}`;
  }
  
  if (workspaces.length === 1) {
    updateLastWorkspace(workspaces[0].id);
    return `/dashboard?wid=${workspaces[0].id}`;
  }
  
  if (workspaces.length > 1) {
    return '/select-workspace';
  }
  
  return '/onboarding';
}
```
