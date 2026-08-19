import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json();

    // 验证用户身份
    let userId = request.headers.get('x-user-id');
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json(
          { message: 'UNAUTHORIZED' },
          { status: 401 }
        );
      } else {
        userId = authResult.user!.id;
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { message: '工作空间 ID 不能为空' },
        { status: 400 }
      );
    }

    // 验证用户是否有权限访问该工作空间
    const membership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      // 兜底：owner 即使缺失 workspacemember 记录也视为有效成员
      //（与 /api/workspace/list、/api/workspace/[id]/my-membership 的 owner 兜底逻辑保持一致），
      // 避免 owner 因成员记录缺失被误判为无权访问
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { ownerId: true },
      });
      if (!workspace || workspace.ownerId !== userId) {
        return NextResponse.json(
          { message: '无权访问该工作空间' },
          { status: 403 }
        );
      }
    }

    // 更新用户的 lastWorkspaceId
    await prisma.user.update({
      where: { id: userId },
      data: { lastWorkspaceId: workspaceId },
    });

    return NextResponse.json({
      success: true,
      lastWorkspaceId: workspaceId,
    });
  } catch (error) {
    console.error("Switch workspace error:", error);
    return NextResponse.json(
      { message: "切换工作空间失败" },
      { status: 500 }
    );
  }
}
