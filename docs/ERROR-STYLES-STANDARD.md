# 错误提示样式统一规范

**修复时间**: 2026-05-05  
**版本**: v2.0

---

## 📋 核心规则

### 第一条：字段级错误

**定义**: 与特定输入字段直接相关的验证错误

**显示位置**: **对应输入框正下方**（左对齐）

**示例**:
- 账号格式错误 → 账号输入框下方
- 密码错误 → 密码输入框下方
- 验证码错误 → 验证码输入框下方
- 账号被禁用（实时检测）→ 账号输入框下方
- 账号被锁定（实时检测）→ 账号输入框下方

**样式**:
```tsx
{errors.field && (
  <p className="mt-1 text-xs text-red-500">
    {errors.field}
  </p>
)}
```

**特点**:
- ✅ 上边距 `mt-1`（紧凑）
- ✅ 左对齐（默认）
- ✅ 红色文字 `text-red-500`
- ✅ 小字号 `text-xs`
- ✅ 输入框红框 `border-red-500`

---

### 第二条：全局错误

**定义**: 与特定字段无关的系统级错误

**显示位置**: **登录按钮上方**（左对齐，与按钮左侧对齐）

**示例**:
- 服务器错误 → 登录按钮上方
- 网络错误 → 登录按钮上方
- 登录失败（系统错误）→ 登录按钮上方
- API 请求失败 → 登录按钮上方

**样式**:
```tsx
{globalError && (
  <p className="mt-3 text-xs text-red-500">
    {globalError}
  </p>
)}
```

**特点**:
- ✅ 上边距 `mt-3`（与按钮保持距离）
- ✅ 左对齐（默认，与按钮对齐）
- ✅ 红色文字 `text-red-500`
- ✅ 小字号 `text-xs`
- ✅ **不要居中**
- ✅ **不要背景框**

---

## 🔄 错误分类判断

### 判断标准

**字段级错误**（显示在输入框下方）:
1. ❌ 用户输入内容有误
2. ❌ 字段格式验证失败
3. ❌ 字段业务规则验证失败
4. ✅ 可以通过修改输入内容解决

**全局错误**（显示在登录按钮上方）:
1. ❌ 服务器端问题
2. ❌ 网络问题
3. ❌ 系统异常
4. ❌ 用户无法通过修改输入解决

### 判断流程

```
用户点击登录
  ↓
验证输入内容
  ├─ 格式错误？ → 字段级错误（输入框下方）
  ├─ 账号被禁用？ → 字段级错误（账号输入框下方）
  ├─ 密码错误？ → 字段级错误（密码输入框下方）
  ↓
调用 API
  ├─ 服务器错误？ → 全局错误（登录按钮上方）
  ├─ 网络错误？ → 全局错误（登录按钮上方）
  ├─ 登录失败（系统原因）？ → 全局错误（登录按钮上方）
```

---

## 📊 错误分类对照表

### 登录页面

| 错误文案 | 错误类型 | 显示位置 | 样式 |
|---------|---------|---------|------|
| "账号长度不能小于 3 位" | 字段级 | 账号输入框下方 | `mt-1` |
| "请输入正确的手机号" | 字段级 | 手机号输入框下方 | `mt-1` |
| "账号已被禁用，请联系管理员" | 字段级 | 账号输入框下方 | `mt-1` |
| "账号已锁定，请 X 分钟后再试" | 字段级 | 账号输入框下方 | `mt-1` |
| "账号或密码错误（剩余 X 次）" | 字段级 | 密码输入框下方 | `mt-1` |
| "服务器错误" | 全局错误 | 登录按钮上方 | `mt-3` |
| "网络错误，请稍后重试" | 全局错误 | 登录按钮上方 | `mt-3` |

### 注册页面

| 错误文案 | 错误类型 | 显示位置 | 样式 |
|---------|---------|---------|------|
| "请输入正确的手机号" | 字段级 | 手机号输入框下方 | `mt-1` |
| "该手机号已注册" | 字段级 | 手机号输入框下方 | `mt-1` |
| "验证码错误" | 字段级 | 验证码输入框下方 | `mt-1` |
| "密码至少 6 位" | 字段级 | 密码输入框下方 | `mt-1` |
| "两次输入的密码不一致" | 字段级 | 确认密码输入框下方 | `mt-1` |

### 找回密码页面

| 错误文案 | 错误类型 | 显示位置 | 样式 |
|---------|---------|---------|------|
| "该账号不存在" | 字段级 | 账号输入框下方 | `mt-1` |
| "验证码错误" | 字段级 | 验证码输入框下方 | `mt-1` |
| "密码至少 6 位" | 字段级 | 密码输入框下方 | `mt-1` |

