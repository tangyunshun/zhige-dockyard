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

    // 从数据库获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: true, // 添加角色字段
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      );
    }

    // 返回用户信息（包含角色）
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || user.phone || user.email,
        email: user.email,
        avatar: user.avatar,
        role: user.role, // 添加角色信息
      },
    });
  } catch (error) {
    console.error('Token 验证失败:', error);
    return NextResponse.json(
      { message: 'Token 无效' },
      { status: 401 }
    );
  }
}
