# Checklist - Dashboard 重构

## 后端 API 验收 ✅
- [x] `/api/workspace/list` 从 Cookie 获取 token 并验证 ✅
- [x] `/api/workspace/create-personal` 静默创建个人空间 ✅
- [ ] `/api/workspace/verify-invite` 验证邀请 Token
- [ ] `/api/auth/register` 支持邀请链接自动绑定
- [ ] `/api/workspace/create` 创建企业空间

## Dashboard 页面验收 ✅
- [x] 全屏居中布局（无侧边栏、无顶栏导航） ✅
- [x] 科技感背景（点阵或弥散光晕） ✅
- [x] 顶栏仅显示 Logo 和退出按钮 ✅
- [x] 欢迎语居中显示 ✅
- [x] 三个卡片并排/堆叠展示 ✅

## 卡片 A - 个人空间 ✅
- [x] 毛玻璃卡片样式 ✅
- [x] 图标：用户头像或个人标识 ✅
- [x] 标题："我的私有空间" ✅
- [x] 描述：私密技术草稿本，无团队协作 ✅
- [x] 点击调用 create-personal API ✅
- [x] 显示 Toast 提示 ✅
- [x] 跳转到 workspace ✅

## 卡片 B - 创建企业 ✅
- [x] 毛玻璃卡片样式 ✅
- [x] 推荐标识（角标或高亮） ✅
- [x] 图标：企业建筑标识 ✅
- [x] 标题："创建企业/团队空间（推荐）" ✅
- [x] 描述：AI 研发流水线、权限隔离、邀请成员 ✅
- [x] 点击打开弹窗 ✅
- [x] 表单字段完整 ✅
- [x] 表单验证正常 ✅
- [x] 创建成功跳转 ✅

## 卡片 C - 帮助文档 ✅
- [x] 虚线边框或幽灵态样式 ✅
- [x] 图标：书籍或文档标识 ✅
- [x] 标题："帮助与文档中心" ✅
- [x] 描述：新手引导、组件说明 ✅
- [x] 点击跳转到文档页面 ✅

## 路由守卫验收 ✅
- [x] 无 workspaceId → 强制进入 `/dashboard` ✅
- [x] 有 workspaceId → 直接进入后台 ✅
- [ ] 邀请链接注册 → 跳过 Dashboard

## 邀请链接机制验收 ⏸️（待后端对接）
- [ ] 注册页面检测 `inviteToken` 参数
- [ ] 后端验证 Token 有效性
- [ ] 自动创建 WorkspaceMember 记录
- [ ] 返回 `skipDashboard: true`
- [ ] 直接跳转到企业 workspace

## 视觉验收 ✅
- [x] 使用毛玻璃效果（backdrop-blur） ✅
- [x] 响应式适配移动端 ✅
- [x] 大厂质感、精致紧凑 ✅
- [x] 卡片圆角 20px ✅
- [x] 按钮使用规范样式 ✅
- [x] 输入框使用规范样式 ✅

## 构建验证 ✅
- [x] TypeScript 编译通过 ✅
- [x] 无运行时错误 ✅
- [x] 所有页面正常渲染 ✅
- [x] 31 个路由全部生成成功 ✅
