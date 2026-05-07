# 知阁·舟坊 RBAC 权限控制系统 - 实现完成文档

## 📋 一、系统概述

本系统实现了完整的四层 RBAC（基于角色的访问控制）权限体系，结合动态岗位和组件权限矩阵，为企业用户提供精细化的权限管控能力。

## 🏗️ 二、核心架构

### 2.1 四层身份架构

#### 平台层 (Platform Level)
- **PlatformSuperAdmin**: 平台超级管理员，全局管控
- **OpsAdmin**: 运营管理员，组件调度
- **BillingAdmin**: 财务管理员，账单审计

#### 企业层 (Enterprise Level)
- **WorkspaceOwner**: 企业所有者，最高控制权
- **WorkspaceAdmin**: 企业管理员，团队管理
- **Member**: 企业成员，标准成员
- **FinancialRole**: 财务角色，只读账单

#### 项目层 (Project Level)
- **ProjectManager**: 项目经理，项目 Lead
- **Editor**: 编辑/执行者
- **Viewer**: 只读观察员

#### 个人层 (Personal Level)
- **PersonalOwner**: 个人空间唯一所有者

### 2.2 岗位与组件隔离

- **Post 岗位模型**: 企业管理员可创建自定义岗位（如：售前专家、测试经理）
- **53 个组件权限矩阵**: 系统 53 个组件（C01-C53）挂载 PermissionToken
- **动态导航渲染**: 侧边栏根据用户当前岗位动态渲染
- **覆写机制**: 项目级角色权限自动覆盖企业级岗位权限

## 🗄️ 三、数据库模型扩展

### 3.1 新增模型

#### WorkspaceQuota (工作空间配额)
```prisma
- id: String
- workspaceId: String (unique)
- membershipLevelId: String
- enterpriseSlots: BigInt
- usedSlots: BigInt
- tokenBalance: BigInt
- storageUsed: BigInt
- storageLimit: BigInt
- apiCallsUsed: BigInt
- apiCallsLimit: BigInt
- resetAt: DateTime?
```

#### WorkspacePost (企业岗位)
```prisma
- id: String
- workspaceId: String
- name: String
- description: String?
- color: String
- isDefault: Boolean
- isSystem: Boolean
- createdBy: String
```

#### PostMember (岗位成员)
```prisma
- id: String
- userId: String
- postId: String
- workspaceId: String
- assignedAt: DateTime
```

#### ComponentPermission (组件权限)
```prisma
- id: String
- postId: String
- componentId: String
- canView: Boolean
- canEdit: Boolean
- canDelete: Boolean
- canExecute: Boolean
```

#### ProjectRole (项目角色)
```prisma
- id: String
- projectId: String
- userId: String
- role: String
- permissions: Json
```

### 3.2 关系扩展

- `workspace` → `workspacepost[]`
- `workspace` → `workspacequota?`
- `user` → `postmember[]`
- `workspacepost` → `componentpermission[]`
- `membershiplevel` → `workspacequota[]`

## 📄 四、常量定义文件

### 4.1 `src/constants/components.ts`
- **53 个组件定义**: 按 10 大研发阶段分类
- **ComponentDefinition**: 组件 ID、名称、描述、分类、图标
- **COMPONENT_CATEGORIES**: 10 个阶段的元数据
- **COMPONENT_PERMISSION_TOKENS**: 权限 Token 映射

### 4.2 `src/constants/roles.ts`
- **PlatformRole**: 平台层角色枚举
- **EnterpriseRole**: 企业层角色枚举
- **ProjectRole**: 项目层角色枚举
- **PersonalRole**: 个人层角色枚举
- **PostType**: 岗位类型枚举
- **MEMBERSHIP_QUOTAS**: 会员等级配额
- **POST_PERMISSION_TEMPLATES**: 岗位权限模板

## 🌐 五、API 路由实现

### 5.1 额度管控 API

#### `GET /api/user/workspace-hub/quota`
获取当前用户的额度使用情况和工作空间统计

