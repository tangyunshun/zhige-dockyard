import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户 ID
    const token = request.cookies.get("auth_token")?.value;
    let userId: string | null = null;

    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = payload.userId as string;
      } catch (error) {
        console.error("Token 验证失败:", error);
      }
    }

    // 如果用户已登录，清除数据库中的会话信息
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          sessionToken: null,
          sessionExpiresAt: null,
          lastLoginAt: null, // 清除活跃时间
        },
      });
      console.log(`[退出登录] 用户 ${userId} 已清除会话信息`);
    }

    // 清除 auth_token cookie
    const response = NextResponse.json({
      success: true,
      message: "已退出登录",
    });

    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ message: "退出登录失败" }, { status: 500 });
  }
}
