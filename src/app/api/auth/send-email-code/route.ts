import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, type } = await request.json();

    // 验证邮箱格式
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: '邮箱格式不正确' },
        { status: 400 }
      );
    }

    // TODO: 调用邮件服务商 API 发送邮件
    // 生成 6 位随机验证码
    const code = Math.random().toString().slice(2, 8);
    
    // 生产环境需要：
    // 1. 将验证码存储到 Redis，设置 5 分钟过期
    // 2. 调用 SendGrid/阿里云邮件推送等 API 发送邮件
    
    console.log(`发送邮件验证码到 ${email}: ${code} (类型：${type})`);

    return NextResponse.json({
      success: true,
      message: '验证码已发送到邮箱',
      // 开发环境返回验证码方便测试，生产环境请移除
      debugCode: code,
    });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      { message: '发送失败，请稍后重试' },
      { status: 500 }
    );
  }
}
