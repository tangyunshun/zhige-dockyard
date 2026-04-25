import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;

    // 首先尝试从 Authorization header 中获取 token
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // 如果 token 是用户 ID（简化验证）
      const userCheck = await prisma.user.findUnique({
        where: { id: token },
      });
      if (userCheck) {
        userId = token;
      }
    }

    // 如果 header 中没有，尝试从 Cookie 中获取 token
    if (!userId) {
      const token = request.cookies.get('auth_token')?.value;

      if (!token) {
        return NextResponse.json(
          { message: '未登录' },
          { status: 401 }
        );
      }

      // 验证 token
      const { payload } = await jwtVerify(token, JWT_SECRET);
      userId = payload.userId as string;
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      );
    }

    // 检查是否已经有个人空间
    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        ownerId: userId,
        type: 'PERSONAL',
      },
    });

    if (existingWorkspace) {
      // 如果已经有个人空间，直接返回
      return NextResponse.json({
        workspace: {
          id: existingWorkspace.id,
          name: existingWorkspace.name,
          type: existingWorkspace.type,
        },
        message: '个人空间已存在',
      });
    }

    // 创建个人空间
    const workspaceName = `个人空间 - ${user.name || user.phone || user.email}`;
    
    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        type: 'PERSONAL',
        ownerId: userId,
        description: `${user.name || '用户'}的个人工作空间`,
      },
    });

    // 创建 WorkspaceMember 记录
    await prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId: workspace.id,
        role: 'OWNER',
      },
    });

    // 更新用户的 lastWorkspaceId
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastWorkspaceId: workspace.id,
      },
    });

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
      },
    });
  } catch (error) {
    console.error('Create personal workspace error:', error);
    return NextResponse.json(
      { message: '创建个人空间失败，请稍后重试' },
      { status: 500 }
    );
  }
}
