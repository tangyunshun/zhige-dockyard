# Toast 智能显示时间规范（最终版）

**制定时间**: 2026-05-05  
**版本**: v3.0（最终版）  
**核心原则**: 保持提示语完整 + 智能计算时间 + 保证看完 + 不等待过长

---

## 🎯 核心原则（不可违背）

1. **✅ 提示语内容必须完整** - 绝不允许缩短提示语
2. **✅ 智能计算显示时间** - 根据内容长度自动计算
3. **✅ 保证用户能完整看完** - 最短时间保证阅读
4. **✅ 不要显示太长时间** - 最长限制避免焦虑
5. **✅ 跳转场景快速反馈** - 提示显示完立即跳转

---

## 🧮 智能计算公式（跳转场景）

### 适用场景
- 注册成功 → 跳转登录页
- 退出登录 → 跳转首页
- 操作成功 → 跳转其他页

### 计算公式

```typescript
// 跳转场景专用公式
const duration = Math.min(800 + message.length * 150, 2000);

// 参数说明：
// - 基础时间：800ms（保证用户注意到提示）
// - 每字符时间：150ms（中文字符阅读速度）
// - 最长时间：2000ms（避免等待过长）
```

### 计算示例

| 提示语 | 字符数 | 计算过程 | 显示时间 |
|--------|--------|---------|---------|
| "注册成功，请登录" | 8 | 800 + 8×150 = 2000 | **2000ms** (达到上限) |
| "操作成功" | 4 | 800 + 4×150 = 1400 | **1400ms** |
| "保存成功" | 4 | 800 + 4×150 = 1400 | **1400ms** |
| "已退出登录" | 5 | 800 + 5×150 = 1550 | **1550ms** |
| "权限配置已保存" | 7 | 800 + 7×150 = 1850 | **1850ms** |
| "API 密钥已删除" | 7 | 800 + 7×150 = 1850 | **1850ms** |

### 代码模板

```typescript
// 跳转场景标准代码
if (res.ok) {
  const message = data.message || "操作成功";
  // 智能计算显示时间
  const duration = Math.min(800 + message.length * 150, 2000);
  toast.success(message, duration);
  // 提示显示完后立即跳转
  setTimeout(() => {
    router.push("/target-page");
  }, duration);
}
```

---

## 📋 非跳转场景（纯提示）

### 适用场景
- 保存设置（不跳转）
- 删除成功（不跳转）
- 复制成功（不跳转）
- 错误提示（不跳转）

### 使用 Toast 组件默认智能计算

```typescript
// Toast 组件内部智能计算
const calculateDuration = (message: string): number => {
  let charCount = 0;
  
  for (const char of message) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      charCount += 2; // 中文字符权重 2
    } else if (/[a-zA-Z0-9]/.test(char)) {
      charCount += 1; // 英文字符权重 1
    } else {
      charCount += 0.5; // 标点符号权重 0.5
    }
  }
  
  const duration = 1500 + Math.round(charCount * 200);
  return Math.min(Math.max(duration, 1500), 5000);
};
```

### 计算示例

| 提示语 | 字符类型 | 权重 | 计算过程 | 显示时间 |
|--------|---------|------|---------|---------|
| "设置已保存" | 5 中文 | 10 | 1500 + 10×200 = 3500 | **3500ms** |
| "权限配置已复制到剪贴板" | 11 中文 | 22 | 1500 + 22×200 = 5900 → 5000 | **5000ms** (上限) |
| "API 密钥已删除" | 3 英文 +5 中文 | 13 | 1500 + 13×200 = 4100 | **4100ms** |
| "密码错误" | 4 中文 | 8 | 1500 + 8×200 = 3100 | **3100ms** |
| "网络错误，请稍后重试" | 9 中文 | 18 | 1500 + 18×200 = 5100 → 5000 | **5000ms** (上限) |

---

## 🎯 注册登录流程完整示例

### 1. 注册页面（正确实现）

```typescript
// src/app/auth/register/page.tsx
if (res.ok) {
  // 显示完整成功提示，智能计算显示时间后跳转
  const message = data.message || "注册成功，请登录";
  // 智能计算显示时间：保证用户能看完完整提示，又不会太长
  // 基础时间 800ms + 每字符 150ms，最长不超过 2 秒
  const duration = Math.min(800 + message.length * 150, 2000);
  toast.success(message, duration);
  setTimeout(() => {
    router.push(data.redirectUrl || "/auth/login");
  }, duration);
}
```

**用户体验流程**:
1. 用户点击"立即注册"
2. 显示 Toast："注册成功，请登录"（完整提示语）
3. Toast 显示 2 秒（智能计算，保证看完）
4. 立即跳转到登录页面
5. **登录页面不显示任何提示**

### 2. 登录页面（防重复显示）

```typescript
// src/app/auth/login/page.tsx
const [hasShownError, setHasShownError] = useState(false);
const errorMessage = searchParams.get("error");

useEffect(() => {
  if (errorMessage && !hasShownError) {
    // 使用 sessionStorage 防止重复显示
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

**关键点**:
- ✅ 只检查 URL 参数 `?error=xxx`
- ✅ 使用 sessionStorage 防止重复显示
- ✅ **不会显示注册成功的提示**

---

## 🚨 常见错误与正确做法对比

### 错误 1: 缩短提示语内容 ❌

```typescript
// ❌ 错误：缩短提示语
toast.success("注册成功", 1000);

