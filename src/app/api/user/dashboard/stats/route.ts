import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// GET - 获取用户仪表板统计信息
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    // 获取工作空间数量
    const workspaceCount = await prisma.workspace.count({
      where: {
        OR: [
          { ownerId: userId },
          {
            workspacemember: {
              some: { userId },
            },
          },
        ],
      },
    });

    // 获取组件数量：合并用户各工作空间（个人空间 + 企业空间）已绑定的组件，
    // 按 componentId 去重只算一次。组件绑定关系记录在 componentusage 表，
    // 每个新工作空间由 workspaceInit 默认绑定 C01/C02/C07 三个组件。
    const userWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [{ ownerId: userId }, { workspacemember: { some: { userId } } }],
      },
      select: { id: true },
    });
    const workspaceIds = userWorkspaces.map((w) => w.id);
    const componentUsages = await prisma.componentusage.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { componentId: true },
      distinct: ["componentId"],
    });
    const componentCount = componentUsages.length;

    // 获取用户会员等级信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });

    let apiCallsLimit = 1000;
    let storageLimit = 1073741824; // 1GB

    if (user?.membershipLevel) {
      const membershipLevel = await prisma.membershiplevel.findUnique({
        where: { name: user.membershipLevel },
        select: {
          maxApiCalls: true,
          maxStorage: true,
        },
      });

      if (membershipLevel) {
        apiCallsLimit = Number(membershipLevel.maxApiCalls) || 1000;
        storageLimit = Number(membershipLevel.maxStorage) || 1073741824;
      }
    }

    // 获取用户个人空间算力点余额（支持免费/新用户自愈补齐 100 点）
    let tokenBalance = 100;
    try {
      const personalWs = await prisma.workspace.findFirst({
        where: { ownerId: userId, type: "PERSONAL" },
        include: { workspacequota: true },
      });
      if (personalWs) {
        if (personalWs.workspacequota && Number(personalWs.workspacequota.tokenBalance) > 0) {
          tokenBalance = Number(personalWs.workspacequota.tokenBalance);
        } else {
          // 自愈补齐 100 算力点
          tokenBalance = 100;
          if (personalWs.workspacequota) {
            prisma.workspacequota.update({
              where: { id: personalWs.workspacequota.id },
              data: { tokenBalance: BigInt(100), updatedAt: new Date() },
            }).catch(() => {});
          } else {
            prisma.workspacequota.create({
              data: {
                id: crypto.randomUUID(),
                workspaceId: personalWs.id,
                membershipLevelId: "FREE",
                tokenBalance: BigInt(100),
                updatedAt: new Date(),
              },
            }).catch(() => {});
          }
        }
      }
    } catch (quotaErr) {
      console.warn("[dashboard/stats] 查询/自愈算力配额非致命提示:", quotaErr);
    }

    // 获取已使用的 API 调用次数和存储空间
    // TODO: 实现具体的统计逻辑
    const apiCallsUsed = 0;
    const storageUsed = 0;

    return NextResponse.json({
      success: true,
      data: {
        workspaceCount,
        componentCount,
        tokenBalance,
        apiCallsUsed,
        apiCallsLimit,
        storageUsed,
        storageLimit,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    return NextResponse.json(
      { error: "获取统计信息失败" },
      { status: 500 }
    );
  }
}
