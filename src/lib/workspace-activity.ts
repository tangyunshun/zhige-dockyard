import prisma from "./prisma";

/**
 * 更新工作空间的最后活跃时间
 * 
 * 调用场景：
 * - 用户登录工作空间
 * - 用户在工作空间内执行任何操作（添加成员、修改配置、使用组件等）
 * - 工作空间有任何状态变更
 * 
 * @param workspaceId 工作空间 ID
 */
export async function updateWorkspaceActivity(workspaceId: string) {
  try {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        lastActiveAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Update workspace activity error:", error);
  }
}

/**
 * 检查工作空间是否已被归档
 * 
 * @param workspaceId 工作空间 ID
 * @returns { isArchived: boolean, workspace?: Workspace }
 */
export async function checkWorkspaceArchived(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      lastActiveAt: true,
      updatedAt: true,
    },
  });

  if (!workspace) {
    return { isArchived: false, notFound: true };
  }

  const isArchived = workspace.status === "ARCHIVED";
  
  if (isArchived) {
    return {
      isArchived: true,
      workspace,
      reason: "该工作空间已超过 2 年无任何操作，被系统自动归档",
      lastActiveDate: workspace.lastActiveAt || workspace.updatedAt,
    };
  }

  return { isArchived: false, workspace };
}

/**
 * 恢复被归档的工作空间
 * 
 * @param workspaceId 工作空间 ID
 * @param userId 操作用户 ID（管理员）
 */
export async function restoreWorkspace(workspaceId: string, userId: string) {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return { success: false, error: "工作空间不存在" };
    }

    if (workspace.status !== "ARCHIVED") {
      return { success: false, error: "该工作空间未被归档，无需恢复" };
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: "ACTIVE",
        lastActiveAt: new Date(),
      },
    });

    return { success: true, message: "工作空间已恢复" };
  } catch (error) {
    console.error("Restore workspace error:", error);
    return { success: false, error: "恢复工作空间失败" };
  }
}

/**
 * 获取工作空间活跃度统计
 * 
 * @returns 活跃度统计数据
 */
export async function getWorkspaceActivityStats() {
  const now = new Date();
  
  // 计算各个时间节点
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);

  // 并行查询各个时间段的活跃工作空间数
  const [
    totalWorkspaces,
    activeIn24h,
    activeIn7d,
    activeIn30d,
    activeIn2y,
    archived,
  ] = await Promise.all([
    // 总工作空间数
    prisma.workspace.count(),
    
    // 24 小时内活跃
    prisma.workspace.count({
      where: {
        lastActiveAt: { gte: twentyFourHoursAgo },
        status: "ACTIVE",
      },
    }),
    
    // 7 天内活跃
    prisma.workspace.count({
      where: {
        lastActiveAt: { gte: sevenDaysAgo },
        status: "ACTIVE",
      },
    }),
    
    // 30 天内活跃
    prisma.workspace.count({
      where: {
        lastActiveAt: { gte: thirtyDaysAgo },
        status: "ACTIVE",
      },
    }),
    
    // 2 年内活跃（即将被归档的预警）
    prisma.workspace.count({
      where: {
        OR: [
          { lastActiveAt: { gte: twoYearsAgo } },
          { 
            lastActiveAt: null,
            updatedAt: { gte: twoYearsAgo }
          },
        ],
        status: "ACTIVE",
      },
    }),
    
    // 已归档的工作空间数
    prisma.workspace.count({
      where: {
        status: "ARCHIVED",
      },
    }),
  ]);

  return {
    total: totalWorkspaces,
    activeIn24h,
    activeIn7d,
    activeIn30d,
    activeIn2y,
    archived,
    atRiskOfArchival: totalWorkspaces - activeIn2y, // 2 年内无活跃，有被归档风险
  };
}
