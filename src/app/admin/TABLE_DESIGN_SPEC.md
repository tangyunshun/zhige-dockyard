# 管理员后台数据列表设计规范

## 📋 全局表格设计规范

### 一、核心原则

1. **响应式自适应** - 所有表格必须根据浏览器分辨率自适应显示
2. **禁止换行** - 所有内容保持单行显示，使用 `whitespace-nowrap`
3. **防止溢出** - 使用 `overflow-x-auto` 允许水平滚动
4. **文本截断** - 长文本使用 `truncate` + `title` 属性
5. **图标防压缩** - 所有图标添加 `shrink-0`

### 二、表格结构规范

#### 2.1 表格容器
```tsx
<div className="overflow-x-auto">
  <table className="w-full table-auto">
```
- ✅ `overflow-x-auto` - 允许水平滚动
- ✅ `table-auto` - 根据内容自动调整列宽
- ❌ 不要使用 `table-fixed` - 固定列宽会导致内容截断

#### 2.2 表头 (th)
```tsx
<th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
  列名
</th>
```
- ✅ 必须添加 `whitespace-nowrap` 防止换行
- ✅ 统一样式：`px-6 py-4 text-xs font-bold uppercase tracking-wider`

#### 2.3 表格单元格 (td)

**通用列**
```tsx
<td className="px-6 py-4 whitespace-nowrap">
  内容
</td>
```
- ✅ 所有列添加 `whitespace-nowrap` 防止换行

**文本内容列**
```tsx
<td className="px-6 py-4 whitespace-nowrap" title={内容}>
  {内容}
</td>
```
- ✅ 添加 `title` 属性用于 Hover 显示全称

**复合内容列（如用户信息）**
```tsx
<td className="px-6 py-4">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center">
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div className="min-w-0">
      <div className="text-sm font-bold text-slate-800 truncate" title={名称}>
        {名称}
      </div>
      <div className="text-xs text-slate-500 truncate" title={描述}>
        {描述}
      </div>
    </div>
  </div>
</td>
```
- ✅ 图标容器 `shrink-0` 防止压缩
- ✅ 内容容器 `min-w-0` 允许内容截断
- ✅ 文本使用 `truncate` + `title` 截断并提示

**图标列**
```tsx
<td className="px-6 py-4 whitespace-nowrap">
  <div className="flex items-center gap-2">
    <Icon className="w-4 h-4 shrink-0" />
    <span>内容</span>
  </div>
</td>
```
- ✅ 图标添加 `shrink-0` 防止压缩

**操作列**
```tsx
<td className="px-6 py-4 text-right whitespace-nowrap">
  <div className="flex items-center justify-end gap-2">
    <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center justify-center">
      <Icon className="w-5 h-5 shrink-0" />
    </button>
  </div>
</td>
```
- ✅ 添加 `whitespace-nowrap` 防止换行
- ✅ 按钮使用 `inline-flex` 确保对齐
- ✅ 图标添加 `shrink-0` 防止压缩

### 三、Badge 样式规范

#### 3.1 状态 Badge
```tsx
<span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full whitespace-nowrap">
  状态文本
</span>
```

#### 3.2 类型 Badge
```tsx
<span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full whitespace-nowrap">
  类型文本
</span>
```

### 四、时间格式化规范

```tsx
const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
};
```

使用：
```tsx
<td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap" title={formatTimeAgo(date)}>
  {formatTimeAgo(date)}
</td>
```

### 五、分页样式规范

```tsx
{pagination.totalPages > 1 && (
  <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
    <div className="text-sm text-slate-600 font-medium">
      共 <span className="font-bold text-[#3182ce]">{pagination.total}</span> 条记录
    </div>
    <div className="flex gap-2">
      <button className="px-4 h-10 text-sm font-bold border border-slate-200 rounded-xl">
        上一页
      </button>
      <button className="px-4 h-10 text-sm font-bold border border-slate-200 rounded-xl">
        下一页
      </button>
    </div>
  </div>
)}
```

### 六、检查清单

在提交任何包含数据列表的页面之前，请检查：

- [ ] 表格容器使用 `overflow-x-auto`
- [ ] 表格使用 `table-auto`
- [ ] 所有 `th` 添加 `whitespace-nowrap`
- [ ] 所有 `td` 添加 `whitespace-nowrap`
- [ ] 图标添加 `shrink-0`
- [ ] 长文本使用 `truncate` + `title`
- [ ] 复合内容使用 `min-w-0` 容器
- [ ] 操作列按钮使用 `inline-flex`
- [ ] 所有内容单行显示，不换行
- [ ] 测试不同分辨率下的显示效果

### 七、适用页面

此规范适用于所有管理员后台页面：

- ✅ `/admin/users` - 用户管理
- ✅ `/admin/workspaces` - 工作空间管理
- ✅ `/admin/components` - 组件管理
- ✅ `/admin/tenants` - 租户管理
- ✅ `/admin/api-keys` - API 密钥管理
- ✅ `/admin/membership/users` - 会员用户管理
- ✅ `/admin/membership/orders` - 会员订单管理
- ✅ `/admin/membership/levels` - 会员等级管理
- ✅ `/admin/content` - 内容管理
- ✅ `/admin/analytics` - 分析管理
- ✅ `/admin/notifications` - 通知管理
- ✅ `/admin/preferences` - 偏好设置
- ✅ `/admin/settings` - 系统设置
- ✅ `/admin/upgrade-applications` - 升级申请管理

### 八、响应式断点

- **< 1024px (lg)** - 隐藏侧边栏，显示汉堡菜单
- **≥ 1024px (lg)** - 显示侧边栏，主内容区自动填充
- **所有表格** - 允许水平滚动，不强制适应

### 九、禁止事项

❌ 禁止使用固定宽度（如 `w-[1200px]`）
❌ 禁止使用 `table-fixed`（除非特殊需求）
❌ 禁止移除 `whitespace-nowrap`
❌ 禁止移除 `shrink-0`（图标上）
❌ 禁止移除 `truncate`（长文本上）
❌ 禁止移除 `title` 属性（截断文本上）
❌ 禁止内容换行显示

### 十、更新日志

- **2026-05-03** - 初始版本，基于用户管理页面设计规范
