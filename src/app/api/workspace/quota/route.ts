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

    // 解析 URL 参数中的 workspaceId
    const url = new URL(request.url);
    const workspaceIdParam = url.searchParams.get("workspaceId");

    let workspaceQuotaRecord: any = null;
    if (workspaceIdParam) {
      workspaceQuotaRecord = await prisma.workspacequota.findUnique({
        where: { workspaceId: workspaceIdParam },
      }).catch(() => null);
    } else {
      // 若未传 workspaceId，获取用户拥有的首个工作空间的配额
      const firstWs = await prisma.workspace.findFirst({
        where: { ownerId: userId },
      }).catch(() => null);
      if (firstWs) {
        workspaceQuotaRecord = await prisma.workspacequota.findUnique({
          where: { workspaceId: firstWs.id },
        }).catch(() => null);
      }
    }

    // 无配额记录时一律按实际余额 0 展示，不回退显示会员 tokenLimit（免费额度只来自注册福利或充值/购买）
    let currentTokenBalance = workspaceQuotaRecord
      ? Number(workspaceQuotaRecord.tokenBalance)
      : 0;

    // 自愈仅做结构性修复：FREE 用户缺配额记录时补建 0 额度配额，不再赠送/补偿任何免费算力
    if (!workspaceQuotaRecord && (user.membershipLevel || "FREE") === "FREE" && workspaceIdParam) {
      try {
        workspaceQuotaRecord = await prisma.workspacequota.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: workspaceIdParam,
            membershipLevelId: "FREE",
            tokenBalance: BigInt(0),
            updatedAt: new Date(),
          },
        });
      } catch (e) {
        console.warn("[/api/workspace/quota] 补创建配额记录非致命提示:", e);
      }
    }

    // 累计历史算力消耗（真实统计）：各组件使用次数 × 组件目录 estimatedModelTokens 基准
    const usageTokenBase = await prisma.componentcatalog.findMany({
      select: { id: true, estimatedModelTokens: true },
    });
    const usageTokenMap = new Map(usageTokenBase.map((c) => [c.id, Number(c.estimatedModelTokens)]));
    const usageRows = await prisma.componentusage.findMany({
      where: workspaceIdParam ? { workspaceId: workspaceIdParam } : { userId },
      select: { componentId: true },
    });
    const totalUsedTokens = usageRows.reduce(
      (sum, r) => sum + (usageTokenMap.get(r.componentId) ?? 0),
      0
    );

    // 历史遗留字段：resetAt 来自旧「月度自动补额」模型，新代码不再据此向用户展示“重置日”
    const resetAt = workspaceQuotaRecord?.resetAt
      ? workspaceQuotaRecord.resetAt.toISOString()
      : null;
    // 从数据库动态统计全系统已发布的通用组件总数
    const totalPublishedComponents = await prisma.componentcatalog.count({
      where: { isPublished: true },
    }).catch(() => 0);
    const tokenLimit = Number(membershipLevel?.tokenLimit ?? 10000);
    // 会员等级展示名（用于前端「当前订阅方案」等文案，缺省回退为等级 ID）
    const membershipLevelName = membershipLevel?.nameZh || user.membershipLevel;

    return NextResponse.json({
      success: true,
      tokenBalance: currentTokenBalance,
      tokenLimit,
      totalPublishedComponents,
      membershipLevel: user.membershipLevel,
      membershipLevelName,
      totalUsedTokens,
      resetAt,
      quota: workspaceQuotaRecord ? {
        workspaceId: workspaceQuotaRecord.workspaceId,
        tokenBalance: Number(workspaceQuotaRecord.tokenBalance),
        resetAt,
      } : { tokenBalance: currentTokenBalance, resetAt },
      data: {
        membershipLevel: user.membershipLevel,
        membershipLevelName,
        tokenBalance: currentTokenBalance,
        tokenLimit,
        totalPublishedComponents,
        totalUsedTokens,
        resetAt,
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
