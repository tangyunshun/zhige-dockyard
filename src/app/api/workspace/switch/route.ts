﻿import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json();

    // 验证用户身份
    // TODO: 使用正确的身份验证方法
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { message: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json(
        { message: '工作空间 ID 不能为空' },
        { status: 400 }
      );
    }

    // 验证用户是否有权限访问该工作空间
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { message: '无权访问该工作空间' },
        { status: 403 }
      );
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
