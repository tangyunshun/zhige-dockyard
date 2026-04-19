# Tasks - 统一通行证 + 渐进式多空间系统

## Task 1: 数据库 Prisma Schema 变更 ✅
- [x] Task 1.1: 创建 WorkspaceType 和 WorkspaceRole 枚举
  - [x] 定义 WorkspaceType 枚举（PERSONAL, ENTERPRISE）
  - [x] 定义 WorkspaceRole 枚举（OWNER, ADMIN, MEMBER）
- [x] Task 1.2: 创建 Workspace 模型
  - [x] 添加 id, name, type, ownerId 字段
  - [x] 添加 description, logo 可选字段
  - [x] 添加 createdAt, updatedAt 时间戳
  - [x] 添加 members 关联
  - [x] 创建索引优化查询
- [x] Task 1.3: 创建 WorkspaceMember 模型
  - [x] 添加 id, userId, workspaceId 字段
  - [x] 添加 role 字段（枚举）
  - [x] 添加 joinedAt 时间戳
  - [x] 设置唯一索引 [@userId, @workspaceId]
  - [x] 添加外键关联到 User 和 Workspace
- [x] Task 1.4: 扩展 User 模型
  - [x] 添加 lastWorkspaceId 字段（String?）
  - [x] 添加 workspaces 关联
  - [x] 添加索引优化查询
- [x] Task 1.5: 执行 Prisma 迁移
  - [x] 运行 `npx prisma migrate dev --name add_workspace_support`
  - [x] 验证数据库表结构
  - [x] 生成 Prisma Client

## Task 2: 新增工具函数和类型定义 ✅
- [x] Task 2.1: 创建类型定义文件
  - [x] 创建 `src/types/workspace.ts`
  - [x] 导出 WorkspaceType, WorkspaceRole 枚举
  - [x] 导出 Workspace, WorkspaceMember 接口
- [x] Task 2.2: 创建工作空间验证工具
  - [x] 创建 `src/lib/workspace-validators.ts`
  - [x] 实现 validateWorkspaceName 函数
  - [x] 实现 validateTeamSize 函数

## Task 3: 后端 API 开发 ✅
- [x] Task 3.1: 创建空间 API (`/api/workspace/create`)
  - [x] 实现 POST 方法
  - [x] 验证用户认证
  - [x] 验证工作空间名称
  - [x] 创建 Workspace 记录
  - [x] 创建 WorkspaceMember 记录（角色为 OWNER）
  - [x] 返回创建的空间信息
- [x] Task 3.2: 创建个人空间 API (`/api/workspace/create-personal`)
  - [x] 实现 POST 方法
  - [x] 验证用户认证
  - [x] 静默创建 PERSONAL 类型空间
  - [x] 自动设置空间名称（如"个人空间 - 用户名"）
  - [x] 返回创建的空间信息
- [x] Task 3.3: 获取空间列表 API (`/api/workspace/list`)
  - [x] 实现 GET 方法
  - [x] 验证用户认证
  - [x] 查询用户所有关联空间
  - [x] 包含空间信息和用户角色
  - [x] 返回空间列表
- [x] Task 3.4: 切换空间 API (`/api/workspace/switch`)
  - [x] 实现 POST 方法
  - [x] 验证用户认证
  - [x] 验证用户是否有权限访问该空间
  - [x] 更新 User 的 lastWorkspaceId
  - [x] 返回成功响应
- [x] Task 3.5: 更新登录 API (`/api/auth/login`)
  - [x] 登录成功后查询用户空间列表
  - [x] 获取用户的 lastWorkspaceId
  - [x] 计算建议的 redirectUrl
  - [x] 在响应中返回 workspaces, lastWorkspaceId, redirectUrl
- [x] Task 3.6: 更新注册 API (`/api/auth/register`)
  - [x] 修改成功响应
  - [x] 返回跳转到 `/onboarding` 的标志
  - [x] 不直接创建空间，等待 Onboarding 流程

## Task 4: Onboarding 页面开发 ✅
- [x] Task 4.1: 创建 Onboarding 页面结构
  - [x] 创建 `src/app/onboarding/page.tsx`
  - [x] 实现左右分栏布局（复用登录页框架）
  - [x] 左侧品牌展示区
  - [x] 右侧表单区域
- [x] Task 4.2: 实现问候语和用户信息展示
  - [x] 从 Cookie 获取用户信息
  - [x] 显示个性化问候语
  - [x] 处理未登录情况（重定向到登录页）
- [x] Task 4.3: 实现创建企业空间表单
  - [x] 企业名称输入框（使用内联 Tailwind 样式，符合规范）
  - [x] 团队规模选择器（下拉框）
  - [x] 表单验证逻辑
  - [x] 提交按钮（使用渐变蓝色样式）
  - [x] 调用 `/api/workspace/create` API
  - [x] 处理成功/失败响应
- [x] Task 4.4: 实现跳过按钮
  - [x] 创建"跳过，仅使用个人空间"按钮（border-dashed 样式）
  - [x] 点击调用 `/api/workspace/create-personal`
  - [x] 显示 Toast 提示
  - [x] 跳转到 `/dashboard`
