# RBAC 权限系统 - 快速启动指南

## 🚀 一、部署步骤

### 1. 数据库迁移

由于添加了新的数据模型，需要执行数据库迁移：

```bash
# 停止开发服务器（如果有运行）
# 按 Ctrl+C 停止

# 1. 格式化 Prisma Schema
npx prisma format

# 2. 创建迁移文件
npx prisma migrate dev --name add_rbac_models

# 如果遇到文件锁定错误（EPERM），请重启电脑后再次执行
```

### 2. 生成 Prisma 客户端

```bash
npx prisma generate
```

### 3. 初始化测试数据（可选）

在开发环境中，可以通过以下方式初始化测试数据：

```typescript
// 在 API 路由或脚本中调用
import { initializeRBACData, createWorkspaceQuota } from '@/lib/rbac-init';

// 为企业空间初始化 RBAC 数据
await initializeRBACData('workspace-id', 'user-id');

// 创建工作空间配额
await createWorkspaceQuota('workspace-id', 'membership-level-id', {
  enterpriseSlots: BigInt(1),
  tokenBalance: BigInt(10000),
  storageLimit: BigInt(1073741824),
  apiCallsLimit: BigInt(1000),
});
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 🧪 二、功能测试流程

### 测试 1: Workspace Hub 页面

1. **访问页面**: http://localhost:3000/user/workspace-hub
2. **验证内容**:
   - [ ] 用户信息正确显示
   - [ ] 4-Card 架构布局正常
   - [ ] 数字资产看板数据准确
   - [ ] 能力橱窗 53 个组件完整展示
   - [ ] Hover 组件显示详情说明

### 测试 2: 创建企业空间

1. **点击"创建企业空间"卡片**
2. **验证额度检测**:
   - [ ] 免费用户显示剩余 1 个槽位
   - [ ] 槽位已满时按钮置灰
3. **创建流程**:
   - [ ] 跳转到创建页面
   - [ ] 成功创建后显示在企业空间列表

### 测试 3: 升级决策弹窗

1. **在个人空间卡片点击"升级"**
2. **验证弹窗显示**:
   - [ ] 三路径选项清晰展示
   - [ ] 每个路径的说明准确
   - [ ] 警告提示正确显示
3. **测试各路径**:
   - [ ] 选择"平移"路径并完成升级
   - [ ] 选择"并行"路径并完成升级
   - [ ] 选择"替换"路径并完成升级

### 测试 4: 权限矩阵页面

1. **访问**: http://localhost:3000/user/workspace-hub/role-matrix?workspaceId=xxx
2. **验证功能**:
   - [ ] 左侧岗位列表显示
   - [ ] 右侧权限矩阵表完整
   - [ ] Checkbox 可点击切换
   - [ ] 搜索组件功能正常
   - [ ] 分类过滤生效
   - [ ] 保存权限配置成功

### 测试 5: 创建岗位

1. **点击岗位列表上方"+"按钮**
2. **填写信息**:
   - [ ] 岗位名称（必填）
   - [ ] 岗位描述（可选）
   - [ ] 选择权限模板
3. **验证创建**:
   - [ ] 创建成功提示
   - [ ] 新岗位出现在列表中
   - [ ] 默认权限配置已应用

### 测试 6: 权限控制验证

1. **使用不同角色账号登录**
2. **验证访问控制**:
   - [ ] 无权限组件不显示或显示禁用
   - [ ] 有权限组件正常访问
   - [ ] 权限变更后立即生效

## 📊 三、API 测试

### 使用 Postman 或类似工具测试 API

#### 1. 获取额度信息

```http
GET http://localhost:3000/api/user/workspace-hub/quota
Authorization: Bearer {your-token}
```

**预期响应**: 200 OK，包含额度数据和统计信息

#### 2. 获取岗位列表

```http
GET http://localhost:3000/api/user/workspace-hub/posts?workspaceId={workspace-id}
Authorization: Bearer {your-token}
```

**预期响应**: 200 OK，包含岗位列表和权限矩阵

#### 3. 创建岗位

```http
POST http://localhost:3000/api/user/workspace-hub/posts
Authorization: Bearer {your-token}
Content-Type: application/json

