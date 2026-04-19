import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    // 从 Cookie 中获取 token
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { message: '未登录' },
        { status: 401 }
      );
    }

    // 验证 token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

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
