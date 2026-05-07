# 提示语位置规范文档

**制定时间**: 2026-05-05  
**版本**: v1.0

---

##  核心规则

### 第一条：字段验证错误

**规则**: 所有字段格式验证错误都显示在**对应输入框正下方**

**示例**:
- 账号长度不足 → 账号输入框下方
- 手机号格式错误 → 手机号输入框下方
- 密码强度不够 → 密码输入框下方
- 验证码错误 → 验证码输入框下方
- 两次密码不一致 → 确认密码输入框下方

**样式**:
```tsx
{errors.field && (
  <p className="mt-1 text-xs text-red-500">
    {errors.field}
  </p>
)}
```

**特点**:
- ✅ 红色文字（`text-red-500`）
- ✅ 小字号（`text-xs`）
- ✅ 上边距（`mt-1`）
- ✅ 无背景色
- ✅ 输入框红框标识（`border-red-500`）

---

### 第二条：账号状态错误

**规则**: 账号状态相关的错误也显示在**账号输入框正下方**（使用相同样式）

**触发场景**:
- 实时检测：用户输入账号后失去焦点时自动检测
- 点击登录：用户点击登录按钮后检测

**错误类型**:
1. **账号已被禁用** → 账号输入框下方
   - 显示："账号已被禁用，请联系管理员"
   
2. **账号已被锁定** → 账号输入框下方
   - 显示："账号已锁定，请 X 分钟后再试"
   
3. **账号已被注销** → 账号输入框下方
   - 显示："账号已被注销"
   
4. **账号不存在** → 账号输入框下方
   - 显示："该账号不存在"

**样式**（与字段验证完全一致）:
```tsx
{errors.account && (
  <p className="mt-1 text-xs text-red-500">
    {errors.account}
  </p>
)}
```

**特点**:
- ✅ 与字段验证错误样式**完全一致**
- ✅ 不要独立的红色背景框
- ✅ 不要显示在登录按钮上方
- ✅ 输入框红框标识（`border-red-500`）

---

### 第三条：Toast 提示

**规则**: Toast 提示用于全局性、成功类的提示

**使用场景**:
- ✅ 注册成功 → Toast 成功提示 + 跳转
- ✅ 密码重置成功 → Toast 成功提示 + 跳转
- ✅ 退出登录成功 → Toast 成功提示
- ✅ 验证码发送成功 → Toast 成功提示

**显示时间**:
- 成功提示：600ms + 每字符 100ms，最长 1500ms
- 错误提示：3000ms（让用户思考）
- 加载提示：1000ms（过渡）

**位置**: 页面中间顶部

---

## 🎯 实时检测规则

### 需要实时检测的场景

**账号状态检测**（登录页面）:
```typescript
// 用户输入账号后失去焦点时触发
const handleAccountBlur = async () => {
  const res = await fetch("/api/auth/check-account", {
    method: "POST",
    body: JSON.stringify({ account: formData.account }),
  });
  
  const data = await res.json();
  
  // 检测到账号被禁用/锁定，立即显示错误在输入框下方
  if (data.status === "disabled") {
    setErrors({ 
      account: "账号已被禁用，请联系管理员" 
    });
  } else if (data.status === "locked") {
    setErrors({ 
      account: `账号已锁定，请${data.minutesRemaining}分钟后再试` 
    });
  }
};
```

**手机号是否已注册检测**（注册页面）:
```typescript
// 用户输入手机号后失去焦点时触发
const handlePhoneBlur = async () => {
  const res = await fetch("/api/auth/check-phone", {
    method: "POST",
    body: JSON.stringify({ phone: formData.phone }),
  });
  
  const data = await res.json();
  
  // 检测到手机号已注册，立即显示错误在输入框下方
  if (data.registered) {
    setErrors({ 
      phone: "该手机号已注册" 
    });
  }
};
```

### 实时检测的优势

1. **即时反馈**: 用户输入完立即知道问题
2. **避免等待**: 不需要点击登录才知道错误
3. **位置准确**: 错误显示在对应输入框下方
4. **样式统一**: 所有错误提示样式一致

---

## 📊 错误分类对照表

### 登录页面

| 错误类型 | 错误文案 | 显示位置 | 触发时机 |
|---------|---------|---------|---------|
| 账号长度不足 | "账号长度不能小于 3 位" | 账号输入框下方 | 实时验证 |
| 手机号格式错误 | "请输入正确的手机号" | 手机号输入框下方 | 实时验证 |
| 账号不存在 | "该账号不存在" | 账号输入框下方 | 实时检测 |
| 账号被禁用 | "账号已被禁用，请联系管理员" | 账号输入框下方 | 实时检测 + 登录 |
| 账号被锁定 | "账号已锁定，请 X 分钟后再试" | 账号输入框下方 | 实时检测 + 登录 |
| 密码错误 | "账号或密码错误（剩余 X 次）" | 密码输入框下方 | 登录验证 |
| 网络错误 | "网络错误，请稍后重试" | 账号输入框下方 | 登录失败 |

