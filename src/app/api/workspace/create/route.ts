import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { WorkspaceType } from '@prisma/client';
import { validateWorkspaceName } from '@/lib/workspace-validators';

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

    // 验证空间类型
    if (!type || !Object.values(WorkspaceType).includes(type)) {
      return NextResponse.json(
        { message: '无效的空间类型' },
        { status: 400 }
      );
    }

    // 获取当前用户 ID（从 Cookie 或 Token 中获取）
    // TODO: 实现用户认证中间件，这里暂时从请求头获取
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { message: '未授权访问' },
        { status: 401 }
      );
    }

    // 创建 workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        type: type as WorkspaceType,
        description: description?.trim() || null,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    // 更新用户的 lastWorkspaceId
    await prisma.user.update({
      where: { id: userId },
      data: { lastWorkspaceId: workspace.id },
    });

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        ownerId: workspace.ownerId,
        description: workspace.description,
        logo: workspace.logo,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    return NextResponse.json(
      { message: '创建失败，请稍后重试' },
      { status: 500 }
    );
  }
}
