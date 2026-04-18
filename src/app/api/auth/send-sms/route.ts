import { NextRequest, NextResponse } from 'next/server';
import { generateSmsCode, storeSmsCode } from '@/lib/sms-store';

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
    // 生产环境需要验证图形验证码
    
    // 生成 6 位随机验证码
    const smsCode = generateSmsCode();
    
    // 存储验证码
    const storeResult = storeSmsCode(phone, smsCode);
    
    if (!storeResult.success) {
      return NextResponse.json(
        { 
          message: storeResult.message,
          countdown: storeResult.countdown 
        },
        { status: 400 }
      );
    }
    
    // TODO: 调用阿里云/腾讯云短信 API 发送短信
    // 这里只在控制台输出，生产环境需要调用短信服务商 API
    
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
