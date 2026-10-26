import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isSuperAdminRole } from "@/lib/role-utils";
import { getAuditDictionariesFromDb, translateAction } from "@/lib/audit-dict";

/**
 * 企业空间「成员活动」总表（超管在后台透视每个企业空间里每一个成员的行为）。
 * 一行 = 一个企业空间里的某一个成员，指标全部归因于「该成员在本空间内」的行为：
 *   - 执行任务数：componentusage（带 userId+workspaceId）
 *   - 最近使用组件（前 3）：componentusage 按 componentId 聚合
 *   - 最近操作：operationlog（严格按 userId+workspaceId，排除 superadmin 等空间外记录）
 * 停用整个空间属于「空间管理」页职责，本页不提供。
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const me = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!me || !isSuperAdminRole(me.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const search = (searchParams.get("search") || "").trim();
    const spaceId = (searchParams.get("spaceId") || "").trim();
    const spaceStatus = (searchParams.get("spaceStatus") || "ALL").trim();
    const role = (searchParams.get("role") || "ALL").trim();
    const skip = (page - 1) * limit;

    // 全部企业空间（用于统计 + 筛选下拉）
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: { type: "ENTERPRISE" },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    const enterpriseIds = enterpriseWorkspaces.map((w) => w.id);
    const spaceMetaMap = new Map(
      enterpriseWorkspaces.map((w) => [
        w.id,
        { name: w.name, status: ((w as any).status || "ACTIVE").toString().toUpperCase() },
      ]),
    );

    // 顶部 4 卡统计（全量，不受分页/筛选影响）
    const memberCount = enterpriseIds.length
      ? await prisma.workspacemember.count({ where: { workspaceId: { in: enterpriseIds } } })
      : 0;
    const totalExecutions = enterpriseIds.length
      ? await prisma.componentusage.count({ where: { workspaceId: { in: enterpriseIds } } })
      : 0;
    let activeRate = 0;
    if (enterpriseIds.length && memberCount > 0) {
      const since = new Date(Date.now() - 7 * 86400000);
      const grp = await prisma.componentusage.groupBy({
        by: ["userId"],
        where: { workspaceId: { in: enterpriseIds }, usedAt: { gte: since } },
        _count: { id: true },
      });
      activeRate = Math.round((grp.length / memberCount) * 100);
    }

    // 成员列表筛选
    const where: any = { workspaceId: { in: enterpriseIds } };
    if (spaceId) {
      where.workspaceId = spaceId;
    } else if (spaceStatus && spaceStatus !== "ALL") {
      const targetStatus = spaceStatus.toUpperCase();
      const targetIds = enterpriseWorkspaces
        .filter((w) => ((w as any).status || "ACTIVE").toString().toUpperCase() === targetStatus)
        .map((w) => w.id);
      where.workspaceId = { in: targetIds };
    }
    if (role && role !== "ALL") where.role = role;
    if (search) {
      where.user = {
        OR: [{ name: { contains: search } }, { email: { contains: search } }],
      };
    }

    const [rows, total] = await Promise.all([
      prisma.workspacemember.findMany({
        where,
        include: { user: { select: { name: true, email: true, avatar: true } } },
        orderBy: { joinedAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.workspacemember.count({ where }),
    ]);

    const userIds = rows.map((r) => r.userId);
    const wsIds = rows.map((r) => r.workspaceId);

    // 批量取本页所需的执行记录与操作日志（按 成员+空间 归集，避免 N+1）
    const [usages, logs] = await Promise.all([
      userIds.length && wsIds.length
        ? prisma.componentusage.findMany({
            where: { userId: { in: userIds }, workspaceId: { in: wsIds } },
            select: { userId: true, workspaceId: true, componentId: true, usedAt: true },
          })
        : Promise.resolve([] as any[]),
      userIds.length && wsIds.length
        ? prisma.operationlog.findMany({
            where: { userId: { in: userIds }, workspaceId: { in: wsIds } },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([] as any[]),
    ]);

    const compIds = Array.from(new Set(usages.map((u: any) => u.componentId).filter(Boolean)));
    const compRows = compIds.length
      ? await prisma.componentcatalog.findMany({
          where: { id: { in: compIds } },
          select: { id: true, name: true },
        })
      : [];
    const compNameMap = new Map(compRows.map((c: any) => [c.id, c.name]));

    // 「最近操作」动作标签同样必须从数据库审计字典翻译，绝不裸显英文动作键
    const { actionDict } = await getAuditDictionariesFromDb();

    const roleLabel: Record<string, string> = {
      OWNER: "空间所有者",
      ADMIN: "管理员",
      MEMBER: "普通成员",
    };

    const members = rows.map((r: any) => {
      const u = usages.filter((x: any) => x.userId === r.userId && x.workspaceId === r.workspaceId);
      const l = logs.filter((x: any) => x.userId === r.userId && x.workspaceId === r.workspaceId);

      const byComp = new Map<string, number>();
      u.forEach((x: any) => byComp.set(x.componentId, (byComp.get(x.componentId) || 0) + 1));
      const topComponents = [...byComp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([componentId, count]) => ({
          componentId,
          name: compNameMap.get(componentId) || componentId,
          count,
        }));

      const recentLog = l[0]
        ? { action: l[0].action, actionZh: translateAction(l[0].action, actionDict).label, createdAt: l[0].createdAt }
        : null;

      const meta = spaceMetaMap.get(r.workspaceId);
      return {
        id: r.id,
        workspaceId: r.workspaceId,
        workspaceName: meta?.name || "",
        workspaceStatus: meta?.status || "ACTIVE",
        userId: r.userId,
        name: r.user?.name || null,
        email: r.user?.email,
        avatar: r.user?.avatar || null,
        role: r.role,
        roleLabel: roleLabel[r.role] || r.role,
        joinedAt: r.joinedAt,
        taskCount: u.length,
        topComponents,
        recentLog,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        members,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stats: {
          workspaceCount: enterpriseIds.length,
          memberCount,
          activeRate,
          totalExecutions,
        },
        spaces: enterpriseWorkspaces,
      },
    });
  } catch (error) {
    console.error("Get tenant members error:", error);
    return NextResponse.json(
      {
        error: "获取企业空间成员活动失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
