import { NextRequest, NextResponse } from 'next/server';

/**
 * 微信登录 API
 * 
 * 微信授权流程：
 * 1. 生成微信授权链接并跳转到微信授权页面
 * 2. 用户在微信授权页面完成授权
 * 3. 微信回调到 /api/auth/wechat/callback
 * 4. 处理回调获取用户信息并完成登录
 */

// 微信开放平台配置
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/wechat/callback';

// 检测是否处于测试模式
const IS_TEST_MODE = !WECHAT_APP_ID || WECHAT_APP_ID === 'wx1234567890' || !WECHAT_APP_SECRET;

export async function GET(request: NextRequest) {
  try {
    // 测试模式直接跳转到回调页面
    if (IS_TEST_MODE) {
      console.log('当前处于测试模式，将使用模拟数据完成微信登录');
      
      // 生成测试回调 URL
      const testCallbackUrl = new URL('/api/auth/wechat/callback', request.nextUrl.origin);
      testCallbackUrl.searchParams.set('code', 'test_code_' + Date.now());
      testCallbackUrl.searchParams.set('test_mode', 'true');
      
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 检查是否配置了微信登录
    if (!WECHAT_APP_ID) {
      return NextResponse.json(
        { message: '微信登录未配置，请联系管理员' },
        { status: 500 }
      );
    }

    // 生成微信授权 URL
    const authorizeUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT_URI)}&response_type=code&scope=snsapi_login#wechat_redirect`;

    // 跳转到微信授权页面
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('Wechat login error:', error);
    return NextResponse.redirect('/auth/login?error=wechat_login_failed');
  }
}
