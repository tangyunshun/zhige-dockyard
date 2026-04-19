import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function GET(request: NextRequest) {
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
    const workspaces = workspaceMembers.map((member) => ({
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
