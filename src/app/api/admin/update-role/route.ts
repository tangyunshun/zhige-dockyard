import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/admin/update-role
 * 更新用户角色（仅用于测试）
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json(
        { message: '缺少参数' },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return NextResponse.json({
      message: '角色已更新',
      user: updatedUser,
    });
  } catch (error) {
    console.error('更新角色失败:', error);
    return NextResponse.json(
      { message: '更新失败' },
      { status: 500 }
    );
  }
}
