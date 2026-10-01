import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedDefaultWelcomeNotifications } from "@/lib/notifications-store";
import { SignJWT } from "jose";
import crypto from "crypto";

export const dynamic = "force-dynamic";
import { getJwtSecretKey } from "@/lib/jwt-config";

/**
 * GitHub 登录/注册授权回调端点
 * 真实与沙箱全闭环：
 * 1. 验证授权 Code
 * 2. 获取 GitHub 用户资料
 * 3. 关联或自动注册本地账户与初始工作空间
 * 4. 签发登录凭证并跳转 /auth/oauth-callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const testMode = searchParams.get("test_mode");

    if (error) {
      console.warn("GitHub 授权被取消或返回错误:", error);
      return NextResponse.redirect(
        new URL("/auth/login?error=github_cancel", request.nextUrl.origin)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/auth/login?error=github_code_missing", request.nextUrl.origin)
      );
    }

    // 检查后台是否启用了 GitHub 登录
    const enabledConfig = await prisma.systemconfig.findUnique({
      where: { key: "oauthGithubEnabled" },
    });
    if (enabledConfig && enabledConfig.value !== "true") {
      return NextResponse.redirect(
        new URL("/auth/login?error=github_disabled", request.nextUrl.origin)
      );
    }

    let githubUser: {
      id: string | number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    if (testMode === "true" || code.startsWith("mock_github_code_")) {
      // 开发者沙箱模拟账户
      const mockId = Math.floor(100000 + Math.random() * 900000);
      githubUser = {
        id: mockId,
        login: `gh_dev_${mockId}`,
        name: `GitHub极客_${mockId.toString().slice(-4)}`,
        email: `dev_${mockId}@github.zhige.com`,
        avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=gh_${mockId}`,
      };
    } else {
      // 真实请求 GitHub Token
      const clientSecretConfig = await prisma.systemconfig.findUnique({
        where: { key: "oauthGithubClientSecret" },
      });
      const clientIdConfig = await prisma.systemconfig.findUnique({
        where: { key: "oauthGithubClientId" },
      });

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientIdConfig?.value || "",
          client_secret: clientSecretConfig?.value || "",
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || "获取 GitHub Token 失败");
      }

      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "ZhiGe-Dockyard-App",
        },
      });

      githubUser = await userRes.json();

      // 如果未公开邮箱，进一步抓取主邮箱
      if (!githubUser.email) {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "ZhiGe-Dockyard-App",
          },
        });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          const primaryEmail = emails.find((e: any) => e.primary && e.verified);
          if (primaryEmail) {
            githubUser.email = primaryEmail.email;
          }
        }
      }
    }

    const openid = String(githubUser.id);

    // 1. 查找现有绑定账号
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { ssoProvider: "github", ssoOpenid: openid },
          ...(githubUser.email ? [{ email: githubUser.email }] : []),
        ],
      },
    });

    let isNewUser = false;

    // 2. 如果不存在，自动注册新用户
    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: githubUser.name || githubUser.login,
          email: githubUser.email || `gh_${openid}@zhige.local`,
          avatar: githubUser.avatar_url,
          ssoProvider: "github",
          ssoOpenid: openid,
          role: "user",
          status: "active",
          password: `oauth_github_nopwd_${crypto.randomBytes(8).toString("hex")}`,
        },
      });
    } else if (!user.ssoOpenid || user.ssoProvider !== "github") {
      // 绑定已存在的同名邮箱账号
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ssoProvider: "github",
          ssoOpenid: openid,
          ...(user.avatar ? {} : { avatar: githubUser.avatar_url }),
        },
      });
    }

    // 3. 检查是否有个人空间，无则自动初始化创建
    const workspaceMembers = await prisma.workspacemember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });

    const personalWorkspace = workspaceMembers.find(
      (member) => member.workspace.type === "PERSONAL"
    );

    let activeWorkspaceId = user.lastWorkspaceId;

    if (!personalWorkspace) {
      const workspaceName = `个人空间 - ${user.name || user.email || "开发者"}`;
      const newWorkspace = await prisma.workspace.create({
        data: {
          id: crypto.randomUUID(),
          name: workspaceName,
          type: "PERSONAL",
          ownerId: user.id,
          description: `${user.name || "开发者"}的个人研发空间`,
          updatedAt: new Date(),
        },
      });

      await prisma.workspacemember.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          workspaceId: newWorkspace.id,
          role: "OWNER",
        },
      });

      activeWorkspaceId = newWorkspace.id;
    } else if (!activeWorkspaceId) {
      activeWorkspaceId = personalWorkspace.workspaceId;
    }

    if (isNewUser) {
      await seedDefaultWelcomeNotifications(user.id).catch((e) => {
        console.error("[github-callback] 注入默认通知失败:", e);
      });
    }

    // 4. 更新登录时间与会话
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        sessionToken,
        sessionExpiresAt,
        sessionRememberMe: false, // OAuth 登录固定 24h，非记住我会话
        lastWorkspaceId: activeWorkspaceId,
      },
    });

    // 5. 记录审计日志（统一 action=auth:login，按登录来源区分 loginMethod，严禁写入会话令牌）
    try {
      const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "127.0.0.1";
      const userAgent = request.headers.get("user-agent") || "unknown";
      let deviceType: "web" | "mobile" | "tablet" = "web";
      let browser = "unknown";
      let os = "unknown";
      if (userAgent.includes("Mobile")) deviceType = "mobile";
      else if (userAgent.includes("Tablet")) deviceType = "tablet";
      if (userAgent.includes("Chrome")) browser = "Chrome";
      else if (userAgent.includes("Safari")) browser = "Safari";
      else if (userAgent.includes("Firefox")) browser = "Firefox";
      else if (userAgent.includes("Edge")) browser = "Edge";
      if (userAgent.includes("Windows")) os = "Windows";
      else if (userAgent.includes("Mac")) os = "Mac";
      else if (userAgent.includes("Linux")) os = "Linux";
      else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
      else if (userAgent.includes("Android")) os = "Android";
      const deviceName = `${browser} on ${os}`;

      await prisma.operationlog.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          action: "auth:login",
          resource: "auth/session",
          ipAddress: clientIP,
          details: {
            message: isNewUser ? "GitHub 第三方联合注册并登录成功" : "GitHub 第三方联合登录成功",
            loginMethod: isNewUser ? "oauth_register" : "oauth",
            provider: "GitHub",
            ipAddress: clientIP,
            deviceName,
            deviceType,
            browser,
            os,
          },
        },
      });

      // 记录登录历史（与密码登录同一数据源，供后台“登录安全历史”统一展示）
      await prisma.loginhistory.create({
        data: {
          id: `lh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user.id,
          loginAt: new Date(),
          ipAddress: clientIP,
          userAgent,
          device: deviceName,
        },
      });
    } catch (e) {
      // 审计日志非阻塞
    }

    // 6. 签发 JWT
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(getJwtSecretKey());

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      sessionToken,
    };

    const redirectUrl = new URL("/auth/oauth-callback", request.nextUrl.origin);
    redirectUrl.searchParams.set("token", token);
    redirectUrl.searchParams.set("user", encodeURIComponent(JSON.stringify(userData)));
    redirectUrl.searchParams.set("new", isNewUser ? "true" : "false");

    const response = NextResponse.redirect(redirectUrl.toString());
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("GitHub OAuth Callback 异常:", error);
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=github_callback_error&message=${encodeURIComponent(
          error.message || "未知错误"
        )}`,
        request.nextUrl.origin
      )
    );
  }
}
