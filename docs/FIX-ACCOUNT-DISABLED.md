# 账号禁用问题修复报告

**修复时间**: 2026-05-05  
**问题等级**: 🔴 严重（影响新用户登录）

---

## 🐛 问题描述

**现象**: 新注册账号后立即尝试登录，显示"账号已被禁用"错误提示  
**影响**: 所有新用户无法正常登录系统  
**用户反馈**: "刚注册账号，登录就显示被禁用"

---

## 🔍 问题根源

### 代码位置
- **注册 API**: `src/app/api/auth/register/route.ts`
- **登录 API**: `src/app/api/auth/login/route.ts`

### 问题逻辑

1. **注册时**: 用户状态被设置为 `'inactive'`（未激活）
   ```typescript
   // 注册 API 第 56、158、254 行
   INSERT INTO user (..., status, ...)
   VALUES (..., 'inactive', ...)
   ```

2. **登录时**: 检查用户状态，如果不是 `'active'` 就拒绝登录
   ```typescript
   // 登录 API 原代码
   if (user.status !== "active") {
     // 返回"账号未激活"或"账号被禁用"错误
   }
   ```

### 矛盾点
- 注册时设置状态为 `inactive`（预期需要验证）
- 但实际上系统没有实现验证流程
- 导致新用户永远无法登录（死循环）

---

## ✅ 修复方案

### 修复逻辑
允许 `inactive` 状态的用户登录，并在登录成功后自动激活账号。

### 修复代码
**文件**: `src/app/api/auth/login/route.ts`

**修改前**:
```typescript
// 检查账号状态
if (user.status !== "active") {
  let statusMessage = "账号状态异常";
  let statusCode = 403;

  if (user.status === "inactive") {
    statusMessage = "账号未激活，请先验证邮箱或手机号";
    statusCode = 403;
  } else if (user.status === "banned") {
    statusMessage = "账号已被封禁，无法登录";
    statusCode = 403;
  } else if (user.status === "deleted") {
    statusMessage = "账号已被注销";
    statusCode = 403;
  }

  return NextResponse.json(
    {
      message: statusMessage,
      accountExists: true,
      status: user.status,
    },
    { status: statusCode },
  );
}
```

**修改后**:
```typescript
// 检查账号状态
if (user.status === "banned") {
  return NextResponse.json(
    {
      message: "账号已被封禁，无法登录",
      accountExists: true,
      status: user.status,
    },
    { status: 403 },
  );
} else if (user.status === "deleted") {
  return NextResponse.json(
    {
      message: "账号已被注销",
      accountExists: true,
      status: user.status,
    },
    { status: 403 },
  );
}

// 如果是 inactive 状态，自动激活（新注册的用户）
if (user.status === "inactive") {
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active" },
  });
  user.status = "active";
}
```

### 修复效果
1. ✅ 新用户首次登录时，自动从 `inactive` 激活为 `active`
2. ✅ 只有 `banned`（封禁）和 `deleted`（注销）状态的账号被拒绝登录
3. ✅ 登录成功后，账号状态永久变为 `active`，后续登录无影响

---

## 📋 状态码说明

| 状态值 | 说明 | 是否可登录 | 处理方式 |
|-------|------|-----------|---------|
| `active` | 正常激活状态 | ✅ 可登录 | 正常登录 |
| `inactive` | 未激活状态（新注册） | ✅ 可登录（自动激活） | 首次登录时自动激活 |
| `banned` | 被封禁 | ❌ 禁止登录 | 联系管理员解封 |
| `deleted` | 已注销 | ❌ 禁止登录 | 无法恢复 |

---

## 🧪 测试验证

### 测试场景 1: 新用户注册后立即登录
**步骤**:
1. 访问注册页面
2. 输入手机号/邮箱/用户名
3. 输入验证码和密码
4. 完成注册
5. 立即使用相同账号登录

**预期结果**: ✅ 登录成功，账号状态自动激活  
**实际结果**: ✅ 登录成功

### 测试场景 2: 已激活用户登录
**步骤**:
1. 使用已激活的账号登录

**预期结果**: ✅ 正常登录  
**实际结果**: ✅ 正常登录

### 测试场景 3: 被封禁账号登录
**步骤**:
1. 将账号状态手动设置为 `banned`
2. 尝试登录

**预期结果**: ❌ 显示"账号已被封禁，无法登录"  
**实际结果**: ❌ 正确拒绝

---

## 📊 影响范围

### 影响的功能
- ✅ 新用户注册流程
- ✅ 新用户首次登录
- ✅ 账号状态管理

### 不受影响的功能
- ✅ 已激活用户正常登录
- ✅ 账号密码验证
- ✅ 手机号验证码登录
- ✅ 会话管理

### 数据库影响
- **表**: `user`
- **字段**: `status`
- **影响**: 新注册用户会在首次登录时自动更新状态

---

## 🔄 后续优化建议

### 短期优化（可选）
1. **实现真正的验证流程**
   - 发送验证邮件/短信
   - 用户点击验证链接后激活账号
   - 验证前限制部分功能使用

2. **优化提示信息**
   - 首次登录时显示"账号已自动激活"提示
   - 增加欢迎引导

### 中期优化（可选）
1. **账号状态机**
   - 定义完整的状态流转图
   - 记录状态变更历史
   - 增加状态变更通知

2. **安全增强**
   - 新设备登录需要二次验证
   - 异地登录提醒
   - 登录历史记录优化

---

## 📝 总结

### 问题原因
注册时将用户状态设置为 `inactive`，但登录逻辑不允许 `inactive` 状态登录，导致死循环。

### 修复方式
修改登录逻辑，允许 `inactive` 状态登录并自动激活账号。

### 修复结果
✅ 新用户可以正常注册和登录  
✅ 账号状态管理更加合理  
✅ 用户体验得到改善  

### 验证状态
✅ 已测试通过  
✅ 代码已提交  
✅ 文档已更新  

---

**修复人员**: AI Assistant  
**修复时间**: 2026-05-05  
**验证状态**: ✅ 通过
