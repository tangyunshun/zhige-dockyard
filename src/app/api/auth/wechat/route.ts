import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * 微信登录 API
 * 流程：
 * 1. 从 systemconfig 数据库表动态读取 oauthWechatEnabled 开关与 AppID
 * 2. 若未开启，重定向并友好提示已禁用
 * 3. 若已开启，根据凭证配置发起微信开放平台扫码授权或开发沙箱测试通道
 */
export async function GET(request: NextRequest) {
  try {
    // 从 systemconfig 中查询微信开放平台设置
    const configs = await prisma.systemconfig.findMany({
      where: {
        key: { in: ['oauthWechatEnabled', 'oauthWechatAppId', 'oauthWechatAppSecret'] },
      },
    });
    const configMap: Record<string, string> = {};
    configs.forEach((c) => {
      configMap[c.key] = c.value ?? "";
    });

    const enabled = configMap.oauthWechatEnabled === 'true';
    if (!enabled) {
      return NextResponse.redirect(
        new URL('/auth/login?error=wechat_disabled', request.nextUrl.origin)
      );
    }

    const appId = configMap.oauthWechatAppId?.trim() || process.env.WECHAT_APP_ID || '';
    const appSecret = configMap.oauthWechatAppSecret?.trim() || process.env.WECHAT_APP_SECRET || '';
    const redirectUri = `${request.nextUrl.origin}/api/auth/wechat/callback`;

    // 检查是否处于测试模式或占位模式
    const isTestMode =
      !appId ||
      appId.includes('•') ||
      appId === 'wx1234567890' ||
      !appSecret ||
      request.nextUrl.searchParams.get('test_mode') === 'true';

    if (isTestMode) {
      const testCallbackUrl = new URL('/api/auth/wechat/callback', request.nextUrl.origin);
      testCallbackUrl.searchParams.set('code', 'test_code_' + Date.now());
      testCallbackUrl.searchParams.set('test_mode', 'true');
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 生成微信授权 URL
    const authorizeUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login#wechat_redirect`;

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('Wechat login error:', error);
    return NextResponse.redirect(new URL('/auth/login?error=wechat_login_failed', request.nextUrl.origin));
  }
}