{
  "workspaceId": "{workspace-id}",
  "name": "测试岗位",
  "description": "用于测试",
  "color": "#10b981",
  "templatePermissions": {
    "C01": true,
    "C02": true
  }
}
```

**预期响应**: 200 OK，包含创建的岗位信息

#### 4. 升级工作空间

```http
POST http://localhost:3000/api/user/workspace-hub/upgrade
Authorization: Bearer {your-token}
Content-Type: application/json

{
  "personalWorkspaceId": "{personal-id}",
  "upgradePath": "PARALLEL",
  "newEnterpriseName": "测试企业"
}
```

**预期响应**: 200 OK，包含升级结果

## 🐛 四、常见问题排查

### 问题 1: 数据库迁移失败

**错误**: `EPERM: operation not permitted, rename`

**解决方案**:
1. 停止开发服务器
2. 关闭所有占用文件的程序
3. 重启电脑
4. 再次执行迁移命令

### 问题 2: 页面加载失败

**错误**: `Load dashboard failed` 或其他加载错误

**解决方案**:
1. 检查浏览器控制台错误
2. 验证 API 路由是否正确部署
3. 确认 Prisma 客户端已生成
4. 清除 `.next` 缓存并重启服务器

### 问题 3: 权限控制不生效

**现象**: 所有组件都能访问或都不能访问

**解决方案**:
1. 检查数据库中 `componentpermission` 表是否有数据
2. 验证 `workspacepost` 和 `postmember` 关联是否正确
3. 检查前端是否正确传递 `workspaceId` 和 `postId`
4. 查看浏览器网络请求，确认 API 返回正确的权限数据

### 问题 4: 升级决策失败

**错误**: "企业空间槽位已用完"

**解决方案**:
1. 检查用户会员等级
2. 验证 `MEMBERSHIP_QUOTAS` 配置
3. 确认当前企业空间数量
4. 如需测试，可临时修改配额限制

## 📝 五、数据验证 SQL

### 查看岗位数据

```sql
SELECT * FROM workspacepost WHERE workspaceId = 'your-workspace-id';
```

### 查看权限配置

```sql
SELECT cp.*, c.name as componentName
FROM componentpermission cp
JOIN workspacepost p ON cp.postId = p.id
LEFT JOIN componenttask c ON cp.componentId = c.id
WHERE p.workspaceId = 'your-workspace-id';
```

### 查看配额使用

```sql
SELECT wq.*, ml.name as levelName
FROM workspacequota wq
JOIN membershiplevel ml ON wq.membershipLevelId = ml.id
WHERE wq.workspaceId = 'your-workspace-id';
```

## 🎯 六、性能优化建议

### 1. 数据缓存

```typescript
// 在 API 路由中添加简单缓存
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}
```

### 2. 批量查询优化

```typescript
// 使用 Promise.all 并行查询
const [posts, permissions, members] = await Promise.all([
  prisma.workspacepost.findMany({ where: { workspaceId } }),
  prisma.componentpermission.findMany({ where: { postId: { in: postIds } } }),
  prisma.postmember.findMany({ where: { workspaceId } }),
]);
```

### 3. 前端防抖

```typescript
// 搜索输入添加防抖
const debouncedSearch = useMemo(
  () => debounce((term: string) => setSearchTerm(term), 300),
  []
);
```

## ✅ 七、验收标准

完成以下检查确认系统就绪：

- [ ] 数据库迁移成功，所有新表创建完成
- [ ] Prisma 客户端生成成功
- [ ] Workspace Hub 页面正常访问
- [ ] 4-Card 架构功能完整
- [ ] 升级决策三路径测试通过
- [ ] 权限矩阵页面功能正常
- [ ] 岗位创建和权限配置生效
- [ ] API 路由全部测试通过
- [ ] 权限控制逻辑验证通过
- [ ] 视觉规范符合设计要求
- [ ] 无控制台错误和警告

## 📞 八、技术支持

如遇到问题，请检查：

1. **日志文件**: 查看服务器控制台输出
2. **数据库状态**: 验证表结构和数据完整性
3. **网络请求**: 使用浏览器开发者工具
4. **文档**: 参考 `docs/RBAC-IMPLEMENTATION.md`

---

**祝部署顺利！** 🎉
