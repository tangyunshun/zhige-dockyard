import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - 获取用户活动记录
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 获取用户登录历史
    const loginHistory = await prisma.loginhistory.findMany({
      where: { userId },
      orderBy: { loginAt: "desc" },
      take: limit,
    });

    // 转换为活动记录格式
    const activities = loginHistory.map((record) => ({
      id: record.id,
      type: "login",
      description: "用户登录",
      createdAt: record.loginAt,
    }));

    return NextResponse.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "获取活动记录失败" },
      { status: 500 }
    );
  }
}