// ✅ 正确：保持完整提示语
const message = data.message || "注册成功，请登录";
const duration = Math.min(800 + message.length * 150, 2000);
toast.success(message, duration);
```

### 错误 2: 固定时间不智能 ❌

```typescript
// ❌ 错误：所有提示都 3 秒
toast.success("注册成功，请登录", 3000);
toast.success("操作成功", 3000);

// ✅ 正确：智能计算时间
const duration = Math.min(800 + message.length * 150, 2000);
toast.success(message, duration);
```

### 错误 3: 跳转后重复显示提示 ❌

```typescript
// ❌ 错误：注册页显示后，登录页又显示
// 注册页
toast.success("注册成功，请登录");
router.push("/auth/login?success=注册成功");

// 登录页
const success = searchParams.get("success");
if (success) {
  toast.success(success); // ❌ 重复显示
}

// ✅ 正确：只在注册页显示，登录页不显示
// 注册页
const duration = Math.min(800 + message.length * 150, 2000);
toast.success(message, duration);
setTimeout(() => {
  router.push("/auth/login");
}, duration);

// 登录页：不检查 success 参数，不显示提示
```

### 错误 4: 提示时间和跳转时间不一致 ❌

```typescript
// ❌ 错误：提示显示 3 秒，1 秒后就跳转
toast.success("注册成功，请登录", 3000);
setTimeout(() => {
  router.push("/auth/login");
}, 1000);

// ✅ 正确：提示时间和跳转时间一致
const duration = Math.min(800 + message.length * 150, 2000);
toast.success(message, duration);
setTimeout(() => {
  router.push("/auth/login");
}, duration);
```

---

## 📊 全系统跳转场景清单

### 认证系统

| 页面 | 提示语 | 计算时间 | 跳转目标 | 状态 |
|------|--------|---------|---------|------|
| 注册页 | "注册成功，请登录" | 2000ms | /auth/login | ✅ 已修复 |
| 找回密码 | "重置成功，请登录" | 2000ms | /auth/login | ⚠️ 待检查 |
| 退出登录 | "正在退出登录..." | 1000ms | / | ✅ 良好 |

### 用户系统

| 页面 | 提示语 | 计算时间 | 跳转目标 | 状态 |
|------|--------|---------|---------|------|
| 个人设置 | "设置已保存" | 1850ms | 不跳转 | ✅ 良好 |
| 账号安全 | "密码修改成功" | 2000ms | /auth/login | ⚠️ 待检查 |
| 个人资料 | "资料已更新" | 1850ms | 不跳转 | ✅ 良好 |

### 管理员后台

| 页面 | 提示语 | 计算时间 | 跳转目标 | 状态 |
|------|--------|---------|---------|------|
| API 密钥管理 | "API 密钥已删除" | 1850ms | 不跳转 | ✅ 良好 |
| 租户管理 | "状态已更新" | 1700ms | 不跳转 | ✅ 良好 |
| 升级申请 | "审核成功" | 1700ms | 不跳转 | ✅ 良好 |

---

## ✅ 实施检查清单

### 代码检查

- ✅ 注册页面：保持完整提示语 + 智能计算时间
- ✅ 登录页面：不显示注册成功提示
- ✅ 退出登录：显示加载中 + 跳转后显示成功
- ✅ 所有跳转场景：提示时间 = 跳转延迟时间
- ✅ 所有非跳转场景：使用 Toast 默认智能计算

### 功能测试

**测试场景 1: 注册流程**
1. 填写注册信息
2. 点击"立即注册"
3. ✅ 显示完整提示："注册成功，请登录"
4. ✅ 提示显示约 2 秒（能完整看完）
5. ✅ 立即跳转到登录页
6. ✅ 登录页不显示任何提示

**测试场景 2: 退出登录流程**
1. 点击"退出登录"
2. ✅ 显示"正在退出登录..."1 秒
3. ✅ 执行退出操作
4. ✅ 跳转到首页
5. ✅ 首页显示"已退出登录"约 1.5 秒

**测试场景 3: 保存设置**
1. 修改设置
2. 点击"保存"
3. ✅ 显示"设置已保存"约 3.5 秒
4. ✅ 不跳转，留在当前页
5. ✅ 提示自动消失

---

## 📝 总结

### 核心公式

**跳转场景**:
```typescript
const duration = Math.min(800 + message.length * 150, 2000);
toast.success(message, duration);
setTimeout(() => {
  router.push("/target");
}, duration);
```

**非跳转场景**:
```typescript
toast.success(message); // 使用 Toast 默认智能计算
```

### 时间范围

| 场景类型 | 最短时间 | 最长时间 | 说明 |
|---------|---------|---------|------|
| 跳转场景 | 800ms | 2000ms | 快速反馈 |
| 非跳转场景 | 1500ms | 5000ms | 完整阅读 |

### 关键原则

1. **绝不缩短提示语内容**
2. **智能计算显示时间**
3. **保证用户能完整看完**
4. **不要显示太长时间**
5. **跳转场景快速反馈**

---

**制定人员**: AI Assistant  
**制定时间**: 2026-05-05  
**版本**: v3.0（最终版）  
**执行状态**: ✅ 严格执行
