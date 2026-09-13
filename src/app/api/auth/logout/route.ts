import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // 多渠道提取 token：Authorization 头 -> 请求体 token -> cookie auth_token
    const authHeader = request.headers.get("authorization");
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const token = headerToken || body.token || request.cookies.get("auth_token")?.value;

    let userId: string | null = null;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = payload.userId as string;
      } catch (error) {
        console.error("Token 验证失败:", error);
      }
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || null;
    const isTimeout = body.reason === "timeout";

    // 清除用户会话信息，并清理该用户的活跃设备记录
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          sessionToken: null,
          sessionExpiresAt: null,
          lastLoginAt: null,
        },
      });

      // 清除该用户的活跃设备记录，防止后续同设备/新会话误判为“超出设备数限制被强制踢下线”
      await prisma.userdevice.deleteMany({
        where: { userId },
      });

      // 写入真实、明确的操作审计日志
      await prisma.operationlog.create({
        data: {
          id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
          userId,
          action: isTimeout ? "SESSION_TIMEOUT_LOGOUT" : "auth:logout",
          resource: "auth/session",
          ipAddress: clientIp,
          details: {
            type: isTimeout ? "TIMEOUT" : "MANUAL",
            message: isTimeout ? "长时间无操作，系统自动退出登录" : "用户主动退出登录",
            reason: body.reason || (isTimeout ? "timeout" : "user_logout"),
            userAgent,
          },
        },
      });

      console.log(`[用户下线] 用户 ${userId} 已安全下线（模式: ${isTimeout ? "超时自动退出" : "用户主动登出"}）`);
    }

    // 清除 auth_token cookie
    const response = NextResponse.json({
      success: true,
      message: "已安全下线",
    });

    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set("session_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set("refresh_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ message: "下线失败" }, { status: 500 });
  }
}