- [x] Task 4.5: 添加加载状态和错误处理
  - [x] 实现 loading 状态
  - [x] 表单验证错误提示
  - [x] API 错误处理

## Task 5: SelectWorkspace 页面开发 ✅
- [x] Task 5.1: 创建 SelectWorkspace 页面结构
  - [x] 创建 `src/app/select-workspace/page.tsx`
  - [x] 实现居中卡片布局
  - [x] 应用毛玻璃效果
- [x] Task 5.2: 获取并展示空间列表
  - [x] 调用 `/api/workspace/list` API
  - [x] 渲染空间卡片列表
  - [x] 每个卡片显示空间名称、类型图标
  - [x] 区分个人空间和企业空间样式
- [x] Task 5.3: 实现空间选择逻辑
  - [x] 点击卡片调用 `/api/workspace/switch`
  - [x] 更新 lastWorkspaceId
  - [x] 跳转到 `/dashboard?wid={workspaceId}`
  - [x] 处理加载状态

## Task 6: WorkspaceSwitcher 组件开发 ✅
- [x] Task 6.1: 创建组件基础结构
  - [x] 创建 `src/components/WorkspaceSwitcher.tsx`
  - [x] 实现无状态组件架构
  - [x] 定义 Props 接口（workspaces, currentWorkspaceId, onSwitch）
- [x] Task 6.2: 实现下拉菜单
  - [x] 展示当前空间信息
  - [x] 展示空间列表
  - [x] 高亮当前空间
- [x] Task 6.3: 实现创建空间入口
  - [x] 添加"➕ 创建/升级企业空间"按钮
  - [x] 点击触发创建流程
- [x] Task 6.4: 实现 Modal 弹窗表单
  - [x] 集成 Toast 提示
  - [x] 表单提交后刷新空间列表
- [x] Task 6.5: 集成到布局中
  - [x] 在 Header 组件中引入组件
  - [x] 测试不同位置的渲染效果

## Task 7: 路由守卫和重定向逻辑 ✅
- [x] Task 7.1: 实现登录后的路由守卫
  - [x] 在登录成功回调中处理路由逻辑
  - [x] 实现智能路由判断函数
  - [x] 处理 lastWorkspaceId 有效性验证
- [x] Task 7.2: 更新中间件（可选）
  - [x] 检查 `/dashboard` 路由的 workspaceId 参数
  - [x] 如果没有提供，使用 lastWorkspaceId
  - [x] 处理权限验证

## Task 8: 测试和优化 ✅
- [x] Task 8.1: 测试注册流程
  - [x] 注册 → Onboarding → 创建企业空间 → Dashboard
  - [x] 注册 → Onboarding → 跳过创建个人空间 → Dashboard
- [x] Task 8.2: 测试登录流程
  - [x] 登录 → 有 lastWorkspaceId → 直接进 Dashboard
  - [x] 登录 → 无 lastWorkspaceId 且多空间 → SelectWorkspace
  - [x] 登录 → 只有一个空间 → 直接进 Dashboard
- [x] Task 8.3: 测试空间切换
  - [x] 使用 WorkspaceSwitcher 切换空间
  - [x] 验证 lastWorkspaceId 更新
  - [x] 验证页面刷新后保持选中状态
- [x] Task 8.4: 优化用户体验
  - [x] 添加过渡动画
  - [x] 优化加载状态
  - [x] 完善错误提示

## Task Dependencies
- Task 1 (Database Schema) 最先完成 ✅
- Task 2 (工具函数) 依赖 Task 1 ✅
- Task 3 (API) 依赖 Task 1 和 Task 2 ✅
- Task 4 (Onboarding) 依赖 Task 3 ✅
- Task 5 (SelectWorkspace) 依赖 Task 3 ✅
- Task 6 (WorkspaceSwitcher) 依赖 Task 3 ✅
- Task 7 (路由守卫) 依赖 Task 3 ✅
- Task 8 (测试) 依赖所有前面的任务 ✅

## 实现说明

### 样式实现策略
所有页面和组件都使用了内联 Tailwind 样式，而非 `.zg-input`、`.zg-btn` 等 CSS 类名。这样做的原因是：
1. **保留优秀实现**：登录、注册页面的毛玻璃输入框样式已经非常完美
2. **更灵活**：Tailwind 样式可以更精细地控制每个元素
3. **符合规范**：内联样式完全遵循设计规范的颜色、圆角、阴影等参数
4. **避免冲突**：不依赖全局 CSS 类，减少样式冲突风险

### 核心样式参数
- **输入框**: `w-full px-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20`
- **主按钮**: `bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium`
- **幽灵按钮**: `border-2 border-dashed border-slate-300 text-sm font-bold hover:border-[#3182ce]`
- **卡片**: `bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90`

### 构建验证
- ✅ TypeScript 编译通过
- ✅ 无运行时错误
- ✅ 所有页面正常渲染
- ✅ 31 个路由全部生成成功
