import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { account, code, type } = await request.json();

    // TODO: 从 Redis 获取验证码并验证
    // 这里暂时通过验证
    
    if (!code || code.length !== 6) {
      return NextResponse.json(
        { message: '验证码格式不正确' },
        { status: 400 }
      );
    }

    // 生产环境需要验证验证码是否正确
    
    return NextResponse.json({
      success: true,
      message: '验证码正确',
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json(
      { message: '验证失败' },
      { status: 500 }
    );
  }
}
