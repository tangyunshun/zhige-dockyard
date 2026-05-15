import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    console.log("[Admin Dashboard] Auth header:", authHeader ? "存在" : "不存在");
    console.log("[Admin Dashboard] Auth header value:", authHeader);
    
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      console.log("[Admin Dashboard] 验证失败:", authResult.error);
      console.error("[Admin Dashboard] 验证失败详情:", JSON.stringify(authResult));
      return NextResponse.json({ error: authResult.error, debug: "验证失败" }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const userRole = authResult.user!.role;
    const userName = authResult.user!.name;
    
    console.log("[Admin Dashboard] 用户 ID:", userId);
    console.log("[Admin Dashboard] 用户角色:", userRole);
    console.log("[Admin Dashboard] 用户名称:", userName);
    console.log("[Admin Dashboard] 完整用户信息:", JSON.stringify(authResult.user));

    // 如果是管理员
    if (!isAdmin(authResult.user!)) {
      console.log("[Admin Dashboard] 权限不足，当前角色:", userRole);
      console.error("[Admin Dashboard] 权限检查失败，角色不是管理员:", userRole);
      return NextResponse.json({ 
        error: "权限不足", 
        debug: "角色不是管理员",
        currentRole: userRole,
        userId: userId
      }, { status: 403 });
    }
    
    console.log("[Admin Dashboard] 验证通过，开始加载数据...");

    // 获取系统统计数据 - 包括所有关键指标
    const [
      totalUsers,
      totalWorkspaces,
      totalComponents,
      publishedComponents,
      activeWorkspaces,
      enterpriseWorkspaces,
      totalTenants,
      activeTenants,
      upgradeApplications,
      recentUsers,
      recentWorkspaces,
      componentCategories,
      activeApiKeys,
      systemServices,
    ] = await Promise.all([
      // 1. 用户总数
      prisma.user.count(),

      // 2. 工作空间总数
      prisma.workspace.count(),

      // 3. 组件总数
      prisma.componenttask.count(),

      // 4. 已发布组件数
      prisma.componenttask.count({
        where: { isPublished: true },
      }),

      // 5. 活跃工作空间数 - 过去 7 天内有更新的工作空间
      prisma.workspace.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          status: "ACTIVE",
        },
      }),

      // 6. 企业空间数
      prisma.workspace.count({
        where: { type: "ENTERPRISE" },
      }),

      // 7. 租户总数
      prisma.tenant.count(),

      // 8. 活跃租户数
      prisma.tenant.count({
        where: { status: "active" },
      }),

      // 9. 待审核升级申请数
      prisma.upgradeapplication.count({
        where: { status: "PENDING" },
      }),

      // 10. 最近 5 个用户
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          membershipLevel: true,
          createdAt: true,
        },
      }),

      // 11. 最近 5 个工作空间
      prisma.workspace.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          workspacemember: {
            take: 3,
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),

      // 12. 组件分类统计
      prisma.componenttask.groupBy({
        by: ["type"],
        _count: true,
        orderBy: {
          _count: {
            type: "desc",
          },
        },
        take: 5,
      }),

      // 13. 活跃 API Key 数 - 过去 7 天内使用过的 API Key
      prisma.apikey.count({
        where: {
          lastUsedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // 14. 系统服务状态
      Promise.resolve({
        database: "normal", // 数据库状态
        api: "normal", // API 服务状态
        storage: "normal", // 存储服务状态
        email: "normal", // 邮件服务状态
      }),
    ]);

    // 计算系统健康分数 - 基于多个因素
    // 基础分数 100 - 待审核数量 * 2 - 不活跃租户比例 * 10 - 服务异常数 * 10
    const baseHealth = 100;
    const pendingPenalty = Math.min(upgradeApplications * 2, 20); // 待审核数量每个扣 2 分，最多扣 20 分
    const inactiveRate =
      totalTenants > 0 ? (totalTenants - activeTenants) / totalTenants : 0;
    const inactivePenalty = Math.floor(inactiveRate * 10); // 不活跃租户比例扣 10 分

    // 服务状态异常扣分
    const servicePenalty =
      Object.values(systemServices).filter((status) => status !== "normal")
        .length * 10;

    const systemHealth = Math.max(
      baseHealth - pendingPenalty - inactivePenalty - servicePenalty,
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        // 统计数据
        totalUsers, // 用户总数
        totalWorkspaces, // 工作空间总数
        totalComponents, // 组件总数
        publishedComponents, // 已发布组件数
        activeWorkspaces, // 活跃工作空间数 (7 天内有更新)
        enterpriseWorkspaces, // 企业空间数
        totalTenants, // 租户总数
        activeTenants, // 活跃租户数
        pendingReviews: upgradeApplications, // 待审核升级申请数

        // 系统健康分数 (0-100)
        systemHealth,

        // 系统服务状态
        systemServices: {
          database: systemServices.database,
          api: systemServices.api,
          storage: systemServices.storage,
          email: systemServices.email,
        },

        // 24h 系统日志数 - 过去 24 小时内的登录记录数
        systemLogs: await prisma.loginhistory.count({
          where: {
            loginAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),

        // 最近用户
        recentUsers: recentUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          membershipLevel: u.membershipLevel,
          createdAt: u.createdAt,
        })),

        recentWorkspaces: recentWorkspaces.map((ws: any) => ({
          id: ws.id,
          name: ws.name,
          type: ws.type,
          createdAt: ws.createdAt,
          members: ws.workspacemember.map((m: any) => ({
            user: m.user,
          })),
        })),

        // 组件分类统计 Top 5
        componentCategories: componentCategories.map((c: any) => ({
          type: c.type,
          count: c._count,
        })),
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return NextResponse.json({ error: "获取管理面板数据失败" }, { status: 500 });
  }
}