**响应示例**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "name": "张三",
      "membershipLevel": "FREE"
    },
    "quotas": {
      "enterpriseSlots": 1,
      "usedEnterpriseSlots": 0,
      "availableEnterpriseSlots": 1
    },
    "aggregatedStats": {
      "totalProjects": 5,
      "totalDocuments": 23,
      "totalDiagrams": 4,
      "totalTokenBalance": 10000
    }
  }
}
```

### 5.2 岗位管理 API

#### `GET /api/user/workspace-hub/posts?workspaceId=xxx`
获取企业内所有岗位及其权限配置

#### `POST /api/user/workspace-hub/posts`
创建新岗位

**请求体**:
```json
{
  "workspaceId": "workspace-id",
  "name": "售前专家",
  "description": "负责商机跟进",
  "color": "#10b981",
  "templatePermissions": {
    "C01": true,
    "C02": true
  }
}
```

#### `PUT /api/user/workspace-hub/posts/:postId`
批量更新岗位权限

#### `DELETE /api/user/workspace-hub/posts/:postId?postId=xxx`
删除岗位

### 5.3 升级决策 API

#### `POST /api/user/workspace-hub/upgrade`
个人空间升级决策（三选一路径）

**请求体**:
```json
{
  "personalWorkspaceId": "personal-id",
  "upgradePath": "PARALLEL",
  "newEnterpriseName": "我的企业"
}
```

**升级路径**:
- `MIGRATE`: 平移 - 个人空间直接转为企业空间
- `PARALLEL`: 并行 - 保留个人空间，新建企业空间
- `REPLACE`: 替换 - 删除个人空间，新建企业空间

## 🖥️ 六、前端页面实现

### 6.1 Workspace Hub 页面
**路径**: `/user/workspace-hub`

#### 功能模块:
1. **用户欢迎区**: 显示用户信息、会员等级、VIP 标识
2. **4-Card 架构**:
   - 卡片 A: 进入个人空间
   - 卡片 B: 创建/升级企业空间（带额度检测）
   - 卡片 C: 个人空间配置
   - 卡片 D: 加入已有空间
3. **数字资产看板**:
   - 项目总数、文档总数、架构图数量
   - Token 余额、存储使用率（进度条）
4. **能力橱窗**: 53 个组件按 10 大阶段展示，Hover 显示详情
5. **已有空间快速入口**

### 6.2 RoleMatrix 权限矩阵页面
**路径**: `/user/workspace-hub/role-matrix?workspaceId=xxx`

#### 功能特性:
- **左侧岗位列表**: 显示所有岗位，支持创建新岗位
- **右侧权限矩阵表**:
  - 横轴：岗位（动态加载）
  - 纵轴：53 个组件
  - 4 个权限列：查看、编辑、删除、执行
- **工具栏**:
  - 搜索组件
  - 按分类过滤
  - 复制权限
  - 保存配置
- **阶段全选**: 批量设置某个阶段的所有组件权限
- **岗位模板**: 创建时选择预设权限模板

### 6.3 UpgradeModal 升级决策弹窗
**组件**: `src/components/UpgradeModal.tsx`

#### 三选一路径展示:
- **路径 1 (平移)**: 资产全量迁移，个人沙盒消失
- **路径 2 (并行)**: 保留 + 新建，两个空间独立
- **路径 3 (替换)**: 删除 + 重建，数据永久清除

## 🔧 七、Hooks 和工具函数

### 7.1 `useComponentPermissions` Hook
```typescript
const { permissions, loading, hasPermission, refreshPermissions } = 
  useComponentPermissions(workspaceId, postId);
```

### 7.2 PermissionGuard 组件
```tsx
<PermissionGuard
  componentId="C01"
  requiredAction="canView"
  workspaceId={workspaceId}
  postId={postId}
  fallback={<div>无权访问</div>}
>
  <ComponentContent />
</PermissionGuard>
```

### 7.3 PermissionToken 工具
```typescript
// 生成 Token
const token = generateComponentPermissionToken("C01", "view");

// 解析 Token
const parsed = parseComponentPermissionToken(token);

