import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

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

    // 从数据库获取会员等级配额
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    const membershipLevel = dbUser?.membershipLevel || "FREE";

    const levelData = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel },
    });

    // 统计企业空间数量
    const enterpriseCount = workspaces.filter(ws => ws.type === "ENTERPRISE").length;

    // 算力配额计算 (从数据库中统计运行的组件任务)
    const usedTasksCount = await prisma.componenttask.count({
      where: { userId },
    });
    const usedTokens = usedTasksCount * 120; // 假设每次运行组件消耗平均120个Token

    const maxEnterpriseWorkspaces = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
    const maxTeamSize = levelData ? Number(levelData.maxTeamSize) : 5;
    const maxStorage = levelData ? Number(levelData.maxStorage) : 1073741824;
    const maxApiCalls = levelData ? Number(levelData.maxApiCalls) : 1000;
    const tokenLimit = levelData ? (membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000) : 10000;

    const availableEnterpriseSlots = maxEnterpriseWorkspaces === -1 
      ? -1 
      : maxEnterpriseWorkspaces - enterpriseCount;

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel,
        quotas: {
          enterpriseSlots: {
            total: maxEnterpriseWorkspaces,
            used: enterpriseCount,
            available: availableEnterpriseSlots,
          },
          maxTeamSize,
          maxStorage,
          maxApiCalls,
          tokenBalance: {
            total: tokenLimit,
            used: usedTokens,
            available: Math.max(0, tokenLimit - usedTokens),
          },
        },
        workspaces: await Promise.all(workspaces.map(async (ws) => {
          let wsQuota = ws.workspacequota;
          if (!wsQuota) {
            const tokenLimit = membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;
            let ml = await prisma.membershiplevel.findUnique({
              where: { id: membershipLevel }
            });
            if (!ml) {
              ml = await prisma.membershiplevel.findFirst();
            }
            const mlId = ml?.id || "FREE";
            
            try {
              wsQuota = await prisma.workspacequota.create({
                data: {
                  id: crypto.randomUUID(),
                  workspaceId: ws.id,
                  membershipLevelId: mlId,
                  tokenBalance: BigInt(tokenLimit),
                  updatedAt: new Date()
                }
              });
            } catch (e) {
              console.error("兜底创建配额记录失败:", e);
            }
          }

          return {
            id: ws.id,
            name: ws.name,
            type: ws.type,
            role: ws.workspacemember[0]?.role,
            quota: wsQuota ? {
              id: wsQuota.id,
              workspaceId: wsQuota.workspaceId,
              membershipLevelId: wsQuota.membershipLevelId,
              enterpriseSlots: Number(wsQuota.enterpriseSlots),
              usedSlots: Number(wsQuota.usedSlots),
              tokenBalance: Number(wsQuota.tokenBalance),
              storageUsed: Number(wsQuota.storageUsed),
              storageLimit: Number(wsQuota.storageLimit),
              apiCallsUsed: Number(wsQuota.apiCallsUsed),
              apiCallsLimit: Number(wsQuota.apiCallsLimit),
            } : null,
          };
        })),
      },
    });
  } catch (error) {
    console.error("Get quota error:", error);
    return NextResponse.json({ error: "获取配额信息失败", details: error instanceof Error ? error.message : error }, { status: 500 });
  }
}
