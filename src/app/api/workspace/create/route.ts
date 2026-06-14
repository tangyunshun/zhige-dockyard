import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { workspace_type } from '@prisma/client';
import { validateWorkspaceName } from '@/lib/workspace-validators';
import { validateUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { name, type, description } = await request.json();

    // 验证工作空间名称
    const validation = validateWorkspaceName(name);
    if (!validation.valid) {
      return NextResponse.json(
        { message: validation.message },
        { status: 400 }
      );
    }

    // 验证工作空间类型
    if (!type || !Object.values(workspace_type).includes(type)) {
      return NextResponse.json(
        { message: '无效的工作空间类型' },
        { status: 400 }
      );
    }

    // 验证用户身份
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        const cookieUserId = request.cookies.get("userId")?.value;
        if (cookieUserId) {
          userId = cookieUserId;
        } else {
          return NextResponse.json({ message: authResult.error || "未授权访问" }, { status: 401 });
        }
      } else {
        userId = authResult.user!.id;
      }
    }

    // 查询用户的 membershipLevel
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    const membershipLevel = user?.membershipLevel || 'FREE';
    
    let ml = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel }
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";
    const tokenLimit = membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;

    const workspaceId = `ws-custom-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // 创建 workspace 并嵌套在事务中初始化开通配额
    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: name.trim(),
        type: type as workspace_type,
        description: description?.trim() || null,
        ownerId: userId,
        updatedAt: new Date(),
        workspacemember: {
          create: {
            id: crypto.randomUUID(),
            userId,
            role: 'OWNER',
          },
        },
        workspacequota: {
          create: {
            id: crypto.randomUUID(),
            workspaceId: workspaceId,
            membershipLevelId: mlId,
            tokenBalance: BigInt(tokenLimit),
            updatedAt: new Date(),
          }
        }
      },
      include: {
        workspacemember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        workspacequota: true
      },
    });

    return NextResponse.json({
      success: true,
      workspace,
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    return NextResponse.json(
      { message: '创建工作空间失败' },
      { status: 500 }
    );
  }
}
