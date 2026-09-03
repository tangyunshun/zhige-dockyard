import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error, debug: "验证失败" }, { status: 401 });
    }

    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ 
        error: "权限不足", 
        debug: "角色不是管理员"
      }, { status: 403 });
    }

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
      componentTaskByType,
      activeApiKeys,
      systemServices,
    ] = await Promise.all([
      // 1. 用户总数
      prisma.user.count(),

      // 2. 工作空间总数
      prisma.workspace.count(),

      // 3. 组件总数（组件目录）
      prisma.componentcatalog.count(),

      // 4. 已发布组件数
      prisma.componentcatalog.count({
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

      // 10. 最近 5 个用户（包含 avatar）
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
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
                  avatar: true,
                },
              },
            },
          },
        },
      }),

      // 12. 组件分类统计（按 componentcategory 聚合：先按 task.type = componentcatalog.id 映射到分类，再汇总）
      prisma.componenttask.groupBy({
        by: ["type"],
        _count: true,
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
        database: "normal",
        api: "normal",
        storage: "normal",
        email: "normal",
      }),
    ]);

    // ===== 把 componenttask.type 聚合成 componentcategory（按分类维度展示） =====
    // 兼容两种数据形态：
    //   1) type = componentcatalog.id（绝大多数），通过 catalog.category 找到分类 key
    //   2) type = componentcategory.key（少量历史脏数据），直接当作分类 key
    const typeRows = (componentTaskByType as Array<{ type: string; _count: number }>) || [];
    const allTypes = typeRows.map((r) => r.type);

    // 一次性把所有 componentcatalog 与 componentcategory 拿出来，避免 N+1
    const [catalogs, allCategories] = await Promise.all([
      allTypes.length > 0
        ? prisma.componentcatalog.findMany({
            where: { id: { in: allTypes } },
            select: { id: true, category: true },
          })
        : Promise.resolve([] as Array<{ id: string; category: string }>),
      prisma.componentcategory.findMany({
        select: { key: true, name: true, color: true },
      }),
    ]);
    const typeToCategory = new Map<string, string>();
    for (const c of catalogs) typeToCategory.set(c.id, c.category);
    const validCategoryKeySet = new Set(allCategories.map((c) => c.key));
    const categoryMetaMap = new Map(allCategories.map((c) => [c.key, c]));

    const categoryCountMap = new Map<string, number>();
    for (const row of typeRows) {
      const categoryKey =
        typeToCategory.get(row.type) ||
        (validCategoryKeySet.has(row.type) ? row.type : "UNCLASSIFIED");
      categoryCountMap.set(
        categoryKey,
        (categoryCountMap.get(categoryKey) || 0) + row._count,
      );
    }

    const aggregatedCategoryKeys = Array.from(categoryCountMap.keys());

    const componentCategories = aggregatedCategoryKeys
      .map((key) => {
        const meta = categoryMetaMap.get(key);
        return {
          key,
          name: meta?.name || key,
          color: meta?.color || "#94a3b8",
          count: categoryCountMap.get(key) || 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const baseHealth = 100;
    const pendingPenalty = Math.min(upgradeApplications * 2, 20);
    const inactiveRate =
      totalTenants > 0 ? (totalTenants - activeTenants) / totalTenants : 0;
    const inactivePenalty = Math.floor(inactiveRate * 10);

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
        totalUsers,
        totalWorkspaces,
        totalComponents,
        publishedComponents,
        activeWorkspaces,
        enterpriseWorkspaces,
        totalTenants,
        activeTenants,
        pendingReviews: upgradeApplications,
        systemHealth,
        systemServices,

        systemLogs: await prisma.loginhistory.count({
          where: {
            loginAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),

        recentUsers: recentUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
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

        componentCategories: componentCategories.map((c: any) => ({
          key: c.key,
          name: c.name,
          color: c.color,
          count: c.count,
        })),
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return NextResponse.json({ error: "获取管理面板数据失败" }, { status: 500 });
  }
}