---

## ✅ 正确实现

### 登录页面错误处理

```typescript
// 状态定义
const [errors, setErrors] = useState<{
  account?: string;
  password?: string;
  phone?: string;
  smsCode?: string;
}>({});
const [globalError, setGlobalError] = useState<string | null>(null);

// 登录处理
const handleLogin = async () => {
  // 清除之前的错误
  setErrors({});
  setGlobalError(null);
  
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(formData),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      // 字段级错误
      if (data.field === "password") {
        setErrors({ password: data.message });
      } else if (data.field === "account") {
        setErrors({ account: data.message });
      } 
      // 全局错误
      else {
        setGlobalError(data.message || "登录失败");
      }
    }
  } catch (error) {
    // 网络错误 → 全局错误
    setGlobalError("网络错误，请稍后重试");
  }
};
```

### 字段级错误显示

```tsx
{/* 账号输入框 */}
<input
  className={errors.account ? "border-red-500" : "border-[#e2e8f0]"}
/>
{/* 错误显示在输入框下方 */}
{errors.account && (
  <p className="mt-1 text-xs text-red-500">
    {errors.account}
  </p>
)}
```

### 全局错误显示

```tsx
{/* 登录按钮 */}
<button>登录</button>

{/* 全局错误显示在登录按钮上方 */}
{globalError && (
  <p className="mt-3 text-xs text-red-500">
    {globalError}
  </p>
)}
```

---

## ❌ 错误示例

### 错误 1: 全局错误居中显示

```tsx
// ❌ 错误：居中显示
{globalError && (
  <div className="text-center">
    <p className="mt-3 text-xs text-red-500">
      {globalError}
    </p>
  </div>
)}

// ✅ 正确：左对齐（与按钮对齐）
{globalError && (
  <p className="mt-3 text-xs text-red-500">
    {globalError}
  </p>
)}
```

### 错误 2: 使用背景框

```tsx
// ❌ 错误：使用背景框
{globalError && (
  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-sm text-red-700">{globalError}</p>
  </div>
)}

// ✅ 正确：纯文字，无背景
{globalError && (
  <p className="mt-3 text-xs text-red-500">
    {globalError}
  </p>
)}
```

### 错误 3: 全局错误显示在输入框下方

```tsx
// ❌ 错误：服务器错误显示在账号输入框下方
<input />
{errors.account && <p>{errors.account}</p>} {/* 显示"服务器错误" */}

// ✅ 正确：服务器错误显示在登录按钮上方
<input />
{errors.account && <p>{errors.account}</p>} {/* 显示"账号被禁用" */}
<button>登录</button>
{globalError && <p>{globalError}</p>} {/* 显示"服务器错误" */}
```

---

## 🎯 视觉层次

### 登录页面布局

```
账号输入框（错误时红框）
└─ 错误提示（mt-1，左对齐）
   例："账号已被禁用，请联系管理员"

密码输入框（错误时红框）
└─ 错误提示（mt-1，左对齐）
   例："密码错误，剩余 2 次机会"

记住我 | 忘记密码？

错误提示（mt-3，左对齐，登录按钮上方）
└─ 全局错误
   例："服务器错误" 或 "网络错误"

登录按钮
```

### 间距规范

| 元素 | 上边距 | 说明 |
|------|--------|------|
| 输入框错误 | `mt-1` | 紧贴输入框 |
| 登录按钮错误 | `mt-3` | 与按钮保持距离 |
| 其他元素 | `mt-2` ~ `mt-4` | 根据视觉层次 |

---

## 📝 总结

### 核心原则

1. **字段级错误** → 输入框下方（`mt-1`，左对齐）
2. **全局错误** → 登录按钮上方（`mt-3`，左对齐）
3. **样式统一** → 纯文字，无背景框
4. **不要居中** → 所有错误都左对齐

### 判断标准

- ✅ 能通过修改输入解决 → 字段级错误
- ❌ 用户无法解决的系统问题 → 全局错误

### 样式规范

**字段级错误**:
```tsx
<p className="mt-1 text-xs text-red-500">
  {errors.field}
</p>
```

**全局错误**:
```tsx
<p className="mt-3 text-xs text-red-500">
  {globalError}
</p>
```

---

**制定人员**: AI Assistant  
**制定时间**: 2026-05-05  
**执行状态**: ✅ 严格执行
