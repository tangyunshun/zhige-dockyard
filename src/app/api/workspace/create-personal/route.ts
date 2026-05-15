import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;

    // 尝试从 Authorization header 获取 token
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // 尝试使用 token 作为用户 ID
      const userCheck = await prisma.user.findUnique({
        where: { id: token },
      });
      if (userCheck) {
        userId = token;
      }
    }

    // 如果 header 中没有，尝试从 Cookie 获取 token
    if (!userId) {
      const token = request.cookies.get('auth_token')?.value;

      if (!token) {
        return NextResponse.json(
          { message: '未授权' },
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

    // 检查是否已存在个人空间
    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        ownerId: userId,
        type: 'PERSONAL',
      },
    });

    if (existingWorkspace) {
      // 检查是否存在 workspacemember 记录
      const existingMember = await prisma.workspacemember.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: existingWorkspace.id,
          },
        },
      });

      // 如果没有 workspacemember 记录，创建它
      if (!existingMember) {
        console.log('Workspace 存在但 WorkspaceMember 缺失，正在创建 member 记录');
        try {
          await prisma.workspacemember.create({
            data: {
              userId,
              workspaceId: existingWorkspace.id,
              role: 'OWNER',
            },
          });
          console.log('WorkspaceMember 补创建成功');
        } catch (memberError) {
          console.error('补创建 WorkspaceMember 失败:', memberError);
        }
      }

      // 如果已存在个人空间，直接返回
      return NextResponse.json({
        workspace: {
          id: existingWorkspace.id,
          name: existingWorkspace.name,
          type: existingWorkspace.type,
        },
        message: '个人空间已存在',
      });
    }

    // 创建工作空间名称
    const workspaceName = `个人空间 - ${user.name || user.phone || user.email}`;
    const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    
    console.log('创建个人空间 userId:', userId);
    
    // 创建 workspace
    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: workspaceName,
        type: 'PERSONAL',
        ownerId: userId,
        description: `${user.name || '用户'}的个人工作空间`,
        createdAt: now,
        updatedAt: now,
      },
    });
    
    console.log('Workspace 创建成功:', workspace.id);
    
    // 创建 WorkspaceMember 记录
    try {
      const memberId = `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const member = await prisma.workspacemember.create({
        data: {
          id: memberId,
          userId,
          workspaceId: workspace.id,
          role: 'OWNER',
        },
      });
      
      console.log('WorkspaceMember 创建成功:', member.id);
    } catch (memberError) {
      console.error('WorkspaceMember 创建失败:', memberError);
      // 删除 workspace
      await prisma.workspace.delete({ where: { id: workspace.id } });
      console.log('Workspace 已回滚');
      throw memberError;
    }
    
    // 更新用户的 lastWorkspaceId
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastWorkspaceId: workspace.id,
      },
    });
    
    console.log('个人空间创建完成', workspace.id);

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
      { message: '创建个人空间失败' },
      { status: 500 }
    );
  }
}
