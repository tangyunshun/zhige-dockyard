import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/membership/quota
 * 查询当前用户的会员配额信息
 */
export async function GET(request: NextRequest) {
  try {
    // 验证用户登录
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    const userId = authResult.user!.id;

    // 获取用户的会员等级
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        membershipLevel: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 }
      );
    }

    // 获取会员等级配置
    const membershipLevel = await prisma.membershipLevel.findUnique({
      where: { name: user.membershipLevel },
    });

    if (!membershipLevel) {
      return NextResponse.json(
        { message: "会员等级配置不存在" },
        { status: 404 }
      );
    }

    // 统计用户的企业空间数量
    const enterpriseWorkspacesCount = await prisma.workspace.count({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    // 统计用户的个人空间数量
    const personalWorkspacesCount = await prisma.workspace.count({
      where: {
        ownerId: userId,
        type: "PERSONAL",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel: user.membershipLevel,
        membershipConfig: {
          name: membershipLevel.name,
          nameZh: membershipLevel.nameZh,
          icon: membershipLevel.icon,
          color: membershipLevel.color,
          maxPersonalWorkspaces: Number(membershipLevel.maxPersonalWorkspaces),
          maxEnterpriseWorkspaces: Number(membershipLevel.maxEnterpriseWorkspaces),
          maxComponents: Number(membershipLevel.maxComponents),
          maxTeamSize: Number(membershipLevel.maxTeamSize),
          maxStorage: Number(membershipLevel.maxStorage),
          maxApiCalls: Number(membershipLevel.maxApiCalls),
          features: membershipLevel.features as string[],
          priceMonthly: membershipLevel.priceMonthly,
          priceYearly: membershipLevel.priceYearly,
          trialDays: membershipLevel.trialDays,
        },
        usage: {
          personalWorkspaces: personalWorkspacesCount,
          enterpriseWorkspaces: enterpriseWorkspacesCount,
        },
        isMember: user.membershipLevel !== "FREE",
      },
    });
  } catch (error) {
    console.error("Get membership quota error:", error);
    return NextResponse.json(
      { message: "获取配额失败" },
      { status: 500 }
    );
  }
}
