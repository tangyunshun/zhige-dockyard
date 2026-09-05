import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembershipTokenLimit } from "@/lib/quota-token";
import { grantNewUserGift } from "@/lib/credit-service";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

interface QRSession {
  token: string;
  channel: string;
  status: "pending" | "scanned" | "confirmed" | "expired";
  createdAt: number;
  expireAt: number;
  authToken?: string;
  userData?: any;
}

// 内存安全存储扫码会话（5 分钟 TTL，多通道隔离）
const qrSessionCache = new Map<string, QRSession>();

// 清理过期会话
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of qrSessionCache.entries()) {
    if (now > session.expireAt) {
      qrSessionCache.delete(token);
    }
  }
}

/**
 * POST: 创建或刷新扫码登录会话
 */
export async function POST(request: NextRequest) {
  try {
    cleanupExpiredSessions();
    const body = await request.json().catch(() => ({}));
    const channel = body.channel || "wechat";
    const action = body.action || "create";

    // 1. 模拟扫码确认动作（用于本地沙箱调试与快速体验通道）
    if (action === "mock_confirm") {
      const qrToken = body.token;
      if (!qrToken || !qrSessionCache.has(qrToken)) {
        return NextResponse.json({ error: "扫码会话不存在或已过期" }, { status: 400 });
      }

      const session = qrSessionCache.get(qrToken)!;
      if (Date.now() > session.expireAt) {
        session.status = "expired";
        return NextResponse.json({ error: "二维码已过期，请刷新" }, { status: 400 });
      }

      // 查找或创建该渠道的真实测试用户
      const channelType = session.channel;
      const mockOpenId = `mock_${channelType}_${Date.now().toString(36)}`;
      const channelNameMap: Record<string, string> = {
        wechat: "微信用户",
        qq: "QQ用户",
        weibo: "微博用户",
        feishu: "飞书员工",
        dingtalk: "钉钉成员",
        alipay: "支付宝用户",
      };
      const baseName = channelNameMap[channelType] || "第三方用户";
      const mockName = `${baseName}_${Math.floor(1000 + Math.random() * 9000)}`;
      const mockAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${mockOpenId}`;

      let user = await prisma.user.findFirst({
        where: { ssoOpenid: mockOpenId },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: mockName,
            avatar: mockAvatar,
            role: "user",
            status: "active",
            ssoProvider: channelType,
            ssoOpenid: mockOpenId,
            password: `oauth_${channelType}_no_pwd_${Date.now()}`,
          },
        });

        // 确保拥有默认个人空间
        const defaultWsName = `个人空间 - ${mockName}`;
        const newWs = await prisma.workspace.create({
          data: {
            id: crypto.randomUUID(),
            name: defaultWsName,
            type: "PERSONAL",
            ownerId: user.id,
            description: `${mockName} 的个人空间`,
            updatedAt: new Date(),
          },
        });

        await prisma.workspacemember.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            workspaceId: newWs.id,
            role: "OWNER",
          },
        });

        // 真实赋予新注册/首次入驻用户 100 算力点免费组件体验额度
        const freeTokenLimit = await getMembershipTokenLimit("FREE");
        await prisma.workspacequota.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: newWs.id,
            membershipLevelId: "FREE",
            tokenBalance: freeTokenLimit,
            updatedAt: new Date(),
          },
        }).catch((e) => console.warn("[qrcode] 创建默认空间配额警告:", e));

        // 新用户赠送 100 算力点：写入个人空间专属分桶（3 个月有效）+ 入账流水（幂等）
        await grantNewUserGift({
          userId: user.id,
          workspaceId: newWs.id,
          workspaceName: newWs.name,
          userEmail: user.email || null,
        }).catch((e) => console.warn("[qrcode] 赠送新用户算力点非致命提示:", e));

        await prisma.user.update({
          where: { id: user.id },
          data: { lastWorkspaceId: newWs.id },
        });
      }

      // 签发会话与权威 JWT Token
      const sessionToken = crypto.randomUUID();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          sessionToken,
          sessionExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          lastLoginAt: new Date(),
        },
      });

      const authToken = await new SignJWT({
        userId: user.id,
        email: user.email || `${mockOpenId}@dockyard.zhige.com`,
        role: user.role,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(JWT_SECRET);

      const userData = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        sessionToken,
      };

      session.status = "confirmed";
      session.authToken = authToken;
      session.userData = userData;

      return NextResponse.json({
        success: true,
        message: "模拟手机确认授权成功",
        token: authToken,
        user: userData,
      });
    }

    // 2. 正常生成扫码登录会话
    const qrToken = `qr_${channel}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();
    const expireAt = now + 5 * 60 * 1000; // 5分钟有效期

    // 构建二维码承载数据：支持手机微信/第三方 App 扫码访问授权或内网联调
    const qrAuthDataUrl = `${request.nextUrl.origin}/api/auth/qrcode/scan?token=${qrToken}&channel=${channel}`;
    // 使用稳定可靠的在线 SVG/PNG 二维码生成 API
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
      qrAuthDataUrl
    )}`;

    qrSessionCache.set(qrToken, {
      token: qrToken,
      channel,
      status: "pending",
      createdAt: now,
      expireAt,
    });

    return NextResponse.json({
      success: true,
      qrToken,
      channel,
      expireSeconds: 300,
      qrImageUrl,
      qrAuthDataUrl,
    });
  } catch (error: any) {
    console.error("生成扫码登录会话失败:", error);
    return NextResponse.json(
      { error: "生成扫码会话失败，请稍后重试" },
      { status: 500 }
    );
  }
}

/**
 * GET: 轮询查询扫码状态
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token || !qrSessionCache.has(token)) {
      return NextResponse.json({ status: "expired", message: "扫码会话已过期或不存在" });
    }

    const session = qrSessionCache.get(token)!;
    if (Date.now() > session.expireAt) {
      session.status = "expired";
      return NextResponse.json({ status: "expired", message: "二维码已失效，请点击刷新" });
    }

    // 如果已确认，附带权威 token 与 user 返回，并清除已消费的会话
    if (session.status === "confirmed") {
      const response = NextResponse.json({
        status: "confirmed",
        token: session.authToken,
        user: session.userData,
      });

      // 顺带向响应中写入 HttpOnly Cookie 作为服务端双保险
      if (session.authToken) {
        response.cookies.set("auth_token", session.authToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
      }

      // 消费后延迟移除
      setTimeout(() => {
        qrSessionCache.delete(token);
      }, 5000);

      return response;
    }

    return NextResponse.json({
      status: session.status,
      remainingSeconds: Math.max(0, Math.round((session.expireAt - Date.now()) / 1000)),
    });
  } catch (error: any) {
    console.error("轮询扫码状态失败:", error);
    return NextResponse.json({ status: "error", error: "查询扫码状态异常" }, { status: 500 });
  }
}
