import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GitHub 授权登录发起端点
 * 流程：
 * 1. 从 systemconfig 表中查询 oauthGithubEnabled 与 oauthGithubClientId
 * 2. 若未开启，重定向至登录页并携带错误标识
 * 3. 若已开启且配置了 Client ID，重定向至 GitHub 官方 OAuth 授权页
 * 4. 若为测试模式或未配置外部凭证，安全进入开发沙箱模拟授权通道
 */
export async function GET(request: NextRequest) {
  try {
    const configs = await prisma.systemconfig.findMany({
      where: {
        key: { in: ["oauthGithubEnabled", "oauthGithubClientId"] },
      },
    });

    const configMap: Record<string, string> = {};
    configs.forEach((c) => {
      configMap[c.key] = c.value ?? "";
    });

    const enabled = configMap.oauthGithubEnabled === "true";
    if (!enabled) {
      return NextResponse.redirect(
        new URL("/auth/login?error=github_disabled", request.nextUrl.origin)
      );
    }

    const clientId = configMap.oauthGithubClientId?.trim();
    const isMockOrPlaceholder =
      !clientId ||
      clientId.includes("•••") ||
      clientId.startsWith("Ov23li•••") ||
      request.nextUrl.searchParams.get("test_mode") === "true";

    const callbackUrl = `${request.nextUrl.origin}/api/auth/github/callback`;

    // 本地开发环境或占位模式：跳转至沙箱回调
    if (isMockOrPlaceholder) {
      const testCallbackUrl = new URL("/api/auth/github/callback", request.nextUrl.origin);
      testCallbackUrl.searchParams.set("code", `mock_github_code_${Date.now()}`);
      testCallbackUrl.searchParams.set("test_mode", "true");
      return NextResponse.redirect(testCallbackUrl.toString());
    }

    // 生产/真实配置：跳转 GitHub 授权登录
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user,user:email`;

    return NextResponse.redirect(githubAuthUrl);
  } catch (error) {
    console.error("发起 GitHub 登录异常:", error);
    return NextResponse.redirect(
      new URL("/auth/login?error=github_login_failed", request.nextUrl.origin)
    );
  }
}
