import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/debug/users
 * 调试用：查看所有用户及其角色
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 获取所有用户
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        membershipLevel: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        users,
        currentUser: authResult.user,
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { message: "获取用户列表失败" },
      { status: 500 }
    );
  }
}
