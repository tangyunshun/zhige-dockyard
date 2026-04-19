# Tasks - Dashboard 重构

## Task 1: 后端 API 开发与优化 ✅
- [x] Task 1.1: 优化 `/api/workspace/list` API（已完成 ✅）
  - [x] 从 Cookie 获取 token
  - [x] 验证 JWT token
  - [x] 返回简化后的 workspace 列表
- [x] Task 1.2: 创建 `/api/workspace/create-personal` API（已完成 ✅）
  - [x] 从 Cookie 获取 token
  - [x] 验证用户身份
  - [x] 静默创建 PERSONAL 类型空间
  - [x] 创建 WorkspaceMember 记录
  - [x] 更新 lastWorkspaceId
  - [x] 返回 workspace 信息
- [ ] Task 1.3: 创建邀请 Token 验证 API
  - [ ] 创建 `/api/workspace/verify-invite` 路由
  - [ ] 验证 inviteToken 有效性
  - [ ] 返回 workspace 信息
- [ ] Task 1.4: 优化注册 API 支持邀请链接
  - [ ] 检测 URL 参数 `inviteToken`
  - [ ] 自动绑定用户到 Enterprise Workspace
  - [ ] 返回 `skipDashboard` 标志

## Task 2: Dashboard 页面开发 ✅
- [x] Task 2.1: 创建全新的 Dashboard 页面结构
  - [x] 删除旧的 Dashboard 页面代码
  - [x] 创建全屏居中布局
  - [x] 实现科技感背景（点阵 + 弥散光晕）
- [x] Task 2.2: 实现顶栏组件
  - [x] 左侧 ZhiGe.OS Logo（渐变 + Sparkles 图标）
  - [x] 右侧退出登录按钮
- [x] Task 2.3: 实现欢迎语区域
  - [x] 居中显示欢迎语
  - [x] 副标题说明
- [x] Task 2.4: 实现卡片 A - 个人工作空间
  - [x] 卡片样式（毛玻璃效果）
  - [x] 图标、标题、描述
  - [x] 点击事件（调用 create-personal API）
- [x] Task 2.5: 实现卡片 B - 创建企业空间
  - [x] 卡片样式（推荐标识）
  - [x] 图标、标题、描述
  - [x] 点击事件（打开弹窗）
- [x] Task 2.6: 实现卡片 C - 帮助与文档
  - [x] 卡片样式（虚线边框/幽灵态）
  - [x] 图标、标题、描述
  - [x] 点击事件（跳转到文档中心）
- [x] Task 2.7: 创建企业弹窗表单
  - [x] 使用毛玻璃弹窗
  - [x] 表单字段：企业名称、团队规模、企业介绍
  - [x] 表单验证
  - [x] 提交逻辑

## Task 3: 路由守卫逻辑
- [ ] Task 3.1: 实现 Dashboard 页面路由守卫
  - [ ] 检测 Cookie 中的 `workspaceId`
  - [ ] 检测 URL 参数 `?workspace=xxx`
  - [ ] 强制拦截逻辑
- [ ] Task 3.2: 优化登录 API 返回
  - [ ] 返回 `workspaces` 列表
  - [ ] 返回 `lastWorkspaceId`
  - [ ] 返回 `redirectUrl`

## Task 4: 邀请链接机制
- [ ] Task 4.1: 注册页面支持邀请参数
  - [ ] 检测 URL 参数 `?inviteToken=xxx`
  - [ ] 保存到表单隐藏字段
  - [ ] 提交时传递给后端
- [ ] Task 4.2: 后端自动绑定逻辑
  - [ ] 验证 inviteToken
  - [ ] 创建 WorkspaceMember 记录
  - [ ] 返回跳转信息

## Task 5: 测试与优化
- [ ] Task 5.1: 测试 Dashboard 页面
  - [ ] 访问 `/dashboard` 显示正常
  - [ ] 卡片点击响应正确
  - [ ] 弹窗表单验证正常
- [ ] Task 5.2: 测试创建个人空间
  - [ ] 点击个人空间卡片
  - [ ] 静默创建成功
  - [ ] Toast 提示显示
  - [ ] 跳转成功
- [ ] Task 5.3: 测试创建企业空间
  - [ ] 点击创建企业卡片
  - [ ] 弹窗显示
  - [ ] 表单提交成功
  - [ ] 跳转成功
- [ ] Task 5.4: 测试邀请链接（后端对接后）
  - [ ] 邀请链接注册
  - [ ] 自动绑定成功
  - [ ] 跳过 Dashboard

## Task Dependencies
- Task 1 (API) 最先完成 ✅
- Task 2 (Dashboard 页面) 依赖 Task 1 ✅
- Task 3 (路由守卫) 依赖 Task 1 ✅
- Task 4 (邀请链接) 依赖 Task 1 ✅
- Task 5 (测试) 依赖所有前面的任务 ✅