### 注册页面

| 错误类型 | 错误文案 | 显示位置 | 触发时机 |
|---------|---------|---------|---------|
| 手机号格式错误 | "请输入正确的手机号" | 手机号输入框下方 | 实时验证 |
| 手机号已注册 | "该手机号已注册" | 手机号输入框下方 | 实时检测 |
| 验证码错误 | "验证码错误" | 验证码输入框下方 | 提交验证 |
| 密码强度不够 | "密码至少 6 位" | 密码输入框下方 | 实时验证 |
| 两次密码不一致 | "两次输入的密码不一致" | 确认密码输入框下方 | 实时验证 |

### 找回密码页面

| 错误类型 | 错误文案 | 显示位置 | 触发时机 |
|---------|---------|---------|---------|
| 账号不存在 | "该账号不存在" | 账号输入框下方 | 实时检测 |
| 验证码错误 | "验证码错误" | 验证码输入框下方 | 提交验证 |
| 密码强度不够 | "密码至少 6 位" | 密码输入框下方 | 实时验证 |

---

## ✅ 正确示例

### 登录页面错误处理

```typescript
// ✅ 正确：实时检测账号状态
const handleAccountBlur = async () => {
  const res = await fetch("/api/auth/check-account", {
    method: "POST",
    body: JSON.stringify({ account: formData.account }),
  });
  
  const data = await res.json();
  
  // 检测到账号被禁用，立即显示错误在输入框下方
  if (data.status === "disabled") {
    setErrors({ 
      account: "账号已被禁用，请联系管理员" 
    });
  }
};

// ✅ 正确：登录时的错误处理
const handleLogin = async () => {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(formData),
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    // 所有错误都显示在输入框下方
    if (data.field === "password") {
      setErrors({ password: data.message });
    } else {
      setErrors({ account: data.message });
    }
  } else {
    // 成功时显示 Toast
    toast.success("登录成功");
    window.location.href = "/dashboard";
  }
};
```

### 注册页面错误处理

```typescript
// ✅ 正确：实时检测手机号是否已注册
const handlePhoneBlur = async () => {
  const res = await fetch("/api/auth/check-phone", {
    method: "POST",
    body: JSON.stringify({ phone: formData.phone }),
  });
  
  const data = await res.json();
  
  if (data.registered) {
    setErrors({ 
      phone: "该手机号已注册" 
    });
  }
};

// ✅ 正确：注册成功显示 Toast
if (res.ok) {
  const message = data.message || "注册成功，请登录";
  const duration = Math.min(600 + message.length * 100, 1500);
  toast.success(message, duration);
  setTimeout(() => {
    router.push("/auth/login");
  }, duration);
}
```

---

## ❌ 错误示例

### 错误 1: 使用独立红色背景框

```tsx
// ❌ 错误：独立的红色背景框，样式不统一
{errors.account && (
  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-sm text-red-700 flex items-center gap-2">
      <AlertCircle className="w-4 h-4" />
      {errors.account}
    </p>
  </div>
)}

// ✅ 正确：统一的错误样式
{errors.account && (
  <p className="mt-1 text-xs text-red-500">
    {errors.account}
  </p>
)}
```

### 错误 2: 错误显示在登录按钮上方

```tsx
// ❌ 错误：错误显示在登录按钮上方
<div className="mb-4 p-3 bg-red-50">
  {errors.account}
</div>
<button>登录</button>

// ✅ 正确：错误显示在输入框下方
<input className={errors.account ? "border-red-500" : ""} />
{errors.account && (
  <p className="mt-1 text-xs text-red-500">{errors.account}</p>
)}
<button>登录</button>
```

### 错误 3: 账号状态错误不显示

```typescript
// ❌ 错误：检测到账号被禁用但不显示错误
if (data.status === "disabled") {
  setAccountCheckStatus({ disabled: true });
  // 没有调用 setErrors，用户看不到错误提示
}

// ✅ 正确：检测到账号被禁用，立即显示错误
if (data.status === "disabled") {
  setAccountCheckStatus({ disabled: true });
  setErrors({ 
    account: "账号已被禁用，请联系管理员" 
  });
}
```

---

## 📝 总结

### 核心原则

1. **字段验证错误** → 对应输入框下方
2. **账号状态错误** → 账号输入框下方（相同样式）
3. **成功提示** → Toast（页面顶部）
4. **实时检测** → 发现错误立即显示在输入框下方

### 样式统一

所有输入框下方的错误提示样式必须**完全一致**：
- 红色文字（`text-red-500`）
- 小字号（`text-xs`）
- 上边距（`mt-1`）
- 无背景色
- 输入框红框标识

### 禁止的行为

- ❌ 使用独立的红色背景框
- ❌ 错误显示在登录按钮上方
- ❌ 账号状态错误不显示
- ❌ 样式不统一

---

**制定人员**: AI Assistant  
**制定时间**: 2026-05-05  
**执行状态**: ✅ 严格执行