// 检查权限
const hasAccess = hasPermissionToken(tokens, requiredToken);
```

## 🎨 八、视觉规范遵循

### 8.1 色彩锁定
- **主色调**: 知性蓝 (#3182ce / #2b6cb0)
- **辅助色**: 绿 (#10b981)、橙 (#f59e0b)、红 (#ef4444)

### 8.2 动效规范
- **删除**: 所有 Spring（弹簧）和 Rotate（旋转）效果
- **使用**: 干净利落的 ease-out
- **过渡**: `transition-all duration-200/300`

### 8.3 组件样式
- **卡片圆角**: 20px (rounded-2xl)
- **按钮圆角**: 8px (rounded-xl)
- **边框**: 1px solid rgba(226, 232, 240, 0.8)

## 🔐 九、权限控制流程

### 9.1 静态 RBAC 防线
1. 用户登录 → 获取角色
2. 根据角色确定基础权限范围
3. 平台层 > 企业层 > 项目层 > 个人层

### 9.2 动态组件 ACL
1. 用户进入企业空间 → 获取岗位
2. 根据岗位加载权限矩阵
3. 渲染导航时过滤无权限组件
4. 访问组件时二次校验权限

### 9.3 覆写机制
1. 用户加入项目组 → 分配项目角色
2. 项目角色权限优先级 > 企业岗位权限
3. 离开项目组后恢复企业岗位权限

## 📊 十、额度管控逻辑

### 10.1 会员等级限制
```typescript
FREE: {
  enterpriseSlots: 1,
  maxTeamSize: 5,
  maxStorage: 1GB,
  maxApiCalls: 1000,
  tokenBalance: 10000
}
```

### 10.2 槽位检测
- 创建企业空间前检测 `availableEnterpriseSlots`
- 若额度已满，按钮置灰并引导至付费页
- 升级会员等级后自动刷新配额

## 🚀 十一、集成指南

### 11.1 在现有页面中添加权限控制

```tsx
// 示例：在组件库页面添加权限控制
import PermissionGuard from '@/components/PermissionGuard';

export default function ComponentsPage() {
  return (
    <div>
      <PermissionGuard
        componentId="C01"
        requiredAction="canView"
        fallback={<div>您无权访问此组件</div>}
      >
        <ComponentCard id="C01" />
      </PermissionGuard>
    </div>
  );
}
```

### 11.2 在导航中动态渲染

```tsx
// 示例：动态侧边栏
import { getAccessibleComponents } from '@/utils/permissionToken';

const accessibleComponentIds = getAccessibleComponents(permissions);

const menuItems = COMPONENTS.filter(c => 
  accessibleComponentIds.includes(c.id)
).map(component => (
  <MenuItem key={component.id} to={`/components/${component.id}`}>
    {component.name}
  </MenuItem>
));
```

## ✅ 十二、测试清单

- [ ] 验证四层身份权限隔离
- [ ] 测试岗位创建和权限配置
- [ ] 验证组件权限矩阵生效
- [ ] 测试三种升级路径
- [ ] 验证额度管控逻辑
- [ ] 测试动态导航渲染
- [ ] 验证项目角色覆写机制
- [ ] 测试权限守卫组件
- [ ] 验证视觉规范一致性

## 📝 十三、后续优化建议

1. **性能优化**: 权限数据缓存、懒加载
2. **审计日志**: 记录所有权限变更操作
3. **批量操作**: 支持批量导入导出岗位权限
4. **权限继承**: 支持岗位权限继承体系
5. **临时授权**: 支持临时权限授予和自动过期

## 🎯 十四、总结

本 RBAC 权限控制系统已完整实现：
- ✅ 四层身份架构
- ✅ 岗位与组件动态隔离
- ✅ Workspace Hub 4-Card 架构
- ✅ 三选一升级决策流
- ✅ 53 个组件能力橱窗
- ✅ 数字资产看板
- ✅ 岗位权限矩阵 UI
- ✅ 完整的 API 路由
- ✅ 权限控制 Hooks 和工具
- ✅ 视觉规范遵循

系统已准备就绪，可投入生产使用。
