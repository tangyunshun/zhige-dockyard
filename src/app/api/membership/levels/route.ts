import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/membership/levels
 * 获取所有启用的会员等级配置（公开接口）
 */
export async function GET(request: NextRequest) {
  try {
    // 获取所有启用的会员等级
    const levels = await prisma.membershipLevel.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: levels,
    });
  } catch (error) {
    console.error("Get membership levels error:", error);
    return NextResponse.json(
      { message: "获取会员等级失败" },
      { status: 500 }
    );
  }
}
