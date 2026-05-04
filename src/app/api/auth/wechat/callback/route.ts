import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { SignJWT } from 'jose';

/**
 * 微信登录回调 API
 * 
 * 支持两种模式：
 * 1. 测试模式：创建模拟用户
 * 2. 正式模式：使用真实微信 API 获取用户信息
 */

const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/wechat/callback';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

// 测试模式标志
const IS_TEST_MODE = !WECHAT_APP_ID || WECHAT_APP_ID === 'wx1234567890' || !WECHAT_APP_SECRET;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const testMode = searchParams.get('test_mode');

    console.log('📍 微信回调收到参数:', { code, error, testMode });
    console.log('📍 请求 URL:', request.url);
    console.log('📍 Origin:', request.nextUrl.origin);

    // 用户取消授权
    if (error === 'user_cancel') {
      console.log('❌ 用户取消授权');
      return NextResponse.redirect(new URL('/auth/login?error=user_cancel', request.nextUrl.origin));
    }

    if (!code) {
      console.log('❌ 缺少 code 参数');
      return NextResponse.redirect(new URL('/auth/login?error=wechat_callback_invalid', request.nextUrl.origin));
    }

    // 验证 JWT_SECRET 是否配置
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('❌ JWT_SECRET 未配置！');
      return NextResponse.json(
        { error: '服务器配置错误', message: 'JWT_SECRET 未配置' },
        { status: 500 }
      );
    }
    console.log('✅ JWT_SECRET 已配置');

    // 测试模式：创建模拟用户
    if (testMode === 'true' || IS_TEST_MODE) {
      console.log('🔧 测试模式：创建模拟微信用户');
      
      try {
        // 生成模拟的微信用户信息
        const timestamp = Date.now();
        const mockOpenid = `mock_wechat_${timestamp}`;
        const mockNickname = `微信用户${Math.floor(Math.random() * 10000)}`;
        const mockAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${timestamp}`;

        console.log('📝 模拟用户信息:', { mockOpenid, mockNickname });

        // 查找或创建用户
        let user = await prisma.user.findFirst({
          where: { wechatUnionId: mockOpenid },
        });

        let isNewUser = false;
        
        if (!user) {
          console.log('➕ 创建新用户');
          user = await prisma.user.create({
            data: {
              wechatUnionId: mockOpenid,
              name: mockNickname,
              avatar: mockAvatar,
              role: 'user',
              status: 'active',
              password: 'oauth_user_no_password_' + mockOpenid, // OAuth 用户不需要密码
            },
          });
          console.log('✅ 用户创建成功:', user.id);
          isNewUser = true;
        } else {
          console.log('📂 找到已存在用户:', user.id);
        }

        // 检查用户是否有个人空间，如果没有则创建
        const workspaceMembers = await prisma.workspaceMember.findMany({
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

        // 查找是否有个人空间
        const personalWorkspace = workspaceMembers.find(
          (member) => member.workspace.type === 'PERSONAL',
        );

        // 如果没有个人空间，自动创建一个
        if (!personalWorkspace) {
          const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
          const newWorkspace = await prisma.workspace.create({
            data: {
              name: workspaceName,
              type: 'PERSONAL',
              ownerId: user.id,
              description: `${user.name || '用户'}的个人工作空间`,
            },
          });

          // 创建 WorkspaceMember 记录
          await prisma.workspaceMember.create({
            data: {
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

          console.log('✅ 为用户创建个人空间:', newWorkspace.id);
        }

        // 生成会话 token
        const sessionToken = crypto.randomUUID();
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时后过期

        // 更新用户登录时间和会话信息
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            sessionToken,
            sessionExpiresAt,
          },
        });

        console.log(
          `[Wechat Callback] 用户 ${user.id} 登录成功，lastLoginAt 已更新为:`,
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

        console.log('🎫 Token 生成成功');

        // 重定向到前端 OAuth 回调页面，传递用户信息
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

        console.log('✅ 登录成功，跳转到 OAuth 回调页面');
        return response;
      } catch (dbError) {
        console.error('❌ 数据库操作失败:', dbError);
        throw dbError;
      }
    }

    // 正式模式：使用真实微信 API
    // 1. 使用 code 获取 access_token 和 openid
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode) {
      console.error('微信 access_token 获取失败:', tokenData);
      return NextResponse.redirect('/auth/login?error=wechat_token_failed');
    }

    const { access_token, openid } = tokenData;

    // 2. 使用 access_token 和 openid 获取用户信息
    const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}`;
    
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo = await userInfoResponse.json();

    if (userInfo.errcode) {
      console.error('微信用户信息获取失败:', userInfo);
      return NextResponse.redirect('/auth/login?error=wechat_userinfo_failed');
    }

    // 3. 查找或创建用户
    let user = await prisma.user.findFirst({
      where: { wechatUnionId: openid },
    });

    let isNewUser = false;
    
    if (!user) {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          wechatUnionId: openid,
          name: userInfo.nickname || `微信用户${openid.slice(-4)}`,
          avatar: userInfo.headimgurl || null,
          role: 'user',
          status: 'active',
          password: 'oauth_user_no_password_' + openid, // OAuth 用户不需要密码
        },
      });
      isNewUser = true;
    }

    // 检查用户是否有个人空间，如果没有则创建
    const workspaceMembers = await prisma.workspaceMember.findMany({
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

    // 查找是否有个人空间
    const personalWorkspace = workspaceMembers.find(
      (member) => member.workspace.type === 'PERSONAL',
    );

    // 如果没有个人空间，自动创建一个
    if (!personalWorkspace) {
      const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
      const newWorkspace = await prisma.workspace.create({
        data: {
          name: workspaceName,
          type: 'PERSONAL',
          ownerId: user.id,
          description: `${user.name || '用户'}的个人工作空间`,
        },
      });

      // 创建 WorkspaceMember 记录
      await prisma.workspaceMember.create({
        data: {
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

      console.log('✅ 为用户创建个人空间:', newWorkspace.id);
    }

    // 生成会话 token
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小时后过期

    // 更新用户登录时间和会话信息
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        sessionToken,
        sessionExpiresAt,
      },
    });

    console.log(
      `[Wechat Callback] 用户 ${user.id} 登录成功，lastLoginAt 已更新为:`,
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

    // 重定向到前端 OAuth 回调页面，传递用户信息
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
      maxAge: 60 * 60 * 24, // 1 天
      path: '/',
    });

    console.log('✅ 登录成功，跳转到 OAuth 回调页面');
    return response;
  } catch (error) {
    console.error('❌ Wechat callback 发生错误:', error);
    console.error('错误堆栈:', JSON.stringify(error, null, 2));
    // 返回详细的错误信息以便调试
    return NextResponse.json({
      error: '微信登录回调失败',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
