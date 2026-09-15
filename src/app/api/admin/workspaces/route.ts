import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    // 严格校验工作空间读取权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "workspace:read");
    if (!authCheck.authorized) {
      return authCheck.errorResponse || NextResponse.json({ error: "无权访问工作空间管理" }, { status: 403 });
    }
    const currentAdminId = authCheck.user?.id || "";

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const componentCount = searchParams.get("componentCount") || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.name = { contains: search };
    }

    if (type) {
      where.type = type;
    }

    // 先获取所有工作空间（用于统计，不受筛选影响）
    const allWorkspaces = await prisma.workspace.findMany({
      include: {
        workspacemember: {
          include: {
            user: {
              select: { name: true, email: true, avatar: true },
            },
          },
        },
        _count: {
          select: { workspacemember: true },
        },
      },
    });

    // 统计所有工作空间实际装配启用的组件数量
    const allWorkspaceIds = allWorkspaces.map((w) => w.id);
    const allUsages = await prisma.componentusage.findMany({
      where: {
        workspaceId: { in: allWorkspaceIds },
      },
      select: {
        workspaceId: true,
        componentId: true,
        metadata: true,
      },
    });

    const allWsCompMap = new Map<string, Set<string>>();
    allUsages.forEach((u) => {
      if (!u.workspaceId || !u.componentId) return;
      let enabled = true;
      if (u.metadata) {
        try {
          const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
          if (meta && meta.enabled === false) enabled = false;
        } catch {}
      }
      if (enabled) {
        if (!allWsCompMap.has(u.workspaceId)) allWsCompMap.set(u.workspaceId, new Set());
        allWsCompMap.get(u.workspaceId)!.add(u.componentId);
      }
    });

    const allWorkspacesWithComponentCount = allWorkspaces.map((workspace) => {
      const componentCountValue = allWsCompMap.get(workspace.id)?.size || 0;
      // 剔除原始 workspacemember（含 BigInt 字段），避免序列化报错
      const { workspacemember, ...workspaceBase } = workspace;
      const ownerAvatar = workspacemember?.[0]?.user?.avatar || null;
      return {
        ...workspaceBase,
        componentCount: componentCountValue,
        logo: workspace.logo,
        avatar: workspace.logo || ownerAvatar || null,
        members: workspacemember,
      };
    });

    // 再获取筛选后的工作空间（用于列表显示）
    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          workspacemember: {
            include: {
              user: {
                select: { name: true, email: true, avatar: true },
              },
            },
          },
          _count: {
            select: { workspacemember: true },
          },
        },
      }),
      prisma.workspace.count({ where }),
    ]);

    // 批量查询所有工作空间的所有者（Owner）角色与信息，用于安全保护判断与真实空间头像继承
    const ownerIds = Array.from(new Set(workspaces.map((w) => w.ownerId).filter(Boolean)));
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, email: true, role: true, avatar: true },
    });
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    // 预载所有已获批的空间解封申诉，确保空间管理列表与申诉审核 100% 实时联动解封
    const approvedAppeals = await prisma.accountappeal.findMany({
      where: {
        businessType: "空间解封申诉",
        status: "approved",
      },
      select: { appealEvidence: true },
    });
    const approvedWsIdSet = new Set<string>();
    approvedAppeals.forEach((app) => {
      try {
        if (app.appealEvidence) {
          const parsed = JSON.parse(app.appealEvidence);
          if (parsed.workspaceId) approvedWsIdSet.add(parsed.workspaceId);
        }
      } catch {}
    });

    // 统计筛选后的工作空间的真实装配组件数量与算力配额
    const pageWorkspaceIds = workspaces.map((w) => w.id);
    const pageUsages = await prisma.componentusage.findMany({
      where: {
        workspaceId: { in: pageWorkspaceIds },
      },
      select: {
        workspaceId: true,
        componentId: true,
        metadata: true,
      },
    });

    const pageWsCompMap = new Map<string, Set<string>>();
    pageUsages.forEach((u) => {
      if (!u.workspaceId || !u.componentId) return;
      let enabled = true;
      if (u.metadata) {
        try {
          const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
          if (meta && meta.enabled === false) enabled = false;
        } catch {}
      }
      if (enabled) {
        if (!pageWsCompMap.has(u.workspaceId)) pageWsCompMap.set(u.workspaceId, new Set());
        pageWsCompMap.get(u.workspaceId)!.add(u.componentId);
      }
    });

    const workspacesWithComponentCount = await Promise.all(
      workspaces.map(async (workspace) => {
        const componentCountValue = pageWsCompMap.get(workspace.id)?.size || 0;
        let quota = await prisma.workspacequota.findUnique({
          where: { workspaceId: workspace.id },
          select: {
            id: true,
            tokenBalance: true,
            membershipLevelId: true,
            storageUsed: true,
            storageLimit: true,
            apiCallsUsed: true,
            apiCallsLimit: true,
          },
        });

        // 算力配额：只读展示实际余额，不做任何赠送/保底（免费额度只来自注册福利按月发放或充值/购买）
        const effectiveBalance = quota ? Number(quota.tokenBalance) : 0;

        // 检查到期自动解封与停用元数据
        const rawQuotaJson = (workspace.quota as any) || {};
        let currentStatus = workspace.status;
        let disabledUntil = rawQuotaJson.disabledUntil || null;
        let disabledReason = rawQuotaJson.disabledReason || null;
        let disabledDuration = rawQuotaJson.disabledDuration || null;
        let appealStatus = rawQuotaJson.appealStatus || "none";
        let appealCount = Number(rawQuotaJson.appealCount || 0);

        // 到期自动解封检测：若空间被停用，且设置了截止时间，并且当前时间已经超过该截止时间
        if (currentStatus === "DISABLED" && disabledUntil) {
          const expireTime = new Date(disabledUntil).getTime();
          if (!isNaN(expireTime) && Date.now() > expireTime) {
            // 触发自动到期解封！
            currentStatus = "ACTIVE";
            disabledUntil = null;
            disabledReason = null;
            disabledDuration = null;
            const {
              disabledUntil: d1,
              disabledReason: d2,
              disabledDuration: d3,
              disabledDurationDays: d4,
              disabledAt: d5,
              ...restQuota
            } = rawQuotaJson;

            prisma.workspace.update({
              where: { id: workspace.id },
              data: {
                status: "ACTIVE",
                quota: {
                  ...restQuota,
                  appealStatus: "none",
                },
              },
            }).catch(() => {});
          }
        }

        // 申诉获批联动解封检测：若申诉工单已被管理员核准通过，空间必须 100% 连带解除管控恢复运行
        if ((currentStatus === "DISABLED" || appealStatus === "pending") && approvedWsIdSet.has(workspace.id)) {
          currentStatus = "ACTIVE";
          disabledUntil = null;
          disabledReason = null;
          disabledDuration = null;
          appealStatus = "approved";
          const {
            disabledUntil: _d1,
            disabledReason: _d2,
            disabledDuration: _d3,
            disabledDurationDays: _d4,
            disabledAt: _d5,
            ...restQuota
          } = rawQuotaJson;

          prisma.workspace.update({
            where: { id: workspace.id },
            data: {
              status: "ACTIVE",
              quota: {
                ...restQuota,
                appealStatus: "approved",
              },
            },
          }).catch(() => {});
        }

        // 获取该空间拥有者信息及受保护状态（超管/管理员名下的空间受系统安全保护，严禁停用）
        const owner = ownerMap.get(workspace.ownerId) || null;
        const isProtected = Boolean(
          (owner && (owner.role === "SUPER_ADMIN" || owner.role === "ADMIN")) ||
          (currentAdminId && workspace.ownerId === currentAdminId)
        );

        // 剔除原始 workspacemember（含 BigInt 字段），避免 JSON 序列化报错
        const { workspacemember, ...workspaceBase } = workspace;
        const memberCount = workspace._count?.workspacemember ?? workspacemember.length ?? 0;
        const isEnterprise = workspace.type === "ENTERPRISE";
        const realAvatar =
          workspace.logo ||
          owner?.avatar ||
          workspacemember?.find((m: any) => m.user?.avatar)?.user?.avatar ||
          null;

        return {
          ...workspaceBase,
          logo: workspace.logo,
          avatar: realAvatar,
          status: currentStatus,
          disabledUntil,
          disabledReason,
          disabledDuration,
          appealStatus,
          appealCount,
          componentCount: componentCountValue,
          memberCount,
          owner: owner
            ? { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatar: owner.avatar }
            : null,
          isProtected,
          _count: {
            workspacemember: memberCount,
            members: memberCount,
          },
          quota: {
            tokenBalance: effectiveBalance,
            membershipLevelId: quota?.membershipLevelId || (isEnterprise ? "STANDARD" : "FREE"),
            storageUsed: Number(quota?.storageUsed || 0),
            storageLimit: Number(quota?.storageLimit || (isEnterprise ? 10 * 1024 * 1024 * 1024 : 1024 * 1024 * 1024)),
            apiCallsUsed: Number(quota?.apiCallsUsed || 0),
            apiCallsLimit: Number(quota?.apiCallsLimit || (isEnterprise ? 50000 : 1000)),
          },
          members: workspacemember.map((m) => ({
            ...m,
            monthlyTokenLimit: m.monthlyTokenLimit ? Number(m.monthlyTokenLimit) : null,
            monthlyTokenUsed: Number(m.monthlyTokenUsed || 0),
          })),
        };
      }),
    );

    // 根据组件数量筛选
    let filteredWorkspaces = workspacesWithComponentCount;
    if (componentCount) {
      filteredWorkspaces = workspacesWithComponentCount.filter((ws) => {
        const count = ws.componentCount;
        if (componentCount === "0") return count === 0;
        if (componentCount === "1-10") return count >= 1 && count <= 10;
        if (componentCount === "11-50") return count >= 11 && count <= 50;
        if (componentCount === "51-100") return count >= 51 && count <= 100;
        if (componentCount === "100+") return count > 100;
        return true;
      });
    }

    // 计算统计数据（基于所有工作空间，不受筛选影响）
    const totalComponentCount = allWorkspacesWithComponentCount.reduce(
      (sum, ws) => sum + ws.componentCount,
      0,
    );

    // 待审核空间：这里暂时用 DISABLED 状态作为待审核（实际应该有 PENDING 状态）
    const pendingCount = allWorkspacesWithComponentCount.filter(
      (ws) => ws.status === "DISABLED",
    ).length;

    // 总成员数（基于所有工作空间，不受筛选影响）
    const totalMembers = allWorkspacesWithComponentCount.reduce(
      (sum, ws) => sum + ws._count.workspacemember,
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        workspaces: filteredWorkspaces,
        total: allWorkspacesWithComponentCount.length, // 显示所有工作空间总数，不受筛选影响
        page,
        totalPages: Math.ceil(filteredWorkspaces.length / limit),
        stats: {
          totalComponentCount,
          pendingCount,
          totalMembers,
        },
      },
    });
  } catch (error) {
    console.error("Get workspaces error:", error);
    return NextResponse.json(
      {
        error: "获取工作空间列表失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 严格校验超级管理员权限（工作空间解散与销毁为高危动作，仅限超级管理员）
    const authCheck = await requirePlatformPermission(request, "workspace:status_update");
    if (!authCheck.authorized) {
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }
    const roleUpper = String(authCheck.user?.role || "").toUpperCase();
    const isSuperAdmin = roleUpper === "SUPER_ADMIN" || roleUpper === "SUPERADMIN" || roleUpper === "SUPER";
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "工作空间彻底解散仅限超级管理员执行" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 个人空间不能删除
    if (workspace.type === "PERSONAL") {
      return NextResponse.json({ error: "个人空间不能删除" }, { status: 400 });
    }

    // 企业空间必须先禁用才能删除
    if (workspace.type === "ENTERPRISE" && workspace.status !== "DISABLED") {
      return NextResponse.json(
        { error: "企业空间必须先禁用才能删除" },
        { status: 400 },
      );
    }

    // 删除工作空间 (级联删除相关数据)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      {
        error: "删除工作空间失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
