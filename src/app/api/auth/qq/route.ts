﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from 'next/server';

/**
 * QQ 登录 API
 * 
 * 业务流程：
 * 1. 用户点击 QQ 登录按钮
 * 2. 生成 QQ 授权链接并跳转到 QQ 授权页面
 * 3. 用户在 QQ 授权页面完成授权
 * 4. QQ 回调到 /api/auth/qq/callback
 * 5. 处理回调获取用户信息并完成登录
 */

// QQ 开放平台配置
const QQ_APP_ID = process.env.QQ_APP_ID || '';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || 'http://localhost:3000/api/auth/qq/callback';

// 检测是否处于测试模式（未配置 QQ_APP_ID 或 QQ_APP_KEY）
const IS_TEST_MODE = !QQ_APP_ID || QQ_APP_ID === '1234567890' || !QQ_APP_KEY;

export async function GET(request: NextRequest) {
  try {
    // 测试模式直接跳转到回调页面
    if (IS_TEST_MODE) {
      console.log('当前处于测试模式，将使用模拟数据完成 QQ 登录');
      
      // 生成测试回调 URL
      const testCallbackUrl = new URL('/api/auth/qq/callback', request.nextUrl.origin);
      testCallbackUrl.searchParams.set('code', 'test_code_' + Date.now());
      testCallbackUrl.searchParams.set('test_mode', 'true');
      
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 检查是否配置了 QQ 登录
    if (!QQ_APP_ID) {
      return NextResponse.json(
        { message: 'QQ 登录未配置，请联系管理员' },
        { status: 500 }
      );
    }

    // 生成 QQ 授权 URL
    const authorizeUrl = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${QQ_APP_ID}&redirect_uri=${encodeURIComponent(QQ_REDIRECT_URI)}&scope=get_user_info`;

    // 跳转到 QQ 授权页面
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('QQ login error:', error);
    return NextResponse.redirect('/auth/login?error=qq_login_failed');
  }
}
