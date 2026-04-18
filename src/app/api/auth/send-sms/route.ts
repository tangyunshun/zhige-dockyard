import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { phone, captcha, type } = await request.json();

    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: '手机号格式不正确' },
        { status: 400 }
      );
    }

    // TODO: 验证图形验证码（如果提供了 captcha 参数）
    // TODO: 调用短信服务商 API 发送短信
    // 这里生成一个 6 位随机验证码作为示例
    const smsCode = Math.random().toString().slice(2, 8);
    
    // 生产环境需要：
    // 1. 将验证码存储到 Redis，设置 5 分钟过期
    // 2. 调用阿里云/腾讯云短信 API 发送
    
    console.log(`发送短信验证码到 ${phone}: ${smsCode} (类型：${type})`);

    return NextResponse.json({
      success: true,
      message: '验证码已发送',
      // 开发环境返回验证码方便测试，生产环境请移除
      debugCode: smsCode,
    });
  } catch (error) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { message: '发送失败，请稍后重试' },
      { status: 500 }
    );
  }
}
