import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { upgradePersonalToEnterprise } from "@/lib/workspace-upgrade-service";
import { migratePersonalGiftToEnterprisePool } from "@/lib/personal-gift-migration";

// 获取企业空间配额
async function getEnterpriseQuota(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membershipLevel: true, role: true },
  });

  if (!user) {
    return {
      hasEnterprise: false,
      enterpriseCount: 0,
      maxEnterprise: 1,
      isMember: false,
    };
  }

  const enterpriseWorkspaces = await prisma.workspace.findMany({
    where: {
      ownerId: userId,
      type: "ENTERPRISE",
    },
  });

  const level = await prisma.membershiplevel.findUnique({
    where: { id: user.membershipLevel || "FREE" },
  });
  // 管理员不受等级 0 配额限制，至少保留 1 个企业空间名额（与 dashboard 中枢口径一致）
  // 统一用 isAdminRole：库中实际存在 superadmin（连写）等变体，内联等值比较会漏判
  const isAdminLike = isAdminRole(user.role);
  const levelMax = level ? Number(level.maxEnterpriseWorkspaces) : 1;
  const maxEnterprise = isAdminLike ? Math.max(levelMax, 1) : levelMax;
  const isMember = user.membershipLevel !== "FREE" || isAdminLike;

  return {
    hasEnterprise: enterpriseWorkspaces.length > 0,
    enterpriseCount: enterpriseWorkspaces.length,
    maxEnterprise,
    isMember,
  };
}

// GET: 获取工作空间信息和配额
export async function GET(request: NextRequest) {
  try {
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
      }
      userId = authResult.user!.id;
    }
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取个人空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "只能升级个人空间" }, { status: 400 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 获取配额信息
    const quota = await getEnterpriseQuota(userId);

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
      },
      quota,
    });
  } catch (error) {
    console.error("Get upgrade info error:", error);
    return NextResponse.json(
      {
        error: "获取信息失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

// POST: 执行升级操作（个人空间升级为企业空间）
// 空间中枢语义：新建一个企业空间并完成全部初始化，原个人空间按 option 选择「保留」或「删除」。
// 统一收敛到 workspace-upgrade-service 完成 type/套餐/配额/模型策略/算力赠送/账单/日志，
// 并在新建企业空间后把原个人空间的当月赠送额度迁移进企业共享池。
export async function POST(request: NextRequest) {
  try {
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
      }
      userId = authResult.user!.id;
    }
    const body = await request.json();
    const { workspaceId, targetPlan, billingCycle, option } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }
    if (!["retain", "delete", "upgrade"].includes(option)) {
      return NextResponse.json({ error: "无效的升级选项" }, { status: 400 });
    }

    // 获取原个人空间
    const personalWorkspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, description: true, type: true, ownerId: true },
    });

    if (!personalWorkspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (personalWorkspace.type !== "PERSONAL") {
      return NextResponse.json(
        { error: "只能升级个人空间，当前空间类型为企业空间" },
        { status: 400 },
      );
    }

    if (personalWorkspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权限操作此空间" }, { status: 403 });
    }

    // 检查企业空间数量上限（新建企业空间会占用一个名额）
    const quota = await getEnterpriseQuota(userId);
    if (quota.enterpriseCount >= quota.maxEnterprise) {
      return NextResponse.json(
        {
          error: quota.isMember
            ? `会员用户当前最多可拥有 ${quota.maxEnterprise} 个企业空间`
            : `当前会员等级最多可拥有 ${quota.maxEnterprise} 个企业空间，可升级会员套餐后再试`,
        },
        { status: 403 },
      );
    }

    // 1) 新建企业空间（先以 PERSONAL 落地，交给统一服务翻牌为 ENTERPRISE，避免重复幂等跳过）
    const newWorkspaceId = `ws-ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    await prisma.workspace.create({
      data: {
        id: newWorkspaceId,
        name: personalWorkspace.name,
        description: personalWorkspace.description,
        type: "PERSONAL",
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.workspacemember.create({
      data: {
        id: `wsm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        workspaceId: newWorkspaceId,
        role: "OWNER",
        joinedAt: now,
      },
    });

    // 2) 统一升级服务：套餐/配额/模型策略/算力赠送/账单/日志
    const result = await upgradePersonalToEnterprise({
      workspaceId: newWorkspaceId,
      targetPlanKey: targetPlan,
      billingCycle,
      source: "SELF_SERVICE_PURCHASE",
      actorId: userId,
    });

    // 3) 个人当月赠送额度迁移到新建企业共享池
    const migration = await migratePersonalGiftToEnterprisePool({
      userId,
      fromWorkspaceId: workspaceId,
      toWorkspaceId: newWorkspaceId,
    });

    // 4) 删除模式：升级完成后删除原个人空间（需先确认无阻碍）
    let message = "已创建企业空间，个人空间已保留";
    if (option === "delete") {
      const otherMembers = await prisma.workspacemember.count({
        where: { workspaceId, userId: { not: userId } },
      });
      const inProgress = await prisma.componenttask.count({
        where: { tenantId: workspaceId, status: "IN_PROGRESS" },
      });
      const projects = await prisma.project.count({ where: { workspaceId } });
      if (otherMembers > 0) {
        return NextResponse.json({
          error: `原个人空间还有 ${otherMembers} 名成员，需先移除或转移`,
          workspaceId: newWorkspaceId,
        }, { status: 400 });
      }
      if (inProgress > 0) {
        return NextResponse.json({
          error: `原个人空间有 ${inProgress} 个进行中的组件任务，需先完成或取消`,
          workspaceId: newWorkspaceId,
        }, { status: 400 });
      }
      if (projects > 0) {
        return NextResponse.json({
          error: `原个人空间还有 ${projects} 个项目，需先删除或转移`,
          workspaceId: newWorkspaceId,
        }, { status: 400 });
      }
      await prisma.workspacemember.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
      message = "已创建企业空间，原个人空间已删除";
    }

    return NextResponse.json({
      success: true,
      message,
      workspaceId: newWorkspaceId,
      data: result,
      giftMigrated: migration.migrated,
    });
  } catch (error) {
    console.error("Upgrade workspace error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "PLAN_NOT_PURCHASABLE_ONLINE") {
      return NextResponse.json({ error: "该套餐为线下定制方案，请联系专属架构师" }, { status: 400 });
    }
    if (msg === "TARGET_PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "目标企业套餐不存在" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "升级失败", details: msg },
      { status: 500 },
    );
  }
}
