# Dashboard 重构规范 - PLG 商业闭环

## 为什么重构

**现有问题**：
1. ❌ 在个人空间上下文中加载团队管理功能（架构错误）
2. ❌ 未明确工作空间就加载业务组件（逻辑混乱）
3. ❌ 缺少邀请链接自动绑定机制
4. ❌ 缺少独立的路由守卫逻辑

**重构目标**：
- ✅ 独立的 `/dashboard` 页面（全屏居中布局，无侧边栏）
- ✅ 强制路由拦截（未选择 workspace 必须进入此页面）
- ✅ 清晰的 PLG 流转逻辑（个人空间 → 企业空间升级通道）
- ✅ 邀请链接自动绑定机制

---

## 核心业务逻辑

### 1. 路由守卫逻辑

```typescript
// 登录成功后的路由判断
if (hasValidWorkspaceId) {
  // 直接跳转到对应 workspace 的后台
  redirect(`/workspace/${workspaceId}`);
} else {
  // 强制拦截到独立 Dashboard 页面
  redirect('/dashboard');
}
```

### 2. 邀请链接自动绑定

**流程**：
```
用户点击邀请链接 → /register?inviteToken=xyz
  → 完成注册
  → 后端自动绑定到 Enterprise Workspace
  → 跳过 /dashboard
  → 直接进入企业工作台 /workspace/{workspaceId}
```

**后端伪代码**：
```typescript
// /api/auth/register route.ts
POST /api/auth/register
  - 检测 URL 参数：inviteToken
  - 如果存在 inviteToken:
    - 验证 token 有效性
    - 获取对应的 workspaceId
    - 创建 WorkspaceMember 记录（role: MEMBER）
    - 返回 { skipDashboard: true, workspaceId }
  - 否则：
    - 返回 { skipDashboard: false }
```

### 3. 空间升级通道

**明确边界**：
- **个人空间**：私有草稿本，无团队管理功能
- **企业空间**：支持协同、权限隔离、邀请成员

**升级路径**：
```
个人空间用户 → 点击"创建企业空间" → 填写企业信息
  → 创建 Enterprise Workspace
  → 自动成为 OWNER
  → 生成邀请链接
  → 邀请成员加入
```

---

## Dashboard 页面规范

### 页面布局

**背景**：
- 选项 A：深色科技感点阵背景
- 选项 B：浅灰背景 + 微弱品牌色弥散光晕

**顶栏**：
- 左侧：ZhiGe.OS Logo
- 右侧：仅"退出登录"幽灵按钮

**核心区**：
- 居中欢迎语："欢迎来到知阁·舟坊！请选择您的工作空间"

**卡片矩阵**：
1. **卡片 A**：个人工作空间
2. **卡片 B**：创立企业空间（推荐）
3. **卡片 C**：帮助与文档中心（视觉比重略轻）

---

## 数据流程

### 创建企业空间流程

```
用户点击"创建企业空间" → 弹出 .zg-modal 表单
  → 填写：企业名称、团队规模、企业介绍
  → 提交到 /api/workspace/create
  → 创建 Workspace (type: ENTERPRISE)
  → 创建 WorkspaceMember (role: OWNER)
  → 更新 User.lastWorkspaceId
  → 跳转到 /workspace/{workspaceId}
```

### 选择个人空间流程

```
用户点击"个人工作空间" → 调用 /api/workspace/create-personal
  → 静默创建 Workspace (type: PERSONAL)
  → 创建 WorkspaceMember (role: OWNER)
  → 更新 User.lastWorkspaceId
  → 显示 Toast 提示
  → 跳转到 /workspace/{workspaceId}
```

---

## 技术实现要点

### 1. 独立路由守卫

- 检测 Cookie 中的 `workspaceId`
- 检测 URL 参数 `?workspace=xxx`
- 如果都没有，强制停留在 `/dashboard`

### 2. 邀请 Token 验证

- 后端提供 `/api/workspace/verify-invite` API
- 验证 inviteToken 有效性
- 返回 workspace 信息

### 3. 创建企业弹窗

- 使用 `.zg-modal` 组件
- 表单字段：
  - 企业名称（必填）
  - 团队规模（下拉选择）
  - 企业介绍（可选）
- 表单验证：企业名称不能为空

---

## 验收标准

### 功能验收
- [ ] 登录成功且无 workspaceId → 进入 `/dashboard`
- [ ] 有 workspaceId → 直接进入后台
- [ ] 邀请链接注册 → 自动绑定并跳过 Dashboard
- [ ] 创建个人空间 → 静默创建并跳转
- [ ] 创建企业空间 → 弹窗表单 → 创建并跳转

### 视觉验收
- [ ] 全屏居中布局，无侧边栏
- [ ] 使用 `.zg-modal`、`.zg-card` 等规范组件
- [ ] 卡片设计精致，信息密度适中
- [ ] 响应式适配移动端

### 架构验收
- [ ] 路由守卫逻辑正确
- [ ] 邀请链接自动绑定机制完整
- [ ] 空间升级通道清晰
- [ ] 个人空间与企业空间边界明确
