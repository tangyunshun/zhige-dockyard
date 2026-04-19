import { NextRequest, NextResponse } from 'next/server';

/**
 * 微信登录 API
 * 
 * 支持两种模式：
 * 1. 测试模式：使用测试账号或模拟数据
 * 2. 正式模式：使用真实微信开放平台账号
 */

// 微信开放平台配置（需要从环境变量读取）
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/wechat/callback';

// 测试模式标志
const IS_TEST_MODE = !WECHAT_APP_ID || WECHAT_APP_ID === 'wx1234567890' || !WECHAT_APP_SECRET;

export async function GET(request: NextRequest) {
  try {
    // 测试模式：直接跳转到模拟授权页面
    if (IS_TEST_MODE) {
      console.log('🔧 当前为测试模式，使用模拟微信登录');
      
      // 创建一个模拟的授权 URL，直接回调并生成测试用户
      const testCallbackUrl = new URL('/api/auth/wechat/callback', request.nextUrl.origin);
      testCallbackUrl.searchParams.set('code', 'test_code_' + Date.now());
      testCallbackUrl.searchParams.set('test_mode', 'true');
      
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 正式模式：使用真实微信授权
    if (!WECHAT_APP_ID) {
      return NextResponse.json(
        { message: '微信登录未配置，请联系管理员' },
        { status: 500 }
      );
    }

    // 生成微信授权 URL
    const authorizeUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT_URI)}&response_type=code&scope=snsapi_login#wechat_redirect`;

    // 重定向到微信授权页面
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('Wechat login error:', error);
    return NextResponse.redirect('/auth/login?error=wechat_login_failed');
  }
}
