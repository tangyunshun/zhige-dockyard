import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    // 如果 prisma 客户端不可用
    if (!prisma) {
      console.error("Prisma client is not initialized");
      return NextResponse.json(
        { error: "数据库连接失败", details: "Prisma client is not initialized" },
        { status: 500 }
      );
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        membershipLevel: true,
      },
    });

    console.log("用户信息:", user);

    if (!user) {
      console.error("用户不存在，userId:", userId);
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 获取会员等级配额
    const membershipLevel = await prisma.membershiplevel.findUnique({
      where: { name: user.membershipLevel },
    });

    console.log("会员等级信息:", membershipLevel, "查询的 name:", user.membershipLevel);

    if (!membershipLevel) {
      console.error("会员等级不存在，查询的 name:", user.membershipLevel);
      return NextResponse.json({ error: "会员等级不存在" }, { status: 404 });
    }

    // 统计用户的企业空间数量
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    const usedEnterpriseSlots = enterpriseWorkspaces.length;
    const availableEnterpriseSlots = Number(membershipLevel.maxEnterpriseWorkspaces) - usedEnterpriseSlots;

    // 统计用户使用的组件数量
    const componentCount = await prisma.componenttask.count({
      where: {
        userId,
      },
    });

    const availableComponents = Number(membershipLevel.maxComponents) - componentCount;

    // TODO: 存储统计需要 storageUsed 字段，暂时设置为 0
    const storageUsedMB = 0;
    const availableStorageMB = Number(membershipLevel.maxStorage) - storageUsedMB;

    // 统计 API 调用次数（过去 30 天）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const apiCallsUsed = await prisma.apiusage.count({
      where: {
        userId,
        timestamp: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const availableApiCalls = Number(membershipLevel.maxApiCalls) - apiCallsUsed;

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel: user.membershipLevel,
        quotas: {
          enterpriseSlots: {
            total: Number(membershipLevel.maxEnterpriseWorkspaces),
            used: usedEnterpriseSlots,
            available: Number(membershipLevel.maxEnterpriseWorkspaces) - usedEnterpriseSlots,
          },
          components: {
            total: Number(membershipLevel.maxComponents),
            used: componentCount,
            available: Number(membershipLevel.maxComponents) - componentCount,
          },
          storage: {
            total: Number(membershipLevel.maxStorage),
            used: storageUsedMB,
            available: Number(membershipLevel.maxStorage) - storageUsedMB,
          },
          apiCalls: {
            total: Number(membershipLevel.maxApiCalls),
            used: apiCallsUsed,
            available: Number(membershipLevel.maxApiCalls) - apiCallsUsed,
          },
        },
      },
    });
  } catch (error) {
    console.warn("Get quota error:", error);
    console.warn("Get quota error - message:", error instanceof Error ? error.message : "unknown");
    console.warn("Get quota error - stack:", error instanceof Error ? error.stack : "no stack");
    return NextResponse.json({ error: "获取配额信息失败" }, { status: 500 });
  }
}
