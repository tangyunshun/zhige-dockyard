import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    // 验证工作空间类型
    if (!type || !Object.values(WorkspaceType).includes(type)) {
      return NextResponse.json(
        { message: '无效的工作空间类型' },
        { status: 400 }
      );
    }

    // 获取用户 ID（从 header 或 Cookie Token）
    // TODO: 使用正确的身份验证方法
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { message: 'UNAUTHORIZED' },
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
