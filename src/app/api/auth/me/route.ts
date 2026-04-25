import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function GET(request: NextRequest) {
  try {
    // 检查 prisma 客户端是否可用
    if (!prisma) {
      console.error('Prisma client is not initialized in /api/auth/me');
      return NextResponse.json(
        { message: '数据库连接失败', error: 'Prisma client is not initialized' },
        { status: 500 }
      );
    }

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
        role: true,
        membershipLevel: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      );
    }

    // 返回用户信息（包含角色、手机号和会员等级）
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || user.phone || user.email,
        email: user.email,
        phone: user.phone,
        role: user.role,
        membershipLevel: user.membershipLevel || 'FREE',
      },
    });
  } catch (error) {
    console.error('Token 验证失败:', error);
    return NextResponse.json(
      { message: 'Token 无效', details: error instanceof Error ? error.message : String(error) },
      { status: 401 }
    );
  }
}
