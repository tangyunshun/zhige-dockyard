# Toast 提示时间规范

**制定时间**: 2026-05-05  
**适用范围**: 全系统所有 Toast 提示

---

## 📋 规范原则

1. **提示时间根据功能情况设计**
   - 成功提示后需要跳转：800ms（快速反馈）
   - 纯提示不跳转：2000-3000ms（让用户看清）
   - 加载提示：1000ms（过渡动画）
   - 错误提示：3000ms（让用户思考）

2. **提示显示完后立即执行下一步**
   - 提示时间 = 跳转延迟时间
   - 不要在跳转后的页面重复显示提示
   - 使用 sessionStorage 防止重复显示

3. **提示语简洁明了**
   - 成功提示：简短正面（如"注册成功"）
   - 错误提示：说明问题 + 解决方案（如"密码错误，剩余 2 次机会"）
   - 加载提示：说明正在进行的操作（如"正在退出登录..."）

---

## ⏱️ 显示时间标准

### 1. 成功提示（toast.success）

| 场景 | 显示时间 | 是否跳转 | 示例 |
|------|---------|---------|------|
| 注册成功 | 800ms | ✅ 立即跳转到登录页 | "注册成功" |
| 保存成功 | 2000ms | ❌ 不跳转 | "设置已保存" |
| 删除成功 | 2000ms | ❌ 不跳转 | "API 密钥已删除" |
| 退出登录成功 | 2000ms | ✅ 跳转到首页 | "已退出登录" |
| 创建成功 | 2000ms | ❌ 不跳转 | "岗位创建成功" |
| 复制成功 | 2000ms | ❌ 不跳转 | "权限配置已复制到剪贴板" |

### 2. 错误提示（toast.error）

| 场景 | 显示时间 | 是否跳转 | 示例 |
|------|---------|---------|------|
| 验证失败 | 3000ms | ❌ 不跳转 | "验证码错误" |
| 操作失败 | 3000ms | ❌ 不跳转 | "保存失败，请重试" |
| 网络错误 | 3000ms | ❌ 不跳转 | "网络错误，请稍后重试" |
| 权限不足 | 3000ms | ❌ 不跳转 | "权限不足，无法访问" |
| 账号锁定 | 3000ms | ❌ 不跳转 | "账号已锁定，请 5 分钟后再试" |

### 3. 加载提示（toast.info）

| 场景 | 显示时间 | 是否跳转 | 示例 |
|------|---------|---------|------|
| 退出登录中 | 1000ms | ✅ 完成后跳转 | "正在退出登录..." |
| 加载数据中 | 1000ms | ❌ 不跳转 | "正在加载空间信息..." |
| 处理中 | 1000ms | ❌ 不跳转 | "正在处理，请稍候..." |

### 4. 警告提示（toast.warning）

| 场景 | 显示时间 | 是否跳转 | 示例 |
|------|---------|---------|------|
| 表单验证警告 | 3000ms | ❌ 不跳转 | "请输入正确的手机号格式" |
| 操作确认警告 | 3000ms | ❌ 不跳转 | "此操作不可逆，请谨慎操作" |

---

## 🔄 跳转逻辑规范

### 场景 1: 注册成功 → 登录页

```typescript
// 注册页面
if (res.ok) {
  // 显示成功提示（短暂显示 800ms 后立即跳转）
  toast.success(data.message || "注册成功", 800);
  // 提示显示完后立即跳转到登录页面
  setTimeout(() => {
    router.push(data.redirectUrl || "/auth/login");
  }, 800);
}

// 登录页面：不显示任何来自注册的提示
// （因为注册页面的提示已经显示过了）
```

**要点**:
- ✅ 注册页面显示"注册成功"800ms
- ✅ 立即跳转到登录页
- ✅ 登录页不显示重复提示

### 场景 2: 退出登录 → 首页

```typescript
// useLogout Hook
toast.info("正在退出登录...", 1000);
await new Promise(resolve => setTimeout(resolve, 1000));
// 执行退出登录 API
// ...
window.location.href = "/";

// 首页
useEffect(() => {
  const justLoggedOut = localStorage.getItem("just_logged_out");
  if (justLoggedOut === "true") {
    localStorage.removeItem("just_logged_out");
    toast.success("已退出登录", 2000);
  }
}, [toast]);
```

**要点**:
- ✅ 退出时显示"正在退出登录..."1000ms
- ✅ 执行退出操作
- ✅ 跳转到首页后显示"已退出登录"2000ms
- ✅ 使用 localStorage 传递状态，避免 URL 参数

### 场景 3: 操作成功 → 刷新列表

```typescript
// 保存设置
if (res.ok) {
  toast.success("设置已保存", 2000);
  // 不跳转，刷新当前页面数据
  await loadData();
}
```

