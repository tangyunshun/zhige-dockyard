# 登录服务器错误排查与修复

**问题时间**: 2026-05-05  
**问题等级**: 🔴 严重

---

## 🐛 问题现象

**用户反馈**: 登录时显示"服务器错误"

**错误来源**: `src/app/api/auth/login/route.ts` 第 355 行

```typescript
return NextResponse.json({ message: "服务器错误" }, { status: 500 });
```

---

## 🔍 可能的原因

### 1. 数据库连接失败
- MySQL 服务未启动
- 数据库连接字符串配置错误
- 数据库权限问题

### 2. Prisma 客户端问题
- Prisma Client 未生成
- Prisma schema 未同步
- 数据库表不存在

### 3. 环境变量缺失
- `DATABASE_URL` 未配置
- `JWT_SECRET` 未配置

### 4. 代码逻辑错误
- 事务处理失败
- 数据写入失败
- 外键约束冲突

---

## ✅ 解决方案

### 方案 1: 优化错误处理，显示详细错误信息

**修改文件**: `src/app/api/auth/login/route.ts`

**修改前**:
```typescript
} catch (error) {
  console.error("Login error:", error);
  return NextResponse.json({ message: "服务器错误" }, { status: 500 });
}
```

**修改后**:
```typescript
} catch (error) {
  console.error("Login error:", error);
  
  // 详细错误信息（开发环境）
  const errorMessage = error instanceof Error ? error.message : "未知错误";
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  // 生产环境隐藏详细错误
  const isDev = process.env.NODE_ENV === "development";
  
  return NextResponse.json(
    { 
      message: isDev ? `服务器错误：${errorMessage}` : "服务器错误",
      stack: isDev ? errorStack : undefined,
    }, 
    { status: 500 }
  );
}
```

### 方案 2: 添加数据库连接检查

**在 API 开始时检查数据库连接**:

```typescript
export async function POST(request: NextRequest) {
  try {
    // 检查数据库连接
    await prisma.$connect();
    
    const { account, password, rememberMe } = await request.json();
    
    // ... 其他逻辑
    
  } catch (error) {
    console.error("Login error:", error);
    
    // 判断是否为数据库连接错误
    if (error instanceof Error && error.message.includes("connect")) {
      return NextResponse.json(
        { 
          message: "数据库连接失败，请联系管理员",
          detail: error.message,
        }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        message: "服务器错误",
        detail: error instanceof Error ? error.message : undefined,
      }, 
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
```

### 方案 3: 检查并修复 Prisma 配置

**步骤 1: 检查 .env 文件**

确保 `.env` 文件包含正确的数据库配置：

```env
DATABASE_URL="mysql://root:password@localhost:3306/zhige_dockyard?charset=utf8mb4"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
```

**步骤 2: 重新生成 Prisma Client**

```bash
cd "d:\Project Development\ZhiGe-Dockyard\zhige-dockyard-web"
npx prisma generate
```

**步骤 3: 检查数据库迁移状态**

```bash
npx prisma migrate status
```

如果有未应用的迁移：

```bash
npx prisma migrate deploy
```

**步骤 4: 检查数据库表是否存在**

连接到 MySQL 并检查：

```sql
USE zhige_dockyard;
SHOW TABLES;
```

应该包含以下表：
- `User`
- `Workspace`
- `WorkspaceMember`
- `LoginHistory`
- 等其他表

---

## 🔧 即时修复（添加详细错误日志）

让我立即修改登录 API，添加详细的错误日志：

```typescript
} catch (error) {
  console.error("Login error:", error);
  
  // 分类错误类型
  let errorMessage = "服务器错误";
  let errorDetail = undefined;
  
  if (error instanceof Error) {
    errorDetail = error.message;
    
    // 数据库连接错误
    if (error.message.includes("connect") || error.message.includes("ECONNREFUSED")) {
      errorMessage = "数据库连接失败";
    }
    // Prisma 错误
    else if (error.message.includes("Prisma")) {
      errorMessage = "数据库操作失败";
    }
    // 认证错误
    else if (error.message.includes("password") || error.message.includes("hash")) {
      errorMessage = "密码验证失败";
    }
  }
  
  return NextResponse.json(
    { 
      message: errorMessage,
      detail: process.env.NODE_ENV === "development" ? errorDetail : undefined,
    }, 
    { status: 500 }
  );
}
```

---

## 📋 排查步骤

### 步骤 1: 检查开发服务器日志

打开浏览器控制台（F12），查看 Network 标签页中登录请求的详细错误信息。

### 步骤 2: 检查终端日志

查看 Next.js 开发服务器的终端输出，寻找错误堆栈信息。

### 步骤 3: 测试数据库连接

创建测试文件 `src/app/api/test-db/route.ts`:

```typescript
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$connect();
    await prisma.user.findFirst();
    return NextResponse.json({ success: true, message: "数据库连接正常" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}
```

访问 `http://localhost:3000/api/test-db` 检查数据库连接。

### 步骤 4: 检查环境变量

在项目根目录创建或检查 `.env` 文件：

```env
DATABASE_URL="mysql://用户名：密码@localhost:3306/数据库名?charset=utf8mb4"
JWT_SECRET="随机字符串（至少 32 位）"
```

### 步骤 5: 重启开发服务器

```bash
# 停止当前服务器（Ctrl+C）
# 清除缓存
rm -rf .next
# 重新启动
npm run dev
```

---

## 🎯 快速诊断命令

```bash
# 1. 检查 Prisma 配置
npx prisma validate

# 2. 生成 Prisma Client
npx prisma generate

# 3. 检查数据库连接
npx prisma db pull

# 4. 查看迁移状态
npx prisma migrate status

# 5. 如果有未应用的迁移
npx prisma migrate deploy
```

---

## 📊 常见错误与解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "Can't connect to MySQL server" | MySQL 未启动 | 启动 MySQL 服务 |
| "Access denied for user" | 数据库密码错误 | 检查 .env 中的 DATABASE_URL |
| "Unknown database" | 数据库不存在 | 创建数据库或运行迁移 |
| "Table doesn't exist" | 表未创建 | 运行 `npx prisma migrate deploy` |
| "Prisma Client not generated" | Client 未生成 | 运行 `npx prisma generate` |

---

## ✅ 修复后的效果

**开发环境**:
```json
{
  "message": "数据库连接失败",
  "detail": "Can't connect to MySQL server on 'localhost:3306'"
}
```

**生产环境**:
```json
{
  "message": "服务器错误"
}
```

---

**下一步**: 根据详细的错误信息定位具体问题并修复。
