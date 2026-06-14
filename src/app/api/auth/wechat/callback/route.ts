import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SignJWT } from 'jose';

/**
 * 微信登录回调 API
 * 
 * 处理微信授权后的回调，获取用户信息并完成登录
 */

const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/wechat/callback';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

// 检测是否处于测试模式
const IS_TEST_MODE = !WECHAT_APP_ID || WECHAT_APP_ID === 'wx1234567890' || !WECHAT_APP_SECRET;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const testMode = searchParams.get('test_mode');

    console.log('微信回调参数:', { code, error, testMode });

    // 用户取消授权
    if (error === 'user_cancel') {
      console.log('用户取消了微信授权');
      return NextResponse.redirect(new URL('/auth/login?error=user_cancel', request.nextUrl.origin));
    }

    if (!code) {
      console.log('缺少 code 参数');
      return NextResponse.redirect(new URL('/auth/login?error=wechat_callback_invalid', request.nextUrl.origin));
    }

    // 测试模式
    if (testMode === 'true' || IS_TEST_MODE) {
      console.log('当前处于测试模式，将使用模拟数据完成微信登录');
      
      try {
        // 生成模拟用户数据
        const timestamp = Date.now();
        const mockOpenid = `mock_wechat_${timestamp}`;
        const mockNickname = `微信用户${Math.floor(Math.random() * 10000)}`;
        const mockAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${timestamp}`;

        console.log('模拟微信用户信息:', { mockOpenid, mockNickname });

        // 查找或创建用户
        let user = await prisma.user.findFirst({
          where: { wechatUnionId: mockOpenid },
        });

        let isNewUser = false;
        
        if (!user) {
          console.log('创建新用户');
          user = await prisma.user.create({
            data: {
              wechatUnionId: mockOpenid,
              name: mockNickname,
              avatar: mockAvatar,
              role: 'user',
              status: 'active',
              password: 'oauth_user_no_password_' + mockOpenid,
            },
          });
          console.log('新用户创建成功:', user.id);
          isNewUser = true;
        } else {
          console.log('用户已存在:', user.id);
        }

        // 检查工作空间
        const workspaceMembers = await prisma.workspacemember.findMany({
          where: { userId: user.id },
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                type: true,
                ownerId: true,
                description: true,
                logo: true,
              },
            },
          },
        });

        // 检查是否有个人空间
        const personalWorkspace = workspaceMembers.find(
          (member) => member.workspace.type === 'PERSONAL',
        );

        // 如果没有个人空间，创建一个
        if (!personalWorkspace) {
          const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
          const newWorkspace = await prisma.workspace.create({
            data: {
              id: crypto.randomUUID(),
              name: workspaceName,
              type: 'PERSONAL',
              ownerId: user.id,
              description: `${user.name || '用户'}的个人工作空间`,
              updatedAt: new Date(),
            },
          });

          // 添加工作空间成员
          await prisma.workspacemember.create({
            data: {
              id: crypto.randomUUID(),
              userId: user.id,
              workspaceId: newWorkspace.id,
              role: 'OWNER',
            },
          });

          // 更新用户的 lastWorkspaceId
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastWorkspaceId: newWorkspace.id,
            },
          });

          console.log('创建个人空间成功:', newWorkspace.id);
        }

        // 生成 session
        const sessionToken = crypto.randomUUID();
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时
        
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            sessionToken,
            sessionExpiresAt,
          },
        });

        console.log(
          `[微信 Callback] 用户 ${user.id} 登录成功`,
          new Date().toISOString(),
          `sessionToken: ${sessionToken}`,
        );

        // 生成 JWT Token
        const token = await new SignJWT({
          userId: user.id,
          email: user.email,
          role: user.role,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('24h')
          .sign(JWT_SECRET);

        // 准备用户数据
        const userData = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          sessionToken,
        };

        const redirectUrl = new URL('/auth/oauth-callback', request.nextUrl.origin);
        redirectUrl.searchParams.set('user', encodeURIComponent(JSON.stringify(userData)));
        redirectUrl.searchParams.set('new', isNewUser ? 'true' : 'false');

        // 设置 Cookie
        const response = NextResponse.redirect(redirectUrl.toString());
        response.cookies.set('auth_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24,
          path: '/',
        });

        console.log('微信登录成功，跳转到 OAuth 回调页面');
        return response;
      } catch (dbError) {
        console.error('数据库操作错误:', dbError);
        throw dbError;
      }
    }

    // 正式模式（未实现）
    return NextResponse.json({
      error: '正式模式未实现',
      message: '当前仅支持测试模式',
    }, { status: 501 });
  } catch (error) {
    console.error('微信 callback 错误:', error);
    console.error('错误详情:', JSON.stringify(error, null, 2));
    return NextResponse.json({
      error: '微信登录回调处理失败',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
