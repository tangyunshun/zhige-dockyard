import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/membership/levels
 * 获取所有会员等级信息
 */
export async function GET(request: NextRequest) {
  try {
    // 获取所有会员等级
    const levels = await prisma.membershiplevel.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    // 组件目录真实统计（供定价页展示，杜绝前端硬编码组件数量）
    // - total:     已上架组件总数
    // - premium:   高级付费组件数（isPremium）
    // - free:      免费版可装配的默认组件数（isDefault，新空间默认装配套件）
    const [totalComponents, premiumComponents, freeComponents] = await Promise.all([
      prisma.componentcatalog.count({ where: { isPublished: true } }),
      prisma.componentcatalog.count({ where: { isPublished: true, isPremium: true } }),
      prisma.componentcatalog.count({ where: { isPublished: true, isDefault: true } }),
    ]);

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevels = levels.map((level) => ({
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces),
      maxComponents: Number(level.maxComponents),
      maxTeamSize: Number(level.maxTeamSize),
      maxStorage: Number(level.maxStorage),
      maxApiCalls: Number(level.maxApiCalls),
      tokenLimit: Number(level.tokenLimit),
      priceMonthly: Number(level.priceMonthly),
      priceYearly: Number(level.priceYearly),
      trialDays: Number(level.trialDays),
      sortOrder: Number(level.sortOrder),
    }));

    return NextResponse.json({
      success: true,
      data: serializedLevels,
      stats: {
        totalComponents,
        premiumComponents,
        freeComponents,
      },
    });
  } catch (error) {
    console.error("Get membership levels error:", error);
    return NextResponse.json(
      { message: "获取会员等级失败" },
      { status: 500 }
    );
  }
}
