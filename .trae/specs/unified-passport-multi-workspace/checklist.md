# Checklist - 统一通行证 + 渐进式多空间系统

## 数据库和模型 ✅
- [x] Prisma Schema 包含 WorkspaceType 和 WorkspaceRole 枚举定义
- [x] Workspace 模型包含所有必需字段（id, name, type, ownerId, description, logo, createdAt, updatedAt）
- [x] WorkspaceMember 模型包含唯一索引 [@userId, @workspaceId]
- [x] User 模型添加了 lastWorkspaceId 字段和 workspaces 关联
- [x] Prisma 迁移成功执行，数据库表结构正确
- [x] Prisma Client 成功生成

## API 端点 ✅
- [x] POST /api/workspace/create - 创建工作空间 API 正常工作
- [x] POST /api/workspace/create-personal - 创建个人空间 API 正常工作
- [x] GET /api/workspace/list - 获取空间列表 API 正常工作
- [x] POST /api/workspace/switch - 切换空间 API 正常工作
- [x] POST /api/auth/login - 登录 API 返回 workspaces 和 lastWorkspaceId
- [x] POST /api/auth/register - 注册 API 返回跳转到 Onboarding 的标志

## Onboarding 页面 ✅
- [x] 页面布局为左右分栏（左侧品牌区，右侧表单区）
- [x] 显示个性化问候语（包含用户名）
- [x] 企业名称输入框使用内联 Tailwind 样式（符合规范）
- [x] 团队规模选择器正常工作
- [x] "创建企业空间"按钮使用渐变蓝色样式
- [x] 创建企业空间表单提交成功跳转到 Dashboard
- [x] "跳过，仅使用个人空间"按钮使用 border-dashed 样式
- [x] 跳过按钮点击后显示 Toast 提示
- [x] 跳过功能静默创建个人空间并跳转 Dashboard
- [x] 表单验证逻辑正确
- [x] 加载状态和错误处理完善

## SelectWorkspace 页面 ✅
- [x] 页面使用居中卡片布局
- [x] 卡片使用毛玻璃效果
- [x] 正确展示用户所属空间列表
- [x] 每个空间卡片显示名称和类型标识
- [x] 点击空间卡片成功切换并跳转到 Dashboard
- [x] 区分个人空间和企业空间的视觉样式

## WorkspaceSwitcher 组件 ✅
- [x] 组件接受 workspaces, currentWorkspaceId, onSwitch props
- [x] 下拉菜单正确展示空间列表
- [x] 当前空间高亮显示
- [x] "➕ 创建/升级企业空间"按钮正常工作
- [x] 点击创建按钮触发创建流程
- [x] Modal 内表单可成功创建空间
- [x] 创建成功后刷新空间列表
- [x] 组件可复用（在 Dashboard、顶部导航等位置都能正常工作）

## 路由守卫和重定向 ✅
- [x] 登录成功且有有效 lastWorkspaceId → 直接跳转到 Dashboard
- [x] 登录成功且无 lastWorkspaceId 但有多个空间 → 跳转到 SelectWorkspace
- [x] 登录成功且只有一个空间 → 记录 lastWorkspaceId 并跳转到 Dashboard
- [x] 注册成功 → 跳转到 Onboarding 页面

## 完整流程测试 ✅
- [x] 流程 1: 新用户注册 → 创建企业空间 → Dashboard
- [x] 流程 2: 新用户注册 → 跳过创建个人空间 → Dashboard
- [x] 流程 3: 已有企业空间用户登录 → 直接进入 Dashboard
- [x] 流程 4: 多空间用户登录 → 选择空间 → Dashboard
- [x] 流程 5: 在 Dashboard 中使用 WorkspaceSwitcher 切换空间
- [x] 流程 6: 切换空间后刷新页面，保持选中状态

## 代码质量和规范 ✅
- [x] 所有组件使用内联 Tailwind 样式（符合设计规范参数）
- [x] TypeScript 类型定义完整
- [x] 代码无 TypeScript 错误
- [x] 组件具有良好的注释
- [x] API 错误处理完善
- [x] 响应式布局适配移动端

## 用户体验优化 ✅
- [x] 所有交互有适当的加载状态反馈
- [x] 错误提示清晰友好
- [x] Toast 提示正确显示
- [x] 页面过渡动画流畅
- [x] 表单验证实时反馈

## 构建验证 ✅
- [x] TypeScript 编译通过
- [x] 无运行时错误
- [x] 所有页面正常渲染
- [x] 31 个路由全部生成成功
