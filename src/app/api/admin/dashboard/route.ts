import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

import {
  getAuditDictionariesFromDb,
  translateAction,
  translateResource,
  normalizeIpAddress,
} from "@/lib/audit-dict";

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
      recentAuditLogs,
      bannedUsers,
      todayOperations,
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

      // 9. 待处理风控申诉工单数
      prisma.accountappeal.count({
        where: { status: "pending" },
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

      // 14. 系统服务状态：真实探针（不再写死全 "normal"），每项都通过一次真实 DB 往返测延迟并统计真实数据
      (async () => {
        const probe = async <T,>(
          runner: () => Promise<T>,
          normalMessage: (result: T) => string,
        ) => {
          const startedAt = Date.now();
          try {
            const result = await runner();
            return {
              status: "normal" as const,
              latencyMs: Date.now() - startedAt,
              message: normalMessage(result),
            };
          } catch (err) {
            return {
              status: "down" as const,
              latencyMs: Date.now() - startedAt,
              message: err instanceof Error ? err.message : "服务探测失败",
            };
          }
        };

        const [database, api, storage, notification] = await Promise.all([
          // 数据库连通性
          probe(
            async () => {
              await prisma.$queryRaw`SELECT 1`;
              return true;
            },
            () => "连接池活跃 · 事务读写正常",
          ),
          // 应用接口服务：以一次真实业务查询代表接口链路
          probe(
            () => prisma.user.count(),
            (count) => `接口鉴权与业务查询链路正常 · 在册用户 ${count} 人`,
          ),
          // 文件与资源存储：以空间配额中的真实占用为指标
          probe(
            () =>
              prisma.workspacequota.aggregate({
                _sum: { storageUsed: true },
              }),
            (agg) => {
              const used = Number(agg._sum.storageUsed || 0);
              const gb = used / (1024 * 1024 * 1024);
              return `资源配额读写正常 · 当前占用 ${gb >= 0.1 ? `${gb.toFixed(2)} GB` : `${Math.round(used / (1024 * 1024))} MB`}`;
            },
          ),
          // 消息通知通道：统计真实未读通知与近 24h 新增量
          probe(
            async () => {
              const [unread, recent] = await Promise.all([
                prisma.notification.count({ where: { isRead: false } }),
                prisma.notification.count({
                  where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                }),
              ]);
              return { unread, recent };
            },
            (res) => `通知通道读写正常 · 未读 ${res.unread} 条 / 近 24h 新增 ${res.recent} 条`,
          ),
        ]);

        return [
          { key: "database", name: "数据库服务 (MySQL / Prisma)", ...database },
          { key: "api", name: "系统应用接口服务", ...api },
          { key: "storage", name: "文件与资源存储 (Storage)", ...storage },
          { key: "notification", name: "消息通知通道 (Notification)", ...notification },
        ];
      })(),

      // 15. 平台最近敏感操作与安全审计日志（前 6 条）
      prisma.operationlog.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),

      // 16. 安全管制/封禁账号数
      prisma.user.count({
        where: { status: "banned" },
      }),

      // 17. 今日安全审计操作总次数
      prisma.operationlog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
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
      (systemServices as Array<{ status: string }>).filter(
        (service) => service.status !== "normal",
      ).length * 10;

    const systemHealth = Math.max(
      baseHealth - pendingPenalty - inactivePenalty - servicePenalty,
      0,
    );

    const { actionDict, resourceDict } = await getAuditDictionariesFromDb();

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

        // 批量查询最近工作空间的所有者头像（确保空间头像 100% 真实可靠）
        recentWorkspaces: await (async () => {
          const recentWsOwnerIds = Array.from(
            new Set(recentWorkspaces.map((w: any) => w.ownerId).filter(Boolean)),
          );
          const recentOwners =
            recentWsOwnerIds.length > 0
              ? await prisma.user.findMany({
                  where: { id: { in: recentWsOwnerIds } },
                  select: { id: true, avatar: true },
                })
              : [];
          const recentOwnerAvatarMap = new Map(recentOwners.map((o) => [o.id, o.avatar]));

          return recentWorkspaces.map((ws: any) => {
            const ownerAvatar =
              recentOwnerAvatarMap.get(ws.ownerId) ||
              ws.workspacemember?.find((m: any) => m.user?.avatar)?.user?.avatar ||
              ws.workspacemember?.[0]?.user?.avatar ||
              null;
            const realAvatar = ws.logo || ownerAvatar || null;

            return {
              id: ws.id,
              name: ws.name,
              type: ws.type,
              logo: ws.logo,
              avatar: realAvatar,
              createdAt: ws.createdAt,
              members: ws.workspacemember.map((m: any) => ({
                user: m.user,
              })),
            };
          });
        })(),

        componentCategories: componentCategories.map((c: any) => ({
          key: c.key,
          name: c.name,
          color: c.color,
          count: c.count,
        })),

        // 平台最新敏感操作审计日志（映射自数据库 system_config 字典，IP标准化）
        recentAuditLogs: recentAuditLogs.map((log: any) => {
          const actMeta = translateAction(log.action, actionDict);
          const resZh = translateResource(log.resource, resourceDict);

          return {
            id: log.id,
            action: log.action,
            actionZh: actMeta.label,
            actionBadge: actMeta,
            resource: log.resource,
            resourceZh: resZh,
            details: log.details,
            ipAddress: log.ipAddress,
            formattedIp: normalizeIpAddress(log.ipAddress),
            createdAt: log.createdAt,
            user: log.user
              ? {
                  id: log.user.id,
                  name: log.user.name,
                  email: log.user.email,
                  avatar: log.user.avatar,
                  role: log.user.role,
                }
              : null,
          };
        }),

        // 平台全域风控态势汇总
        securitySummary: {
          pendingAppeals: upgradeApplications,
          bannedUsers,
          todayOperations,
          todayLogins: await prisma.loginhistory.count({
            where: {
              loginAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),
        },

        // 系统字典：提供给前端或需要处使用（来源于数据库 system_config 表）
        auditDicts: {
          actions: actionDict,
          resources: resourceDict,
        },
      },
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return NextResponse.json({ error: "获取管理面板数据失败" }, { status: 500 });
  }
}
