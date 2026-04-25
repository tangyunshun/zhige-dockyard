import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 检查 prisma 客户端是否可用
    if (!prisma) {
      console.error("Prisma client is not initialized");
      return NextResponse.json(
        { error: "数据库连接失败", details: "Prisma client is not initialized" },
        { status: 500 }
      );
    }

    // 获取用户的会员等级
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        membershipLevel: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 获取会员等级配置
    const membershipLevel = await prisma.membershipLevel.findUnique({
      where: { name: user.membershipLevel },
    });

    if (!membershipLevel) {
      return NextResponse.json({ error: "会员等级配置不存在" }, { status: 404 });
    }

    // 统计企业空间数量
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    // 统计用户已使用的组件数量（已上架的组件）
    const usedComponents = await prisma.componenttask.count({
      where: {
        userId: userId,
        isPublished: true,
      },
    });

    const maxEnterprise = Number(membershipLevel.maxEnterpriseWorkspaces);
    const enterpriseCount = enterpriseWorkspaces.length;
    
    return NextResponse.json({
      isMember: user.membershipLevel !== "FREE",
      membershipLevel: user.membershipLevel,
      membershipConfig: {
        name: membershipLevel.name,
        nameZh: membershipLevel.nameZh,
        icon: membershipLevel.icon,
        color: membershipLevel.color,
      },
      maxEnterprise,
      maxPersonalWorkspaces: Number(membershipLevel.maxPersonalWorkspaces),
      maxComponents: Number(membershipLevel.maxComponents),
      maxTeamSize: Number(membershipLevel.maxTeamSize),
      maxStorage: Number(membershipLevel.maxStorage),
      maxApiCalls: Number(membershipLevel.maxApiCalls),
      enterpriseCount,
      usedComponents,
      canCreateMore: enterpriseCount < maxEnterprise,
      remainingSlots: maxEnterprise - enterpriseCount,
    });
  } catch (error) {
    console.error("Get quota error:", error);
    return NextResponse.json(
      { error: "获取配额失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
