import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { MEMBERSHIP_QUOTAS, MembershipLevel } from "@/constants/roles";

/**
 * 获取用户配额信息
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const user = authResult.user!;

    // 获取用户所有的工作空间
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            workspacemember: {
              some: {
                userId: userId,
              },
            },
          },
        ],
      },
      include: {
        workspacequota: true,
        workspacemember: {
          where: {
            userId: userId,
          },
          select: {
            role: true,
          },
        },
      },
    });

    // 获取会员等级配额
    const membershipLevel = user.membershipLevel as MembershipLevel;
    const quotas = MEMBERSHIP_QUOTAS[membershipLevel] || MEMBERSHIP_QUOTAS[MembershipLevel.FREE];

    // 统计企业空间数量
    const enterpriseCount = workspaces.filter(ws => ws.type === "ENTERPRISE").length;

    // 计算可用配额
    const availableEnterpriseSlots = quotas.enterpriseSlots === -1 
      ? -1 
      : quotas.enterpriseSlots - enterpriseCount;

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel,
        quotas: {
          enterpriseSlots: {
            total: quotas.enterpriseSlots,
            used: enterpriseCount,
            available: availableEnterpriseSlots,
          },
          maxTeamSize: quotas.maxTeamSize,
          maxStorage: quotas.maxStorage,
          maxApiCalls: quotas.maxApiCalls,
          tokenBalance: quotas.tokenBalance,
        },
        workspaces: workspaces.map(ws => ({
          id: ws.id,
          name: ws.name,
          type: ws.type,
          role: ws.workspacemember[0]?.role,
          quota: ws.workspacequota,
        })),
      },
    });
  } catch (error) {
    console.error("Get quota error:", error);
    return NextResponse.json({ error: "获取配额信息失败" }, { status: 500 });
  }
}
