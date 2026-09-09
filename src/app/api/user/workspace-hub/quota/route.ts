import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

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

    // Token 消耗真实统计：组件使用次数 × 组件目录 estimatedModelTokens 基准
    const usageRows = await prisma.componentusage.findMany({
      where: { userId },
      select: { componentId: true },
    });
    const tokenBase = await prisma.componentcatalog.findMany({
      select: { id: true, estimatedModelTokens: true },
    });
    const tokenBaseMap = new Map(tokenBase.map((c) => [c.id, Number(c.estimatedModelTokens)]));
    const usedTokens = usageRows.reduce((sum, r) => sum + (tokenBaseMap.get(r.componentId) ?? 0), 0);

    // 配额一律从 membershiplevel 表读取（不再硬编码）
    const maxEnterpriseWorkspaces = levelData ? Number(levelData.maxEnterpriseWorkspaces) : 1;
    const maxTeamSize = levelData ? Number(levelData.maxTeamSize) : 5;
    const maxStorage = levelData ? Number(levelData.maxStorage) : 1073741824;
    const maxApiCalls = levelData ? Number(levelData.maxApiCalls) : 1000;

    // 余额制口径：算力即各空间实际余额（充值/购买/注册福利到账），不再以会员 tokenLimit 作为“每月配额”
    const availableBalance = workspaces.reduce(
      (sum, ws) => sum + Number(ws.workspacequota?.tokenBalance ?? 0),
      0
    );

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
            total: availableBalance + usedTokens,
            used: usedTokens,
            available: availableBalance,
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
              // 结构性自愈：仅补建 0 额度配额记录，不赠送算力（免费额度只来自注册福利或充值）
              wsQuota = await prisma.workspacequota.create({
                data: {
                  id: crypto.randomUUID(),
                  workspaceId: ws.id,
                  membershipLevelId: mlId,
                  tokenBalance: BigInt(0),
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
