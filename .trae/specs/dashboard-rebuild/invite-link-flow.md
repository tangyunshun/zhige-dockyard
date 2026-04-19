# 邀请链接自动绑定机制 - 后端伪代码

## 业务逻辑流转

### 场景 1: 用户通过邀请链接注册

```
用户点击邀请链接 → /register?inviteToken=xyz
  → 填写注册信息（账号、密码、手机号等）
  → 提交注册
  → 后端检测 inviteToken 参数
  → 验证 token 有效性
  → 获取对应的 workspaceId
  → 创建 User 记录
  → 自动创建 WorkspaceMember 记录（role: MEMBER）
  → 返回 { skipDashboard: true, workspaceId }
  → 前端直接跳转到 /workspace/{workspaceId}
```

---

## 后端 API 实现

### 1. 注册 API 支持邀请参数

**文件**: `/src/app/api/auth/register/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hash } from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, password, phone, inviteToken } = body;

    // 1. 检测是否有邀请 Token
    let workspaceInfo = null;
    if (inviteToken) {
      // 验证邀请 Token
      const inviteRecord = await prisma.inviteToken.findUnique({
        where: { token: inviteToken },
        include: {
          workspace: true,
        },
      });

      if (!inviteRecord) {
        return NextResponse.json(
          { message: '邀请链接无效或已过期' },
          { status: 400 }
        );
      }

      // 检查邀请 Token 是否过期
      if (inviteRecord.expiresAt < new Date()) {
        return NextResponse.json(
          { message: '邀请链接已过期' },
          { status: 400 }
        );
      }

      workspaceInfo = {
        workspaceId: inviteRecord.workspaceId,
        role: inviteRecord.role || 'MEMBER',
      };
    }

    // 2. 检查账号是否已存在
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: account },
          { email: account },
          { name: account },
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: '该账号已注册' },
        { status: 400 }
      );
    }

    // 3. 创建用户
    const hashedPassword = await hash(password, 10);
    const user = await prisma.user.create({
      data: {
        phone: account,
        password: hashedPassword,
        name: account,
      },
    });

    // 4. 如果有邀请 Token，自动绑定到企业空间
    if (workspaceInfo) {
      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspaceInfo.workspaceId,
          role: workspaceInfo.role,
        },
      });

      // 删除已使用的邀请 Token
      await prisma.inviteToken.delete({
        where: { token: inviteToken },
      });
    }

    // 5. 生成 JWT Token
    const token = await generateJWT(user.id);

    // 6. 返回响应
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
      },
      skipDashboard: !!workspaceInfo,
      workspaceId: workspaceInfo?.workspaceId,
    }, {
      status: 201,
    });

  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { message: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}
```

---

### 2. 创建邀请 Token API

**文件**: `/src/app/api/workspace/invite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';
import { randomBytes } from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json(
        { message: '未登录' },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const body = await request.json();
    const { workspaceId, email, role = 'MEMBER', expiresDays = 7 } = body;

    // 验证用户是否有权限创建邀请
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      return NextResponse.json(
        { message: '无权限创建邀请' },
        { status: 403 }
      );
    }

    // 生成邀请 Token
    const inviteToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    // 创建邀请记录
    await prisma.inviteToken.create({
      data: {
        token: inviteToken,
        workspaceId,
        email, // 可选：限制特定邮箱
        role,
        expiresAt,
        createdBy: userId,
      },
    });

    // 生成邀请链接
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/register?inviteToken=${inviteToken}`;

    return NextResponse.json({
      inviteToken,
      inviteUrl,
      expiresAt,
    });

  } catch (error) {
    console.error('Create invite error:', error);
    return NextResponse.json(
      { message: '创建邀请失败，请稍后重试' },
      { status: 500 }
    );
  }
}
```

---

### 3. 验证邀请 Token API

**文件**: `/src/app/api/workspace/verify-invite/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const inviteToken = searchParams.get('token');

    if (!inviteToken) {
      return NextResponse.json(
        { message: '缺少邀请 Token' },
        { status: 400 }
      );
    }

    // 验证邀请 Token
    const inviteRecord = await prisma.inviteToken.findUnique({
      where: { token: inviteToken },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            logo: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    if (!inviteRecord) {
      return NextResponse.json(
        { message: '邀请链接无效' },
        { status: 404 }
      );
    }

    // 检查是否过期
    if (inviteRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { message: '邀请链接已过期' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      workspace: {
        id: inviteRecord.workspace.id,
        name: inviteRecord.workspace.name,
        type: inviteRecord.workspace.type,
        logo: inviteRecord.workspace.logo,
      },
      role: inviteRecord.role,
      expiresAt: inviteRecord.expiresAt,
      createdBy: inviteRecord.createdBy,
    });

  } catch (error) {
    console.error('Verify invite error:', error);
    return NextResponse.json(
      { message: '验证邀请失败' },
      { status: 500 }
    );
  }
}
```

---

## 数据库 Schema 补充

**文件**: `/prisma/schema.prisma`

```prisma
// 邀请 Token 模型
model InviteToken {
  id          String    @id @default(cuid())
  token       String    @unique
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  email       String?   // 可选：限制特定邮箱
  role        WorkspaceRole @default(MEMBER)
  expiresAt   DateTime
  createdBy   String
  createdAt   DateTime  @default(now())
  
  @@index([token])
  @@index([workspaceId])
}
```

---

## 前端对接说明

### 注册页面检测邀请参数

```typescript
// /src/app/auth/register/page.tsx
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('inviteToken');
  
  if (inviteToken) {
    // 验证邀请 Token
    verifyInviteToken(inviteToken);
  }
}, []);

const verifyInviteToken = async (token: string) => {
  try {
    const res = await fetch(`/api/workspace/verify-invite?token=${token}`);
    if (res.ok) {
      const data = await res.json();
      // 显示邀请信息
      setInviteInfo({
        workspaceName: data.workspace.name,
        role: data.role,
        createdBy: data.createdBy.name,
      });
    }
  } catch (error) {
    console.error('验证邀请失败:', error);
  }
};
```

### 注册表单提交

```typescript
const handleRegister = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('inviteToken');
  
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: formData.account,
      password: formData.password,
      phone: formData.phone,
      inviteToken, // 传递邀请 Token
    }),
  });

  const data = await res.json();
  
  if (data.skipDashboard) {
    // 直接跳转到企业 workspace
    router.push(`/workspace/${data.workspaceId}`);
  } else {
    // 跳转到 Dashboard 选择 workspace
    router.push('/dashboard');
  }
};
```

---

## 验收标准

### 功能验收
- [ ] 邀请链接格式正确：`/register?inviteToken=xxx`
- [ ] 邀请 Token 验证成功返回 workspace 信息
- [ ] 注册成功后自动绑定到企业空间
- [ ] 跳过 Dashboard 直接进入 workspace
- [ ] 邀请 Token 使用后被删除
- [ ] 过期 Token 无法使用

### 安全验收
- [ ] 只有 OWNER/ADMIN 可以创建邀请
- [ ] 邀请 Token 有有效期限制
- [ ] 邀请 Token 只能使用一次
- [ ] 验证用户权限

### 用户体验验收
- [ ] 注册页面显示邀请信息（企业名、邀请人）
- [ ] 注册流程顺畅无卡顿
- [ ] 错误提示清晰友好
