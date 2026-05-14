import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * SSO授权失效回调API
 * 用于接收飞书、钉钉等SSO提供商的授权撤销通知
 *
 * 场景35：企业SSO授权失效
 *
 * 接收SSO提供商的回调，通知用户授权被撤销
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, openid, unionid, code, signature } = body;

    if (!provider) {
      return NextResponse.json(
        { error: "缺少提供商参数" },
        { status: 400 }
      );
    }

    console.log(`[SSO撤销] 收到${provider}授权撤销通知`, { openid, unionid });

    // 在生产环境中，应该验证签名以确保请求来自合法的SSO提供商
    // 这里简化处理，实际应该验证 signature
    if (process.env.NODE_ENV === "production") {
      // 验证签名
      if (!signature) {
        return NextResponse.json(
          { error: "缺少签名" },
          { status: 400 }
        );
      }

      // TODO: 实现实际的签名验证逻辑
      // const isValid = verifySSOSignature(provider, body, signature);
      // if (!isValid) {
      //   return NextResponse.json({ error: "签名验证失败" }, { status: 401 });
      // }
    }

    // 根据不同SSO提供商查找用户
    let userWhereClause: any = {};

    if (provider === "feishu" || provider === "lark") {
      // 飞书使用 open_id
      userWhereClause = { ssoOpenid: openid };
    } else if (provider === "dingtalk") {
      // 钉钉使用 union_id
      userWhereClause = { ssoOpenid: unionid || openid };
    } else if (provider === "wecom") {
      // 企业微信使用 user_id
      userWhereClause = { ssoOpenid: openid };
    }

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        ...userWhereClause,
        ssoProvider: provider,
      },
      select: {
        id: true,
        email: true,
        name: true,
        ssoProvider: true,
        ssoOpenid: true,
      },
    });

    if (!user) {
      console.log(`[SSO撤销] 未找到绑定该${provider}授权的用户`);
      return NextResponse.json({
        success: true,
        message: "未找到绑定该授权的用户",
      });
    }

    // 清除用户的SSO绑定信息
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ssoProvider: null,
        ssoOpenid: null,
      },
    });

    // 使该用户所有会话失效
    await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionToken: null,
        sessionExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        lastForcedLogoutAt: new Date(),
      },
    });

    console.log(`[SSO撤销] 已清除用户 ${user.id} (${user.email}) 的${provider}授权，并强制下线`);

    return NextResponse.json({
      success: true,
      message: `已撤销用户 ${user.email} 的${provider}授权`,
    });
  } catch (error) {
    console.error("[API /auth/sso/revoke] SSO授权撤销处理失败:", error);
    return NextResponse.json(
      { error: "处理失败" },
      { status: 500 }
    );
  }
}

/**
 * 获取SSO撤销授权页面（用于测试）
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get("provider") || "feishin";
  const openid = searchParams.get("openid");

  return NextResponse.json({
    title: "SSO授权撤销测试",
    description: "用于测试SSO授权撤销功能",
    provider,
    openid,
    instructions: [
      "1. 使用POST方法调用此API",
      "2. Body中包含 provider, openid/unionid 参数",
      "3. 示例: { \"provider\": \"feishu\", \"openid\": \"ou_xxx\" }",
    ],
  });
}
