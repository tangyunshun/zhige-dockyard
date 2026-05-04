import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    // TODO: 验证图形验证码（如果提供了 captcha 参数）
    // 生产环境需要验证图形验证码
    
    // 检查是否还在发送间隔内（60 秒）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCode = await prisma.smsCode.findFirst({
      where: {
        phone: email, // 邮箱存储在 phone 字段
        type: type || 'reset-password-email',
        used: false,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (recentCode) {
      const timeSinceLastSend = Date.now() - recentCode.createdAt.getTime();
      const countdown = Math.ceil((60000 - timeSinceLastSend) / 1000);
      return NextResponse.json(
        { 
          message: `验证码已发送，请${countdown}秒后再试`,
          countdown
        },
        { status: 400 }
      );
    }
    
    // TODO: 调用邮件服务商 API 发送邮件
    // 生成 6 位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 存储验证码到数据库（使用 phone 字段存储邮箱）
    await prisma.smsCode.create({
      data: {
        phone: email, // 邮箱存储在 phone 字段
        code: code,
        type: type || 'reset-password-email',
        used: false,
      },
    });
    
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
