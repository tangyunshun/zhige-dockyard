﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/membership/levels
 * 获取所有会员等级信息
 */
export async function GET(request: NextRequest) {
  try {
    // 获取所有会员等级
    const levels = await prisma.membershipLevel.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevels = levels.map((level) => ({
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces),
      maxComponents: Number(level.maxComponents),
      maxTeamSize: Number(level.maxTeamSize),
      maxStorage: Number(level.maxStorage),
      maxApiCalls: Number(level.maxApiCalls),
      priceMonthly: Number(level.priceMonthly),
      priceYearly: Number(level.priceYearly),
      trialDays: Number(level.trialDays),
      sortOrder: Number(level.sortOrder),
    }));

    return NextResponse.json({
      success: true,
      data: serializedLevels,
    });
  } catch (error) {
    console.error("Get membership levels error:", error);
    return NextResponse.json(
      { message: "获取会员等级失败" },
      { status: 500 }
    );
  }
}
