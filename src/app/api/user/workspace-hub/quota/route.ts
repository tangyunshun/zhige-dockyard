import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getMembershipTokenLimit } from "@/lib/quota-token";

/**
 * 获取用户配额信息
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

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

    // Token 消耗真实统计：组件使用次数 × 组件目录 estimatedTokens 基准
    const usageRows = await prisma.componentusage.findMany({
      where: { userId },
      select: { componentId: true },
    });
    const tokenBase = await prisma.componentcatalog.findMany({
      select: { id: true, estimatedTokens: true },
    });
    const tokenBaseMap = new Map(tokenBase.map((c) => [c.id, Number(c.estimatedTokens)]));
    const usedTokens = usageRows.reduce((sum, r) => sum + (tokenBaseMap.get(r.componentId) ?? 0), 0);

    // 配额一律从 membershiplevel 表读取（不再硬编码）
    const maxEnterpriseWorkspaces = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
    const maxTeamSize = levelData ? Number(levelData.maxTeamSize) : 5;
    const maxStorage = levelData ? Number(levelData.maxStorage) : 1073741824;
    const maxApiCalls = levelData ? Number(levelData.maxApiCalls) : 1000;
    const tokenLimit = levelData ? Number(levelData.tokenLimit) : Number(await getMembershipTokenLimit(membershipLevel));

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
