import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 查询用户的所有工作空间
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            description: true,
            logo: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    // 返回简化后的工作空间列表
    const workspaces = workspaceMembers.map((member: any) => ({
      id: member.workspace.id,
      name: member.workspace.name,
      type: member.workspace.type as "PERSONAL" | "ENTERPRISE",
      role: member.role as "OWNER" | "ADMIN" | "MEMBER",
      logo: member.workspace.logo,
    }));

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Get workspaces error:', error);
    return NextResponse.json(
      { message: '获取失败，请稍后重试' },
      { status: 500 }
    );
  }
}
