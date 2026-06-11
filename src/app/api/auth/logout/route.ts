﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    // 获取用户 ID
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

    // 清除用户会话信息
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          sessionToken: null,
          sessionExpiresAt: null,
          lastLoginAt: null, // 清除会话
        },
      });
      console.log(`[用户下线] 用户 ${userId} 会话已清除`);
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
