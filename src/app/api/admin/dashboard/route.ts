import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 检查是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    // 并行获取所有统计数据 - 每个指标都有真实业务意义
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
      // 1. 总用户数：平台累计注册用户总量
      prisma.user.count(),

      // 2. 总工作空间数：平台创建的工作空间总量（包含个人和企业空间）
      prisma.workspace.count(),

      // 3. 组件总数：平台创建的所有组件/任务数量（核心生产力指标）
      prisma.componenttask.count(),

      // 4. 已上架组件数：已发布可用的组件数量（反映平台内容生态）
      prisma.componenttask.count({
        where: { isPublished: true },
      }),

      // 5. 活跃工作空间数：最近 7 天有更新的工作空间（反映真实使用情况）
      // 注意：lastActiveAt 字段添加后优先使用，否则使用 updatedAt
      prisma.workspace.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          status: "ACTIVE",
        },
      }),

      // 6. 企业空间数：已升级的企业空间数量（反映高价值用户）
      prisma.workspace.count({
        where: { type: "ENTERPRISE" },
      }),

      // 7. 总租户数：平台租户总数（多租户管理指标）
      prisma.tenant.count(),

      // 8. 活跃租户数：状态为 active 的租户数
      prisma.tenant.count({
        where: { status: "active" },
      }),

      // 9. 待审核升级申请：等待审核的企业空间申请数量（需要管理员处理）
      prisma.upgradeApplication.count({
        where: { status: "PENDING" },
      }),

      // 10. 最近注册用户：最新注册的 5 个用户（用于监控用户增长）
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

      // 11. 最近工作空间：最新创建的 5 个工作空间（监控平台活跃度）
      prisma.workspace.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          members: {
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

      // 12. 组件分类统计：按类型统计组件分布（了解内容结构）
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

      // 13. 活跃 API Key 数量：最近 7 天使用过的 API Key（反映开发者活跃度）
      prisma.apiKey.count({
        where: {
          lastUsedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // 14. 系统服务状态检查（模拟，实际应该检查各个服务的健康状态）
      Promise.resolve({
        database: "normal", // 数据库连接正常
        api: "normal", // API 服务正常
        storage: "normal", // 存储服务正常
        email: "normal", // 邮件服务正常
      }),
    ]);

    // 计算平台健康度：基于多个维度的综合评分
    // 计算公式：基础分 100 - 待审核申请扣分 - 异常比例扣分 - 服务异常扣分
    const baseHealth = 100;
    const pendingPenalty = Math.min(upgradeApplications * 2, 20); // 每个待审核扣 2 分，最多扣 20 分
    const inactiveRate =
      totalTenants > 0 ? (totalTenants - activeTenants) / totalTenants : 0;
    const inactivePenalty = Math.floor(inactiveRate * 10); // 不活跃租户比例扣分

    // 检查系统服务状态，如果有异常则扣分
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
        // 核心统计指标
        totalUsers, // 总用户数
        totalWorkspaces, // 总工作空间数
        totalComponents, // 组件总数
        publishedComponents, // 已上架组件数
        activeWorkspaces, // 活跃工作空间数（最近 7 天）
        enterpriseWorkspaces, // 企业空间数
        totalTenants, // 总租户数
        activeTenants, // 活跃租户数
        pendingReviews: upgradeApplications, // 待审核申请数

        // 平台健康度（0-100）
        systemHealth,

        // 系统服务状态（与系统健康度关联）
        systemServices: {
          database: systemServices.database,
          api: systemServices.api,
          storage: systemServices.storage,
          email: systemServices.email,
        },

        // 24h 用户活跃行为（修正：统计用户登录和使用组件的行为，而不是创建组件）
        // 由于用户不能创建组件，这里统计最近 24 小时的登录次数（通过 LoginHistory）
        systemLogs: await prisma.loginHistory.count({
          where: {
            loginAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),

        // 最近动态
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
          members: ws.members.map((m: any) => ({
            user: m.user,
          })),
        })),

        // 组件分类分布（前 5 类）
        componentCategories: componentCategories.map((c: any) => ({
          type: c.type,
          count: c._count,
        })),
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return NextResponse.json({ error: "获取统计数据失败" }, { status: 500 });
  }
}