**要点**:
- ✅ 显示成功提示 2000ms
- ✅ 不跳转，在当前页刷新数据
- ✅ 用户可以看到操作结果

---

## 🚫 防止重复显示

### 方法 1: sessionStorage 标志

```typescript
// 登录页面
const [hasShownError, setHasShownError] = useState(false);

useEffect(() => {
  if (errorMessage && !hasShownError) {
    const sessionKey = `error_shown_${errorMessage}`;
    const alreadyShown = sessionStorage.getItem(sessionKey);
    
    if (!alreadyShown) {
      sessionStorage.setItem(sessionKey, "true");
      setHasShownError(true);
      toast.error(errorMessage);
    }
  }
}, [errorMessage]);
```

### 方法 2: localStorage 传递状态

```typescript
// 退出登录 Hook
localStorage.setItem("just_logged_out", "true");
window.location.href = "/";

// 首页
const justLoggedOut = localStorage.getItem("just_logged_out");
if (justLoggedOut === "true") {
  localStorage.removeItem("just_logged_out");
  toast.success("已退出登录", 2000);
}
```

---

## 📊 已修复的页面清单

### ✅ 已修复（2026-05-05）

1. **注册页面** (`src/app/auth/register/page.tsx`)
   - 修复前：提示"注册成功，请登录"3000ms，延迟 1000ms 跳转
   - 修复后：提示"注册成功"800ms，立即跳转
   - 提示语更简洁，跳转更迅速

2. **登录页面** (`src/app/auth/login/page.tsx`)
   - 已有防止重复显示提示的逻辑
   - 状态：✅ 良好

3. **退出登录** (`src/hooks/useLogout.ts`)
   - 显示"正在退出登录..."1000ms
   - 执行退出后跳转到首页
   - 状态：✅ 良好

4. **首页** (`src/app/page.tsx`)
   - 接收退出登录状态，显示"已退出登录"2000ms
   - 状态：✅ 良好

5. **用户设置页** (`src/app/user/settings/page.tsx`)
   - 保存成功显示 2000ms
   - 状态：✅ 良好

6. **API 密钥管理页** (`src/app/admin/api-keys/page.tsx`)
   - 删除成功显示 2000ms
   - 状态：✅ 良好

7. **角色权限矩阵页** (`src/app/user/workspace-hub/role-matrix/page.tsx`)
   - 保存/创建成功显示 2000ms
   - 状态：✅ 良好

---

## 🎯 最佳实践

### 1. 提示语设计

✅ **好的提示语**:
- "注册成功"（简洁）
- "设置已保存"（明确）
- "正在退出登录..."（说明进行中）
- "密码错误，剩余 2 次机会"（说明问题 + 解决方案）

❌ **不好的提示语**:
- "注册成功，请登录"（冗余，跳转后自然看到登录页）
- "操作成功完成，系统将在 3 秒后为您跳转到相应页面"（太长）

### 2. 时间控制

✅ **好的时间控制**:
- 需要跳转：800ms（快速反馈）
- 纯提示：2000-3000ms（让用户看清）
- 加载提示：1000ms（过渡自然）

❌ **不好的时间控制**:
- 提示时间过长（>5000ms）：用户等待焦虑
- 提示时间过短（<500ms）：用户没看清就消失
- 提示时间和跳转时间不一致：提示没显示完就跳转

### 3. 跳转逻辑

✅ **好的跳转逻辑**:
```typescript
toast.success("操作成功", 800);
setTimeout(() => {
  router.push("/target");
}, 800);
```

❌ **不好的跳转逻辑**:
```typescript
// 错误 1: 提示时间和跳转时间不一致
toast.success("操作成功", 3000);
setTimeout(() => {
  router.push("/target");
}, 1000); // 提示还在显示就跳转了

// 错误 2: 跳转后还显示提示
router.push("/target");
toast.success("操作成功"); // 跳转后才显示，用户很困惑
```

---

## 📝 总结

### 核心原则
1. **提示时间 = 跳转延迟时间**
2. **跳转后的页面不重复显示提示**
3. **提示语简洁明了，不要冗余**
4. **使用 sessionStorage/localStorage 防止重复显示**

### 时间标准
- 跳转场景：800ms
- 纯提示：2000-3000ms
- 加载提示：1000ms
- 错误提示：3000ms

### 验证方法
1. 手动测试每个操作流程
2. 检查提示显示时间是否合理
3. 检查跳转后是否重复显示提示
4. 检查防止重复显示的逻辑是否生效

---

**制定人员**: AI Assistant  
**制定时间**: 2026-05-05  
**下次审查**: 2026-05-12
