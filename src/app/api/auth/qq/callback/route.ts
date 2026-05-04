import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { SignJWT } from 'jose';

/**
 * QQ 登录回调 API
 * 
 * QQ 授权后会携带 code 参数回调此接口
 */

const QQ_APP_ID = process.env.QQ_APP_ID || '';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || 'http://localhost:3000/api/auth/qq/callback';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

// 测试模式标志：未配置 QQ_APP_ID 或使用测试 ID 或未配置 QQ_APP_KEY
const IS_TEST_MODE = !QQ_APP_ID || QQ_APP_ID === '1234567890' || !QQ_APP_KEY;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const testMode = searchParams.get('test_mode');

    console.log('📍 QQ 回调收到参数:', { code, error, testMode });

    // 用户取消授权
    if (error === 'user_cancel') {
      console.log('❌ 用户取消授权');
      return NextResponse.redirect(new URL('/auth/login?error=user_cancel', request.nextUrl.origin));
    }

    if (!code) {
      console.log('❌ 缺少 code 参数');
      return NextResponse.redirect(new URL('/auth/login?error=qq_callback_invalid', request.nextUrl.origin));
    }

    // 测试模式：创建模拟用户
    if (testMode === 'true' || IS_TEST_MODE) {
      console.log('🔧 测试模式：创建模拟 QQ 用户');
      
      try {
        // 生成模拟的 QQ 用户信息
        const timestamp = Date.now();
        const mockOpenid = `mock_qq_${timestamp}`;
        const mockNickname = `QQ 用户${Math.floor(Math.random() * 10000)}`;
        const mockAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${timestamp}`;

        console.log('📝 模拟用户信息:', { mockOpenid, mockNickname });

        // 查找或创建用户
        let user = await prisma.user.findFirst({
          where: { qqUnionId: mockOpenid },
        });

        let isNewUser = false;
        
        if (!user) {
          console.log('➕ 创建新用户');
          user = await prisma.user.create({
            data: {
              qqUnionId: mockOpenid,
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
          `[QQ Callback] 用户 ${user.id} 登录成功，lastLoginAt 已更新为:`,
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

    // 用户取消授权
    if (error) {
      return NextResponse.redirect('/auth/login?error=user_cancel');
    }

    if (!code) {
      return NextResponse.redirect('/auth/login?error=qq_callback_invalid');
    }

    // 1. 使用 code 获取 access_token
    const tokenUrl = `https://graph.qq.com/oauth2.0/token?grant_type=authorization_code&client_id=${QQ_APP_ID}&client_secret=${QQ_APP_KEY}&code=${code}&redirect_uri=${encodeURIComponent(QQ_REDIRECT_URI)}`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenText = await tokenResponse.text();
    
    // QQ 返回的是 URL 格式：access_token=xxx&expires_in=xxx
    const params = new URLSearchParams(tokenText);
    const access_token = params.get('access_token');

    if (!access_token) {
      console.error('QQ access_token 获取失败:', tokenText);
      return NextResponse.redirect('/auth/login?error=qq_token_failed');
    }

    // 2. 获取 openid
    const openidUrl = `https://graph.qq.com/oauth2.0/me?access_token=${access_token}`;
    
    const openidResponse = await fetch(openidUrl);
    const openidText = await openidResponse.text();
    
    // QQ 返回的是 JSONP 格式：callback( {"client_id":"xxx","openid":"xxx"} );
    const openidMatch = openidText.match(/\{[^}]+\}/);
    if (!openidMatch) {
      console.error('QQ openid 获取失败:', openidText);
      return NextResponse.redirect('/auth/login?error=qq_openid_failed');
    }
    
    const openidData = JSON.parse(openidMatch[0]);
    const openid = openidData.openid;

    // 3. 使用 access_token 和 openid 获取用户信息
    const userInfoUrl = `https://graph.qq.com/user/get_user_info?access_token=${access_token}&oauth_consumer_key=${QQ_APP_ID}&openid=${openid}`;
    
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo = await userInfoResponse.json();

    if (userInfo.ret !== 0) {
      console.error('QQ 用户信息获取失败:', userInfo);
      return NextResponse.redirect('/auth/login?error=qq_userinfo_failed');
    }

    // 4. 查找或创建用户
    let user = await prisma.user.findFirst({
      where: { qqUnionId: openid },
    });

    let isNewUser = false;
    
    if (!user) {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          qqUnionId: openid,
          name: userInfo.nickname || `QQ 用户${openid.slice(-4)}`,
          avatar: userInfo.figureurl_qq_2 || null,
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
      `[QQ Callback] 用户 ${user.id} 登录成功，lastLoginAt 已更新为:`,
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
    console.error('❌ QQ callback 发生错误:', error);
    console.error('错误堆栈:', JSON.stringify(error, null, 2));
    // 返回详细的错误信息以便调试
    return NextResponse.json({
      error: 'QQ 登录回调失败',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
