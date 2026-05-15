import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { account, code, type } = await request.json();

    // TODO: 从 Redis 验证验证码
    // 此处仅为示例实现
    
    if (!code || code.length !== 6) {
      return NextResponse.json(
        { message: '验证码格式错误' },
        { status: 400 }
      );
    }

    // 实际项目中应该验证验证码是否正确    
    return NextResponse.json({
      success: true,
      message: '验证码正确',
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json(
      { message: '验证码验证失败' },
      { status: 500 }
    );
  }
}
