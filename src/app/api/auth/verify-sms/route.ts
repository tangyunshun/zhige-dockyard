import { NextRequest, NextResponse } from 'next/server';
import { verifySmsCode } from '@/lib/sms-store';

export async function POST(request: NextRequest) {
  try {
    const { phone, smsCode } = await request.json();

    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: '手机号格式不正确' },
        { status: 400 }
      );
    }

    // 验证验证码格式
    if (!smsCode || smsCode.length !== 6 || !/^\d{6}$/.test(smsCode)) {
      return NextResponse.json(
        { message: '验证码格式不正确' },
        { status: 400 }
      );
    }

    // 验证验证码
    const result = verifySmsCode(phone, smsCode);

    if (!result.success) {
      const statusCode = result.isLocked ? 429 : 400;
      return NextResponse.json(
        {
          message: result.message,
          remainingAttempts: result.remainingAttempts,
          isLocked: result.isLocked,
          minutesRemaining: result.minutesRemaining,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: '验证成功',
    });
  } catch (error) {
    console.error('Verify SMS error:', error);
    return NextResponse.json(
      { message: '验证失败，请稍后重试' },
      { status: 500 }
    );
  }
}
