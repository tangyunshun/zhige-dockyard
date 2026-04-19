import { NextRequest, NextResponse } from 'next/server';

/**
 * QQ 登录 API
 * 
 * 实现流程：
 * 1. 检测是否为测试模式（未配置 QQ 应用信息）
 * 2. 测试模式：直接跳转到模拟授权页面
 * 3. 正式模式：生成 QQ 授权 URL 并重定向
 * 4. 用户授权后，QQ 回调 /api/auth/qq/callback
 * 5. 获取用户信息并登录
 */

// QQ 互联配置（需要从环境变量读取）
const QQ_APP_ID = process.env.QQ_APP_ID || '';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || 'http://localhost:3000/api/auth/qq/callback';

// 测试模式标志：未配置 QQ_APP_ID 或使用测试 ID 或未配置 QQ_APP_KEY
const IS_TEST_MODE = !QQ_APP_ID || QQ_APP_ID === '1234567890' || !QQ_APP_KEY;

export async function GET(request: NextRequest) {
  try {
    // 测试模式：直接跳转到模拟授权页面
    if (IS_TEST_MODE) {
      console.log('🔧 当前为测试模式，使用模拟 QQ 登录');
      
      // 创建一个模拟的授权 URL，直接回调并生成测试用户
      const testCallbackUrl = new URL('/api/auth/qq/callback', request.nextUrl.origin);
      testCallbackUrl.searchParams.set('code', 'test_code_' + Date.now());
      testCallbackUrl.searchParams.set('test_mode', 'true');
      
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 正式模式：使用真实 QQ 授权
    if (!QQ_APP_ID) {
      return NextResponse.json(
        { message: 'QQ 登录未配置，请联系管理员' },
        { status: 500 }
      );
    }

    // 生成 QQ 授权 URL
    const authorizeUrl = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${QQ_APP_ID}&redirect_uri=${encodeURIComponent(QQ_REDIRECT_URI)}&scope=get_user_info`;

    // 重定向到 QQ 授权页面
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('QQ login error:', error);
    return NextResponse.redirect('/auth/login?error=qq_login_failed');
  }
}
