import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * 辅助函数：查询某些组件被哪些空间（个人/企业）载入使用
 */
async function getLoadedWorkspaces(componentIds: string[]) {
  if (componentIds.length === 0) {
    return {
      workspaces: [],
      personalCount: 0,
      enterpriseCount: 0,
      totalLoadedCount: 0,
      affectedUserIds: [],
    };
  }

  // 1. 从 componentusage 中查询已装配/载入的工作空间及对应使用用户
  const usages = await prisma.componentusage.findMany({
    where: {
      componentId: { in: componentIds },
      workspaceId: { not: null },
    },
    select: {
      workspaceId: true,
      componentId: true,
      userId: true,
      metadata: true,
    },
  });

  // 2. 从 componentpermission 中查询已授权该组件的岗位及其所属空间
  const permissions = await prisma.componentpermission.findMany({
    where: {
      componentId: { in: componentIds },
      OR: [
        { canView: true },
        { canExecute: true },
      ],
    },
    select: {
      componentId: true,
      post: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  // 汇集所有涉及的 workspaceId
  const workspaceIdSet = new Set<string>();
  const affectedUserIdSet = new Set<string>();

  usages.forEach((u) => {
    if (u.workspaceId) workspaceIdSet.add(u.workspaceId);
    if (u.userId) affectedUserIdSet.add(u.userId);
  });
  permissions.forEach((p) => {
    if (p.post?.workspaceId) workspaceIdSet.add(p.post.workspaceId);
  });

  if (workspaceIdSet.size === 0) {
    return {
      workspaces: [],
      personalCount: 0,
      enterpriseCount: 0,
      totalLoadedCount: 0,
      affectedUserIds: Array.from(affectedUserIdSet),
    };
  }

  // 3. 查询这些空间的详情、所有者（Owner）及管理者/所有者成员
  const workspaceList = await prisma.workspace.findMany({
    where: { id: { in: Array.from(workspaceIdSet) } },
    select: {
      id: true,
      name: true,
      type: true,
      ownerId: true,
      workspacemember: {
        where: {
          role: { in: ["OWNER", "ADMIN", "MEMBER", "CREATOR"] },
        },
        select: {
          userId: true,
          role: true,
        },
      },
    },
  });

  let personalCount = 0;
  let enterpriseCount = 0;

  const formattedWorkspaces = workspaceList.map((ws) => {
    if (ws.type === "PERSONAL") {
      personalCount++;
    } else {
      enterpriseCount++;
    }

    // 优先选取 OWNER / ADMIN，若为个人空间则所有成员均属于空间归属人
    const managers = ws.workspacemember.filter((m) =>
      ws.type === "PERSONAL" || m.role === "OWNER" || m.role === "ADMIN" || m.role === "CREATOR"
    );
    managers.forEach((m) => affectedUserIdSet.add(m.userId));

    // 确保空间所有者（Owner）100% 纳入通知名单
    if (ws.ownerId) {
      affectedUserIdSet.add(ws.ownerId);
    }

    return {
      id: ws.id,
      name: ws.name || (ws.type === "PERSONAL" ? "个人自主空间" : "未命名企业空间"),
      type: ws.type || "ENTERPRISE",
      ownerId: ws.ownerId,
      managerUserIds: managers.map((m) => m.userId),
    };
  });

  return {
    workspaces: formattedWorkspaces,
    personalCount,
    enterpriseCount,
    totalLoadedCount: formattedWorkspaces.length,
    affectedUserIds: Array.from(affectedUserIdSet),
  };
}

/**
 * GET: 检测指定组件被空间载入的状态
 * Query 参数：id（单个组件 ID）或 ids（逗号分隔的组件 ID 列表）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:publish");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");

    let componentIds: string[] = [];
    if (id) {
      componentIds = [id];
    } else if (idsParam) {
      componentIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    }

    if (componentIds.length === 0) {
      return NextResponse.json({ error: "缺少组件 ID 参数" }, { status: 400 });
    }

    const loadedInfo = await getLoadedWorkspaces(componentIds);

    // 查询组件名称
    const components = await prisma.componentcatalog.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, name: true, isPublished: true },
    });

    return NextResponse.json({
      success: true,
      components,
      ...loadedInfo,
    });
  } catch (error: any) {
    console.error("Check component loaded status error:", error);
    return NextResponse.json(
      { error: "检测组件空间载入状态失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST: 执行组件下架（若被空间载入，需传 force: true，并自动向相关空间负责人发送通知）
 * Body 参数：
 * - id?: string （单个组件 ID）
 * - ids?: string[] （批量组件 ID 列表）
 * - force?: boolean （是否确认强制下架）
 * - noticeReason?: string （下架说明文案，将包含在发送给空间的通知中）
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:publish");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json();
    const id = body.id;
    const ids = body.ids || (id ? [id] : []);
    const force = Boolean(body.force);
    const noticeReason = (body.noticeReason || "").trim();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少待下架的组件 ID" }, { status: 400 });
    }

    // 1. 查询待下架组件信息
    const targetComponents = await prisma.componentcatalog.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isPublished: true },
    });

    if (targetComponents.length === 0) {
      return NextResponse.json({ error: "未找到待下架的组件" }, { status: 404 });
    }

    // 2. 检测这些组件是否被空间载入
    const loadedInfo = await getLoadedWorkspaces(ids);

    // 若被空间载入且未确认强制下架，强力阻断常规下架
    if (loadedInfo.totalLoadedCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `拦截下架：所选组件当前已被 ${loadedInfo.totalLoadedCount} 个空间（含 ${loadedInfo.enterpriseCount} 个企业协同空间、${loadedInfo.personalCount} 个个人自主空间）载入运用，常规操作禁止下架！如需强制下架，请确认强制下架并向受影响空间分发通知。`,
          needConfirmForce: true,
          ...loadedInfo,
        },
        { status: 400 }
      );
    }

    // 3. 执行组件下架：将 isPublished 设置为 false
    await prisma.componentcatalog.updateMany({
      where: { id: { in: ids } },
      data: { isPublished: false },
    });

    // 4. 若已被空间载入且执行了强制下架，向受影响空间负责人分发系统通知
    let notificationCount = 0;
    if (loadedInfo.affectedUserIds.length > 0) {
      const compNames = targetComponents.map((c) => `【${c.name}】`).join("、");
      const defaultReason = "因平台核心组件矩阵升级与维护规划调整，该组件即日起下架停用。";
      const finalReason = noticeReason || defaultReason;

      const notificationsData = loadedInfo.affectedUserIds.map((userId) => ({
        id: crypto.randomUUID(),
        userId,
        title: `⚠️ 空间组件下架停用通知：${compNames}`,
        content: `尊敬的空间管理者：您所在工作空间装配载入的组件 ${compNames} 已被平台管理员执行下架操作。\n\n下架说明：${finalReason}\n\n下架后工作空间内将暂停该组件的调度与任务执行。如有任何疑问或业务需求，请及时联系平台管理员或服务支持人员。`,
        type: "system",
        popupOnLogin: true,
        link: "/user/workspace-hub",
        createdAt: new Date(),
      }));

      const createResult = await prisma.notification.createMany({
        data: notificationsData,
      });
      notificationCount = createResult.count;
    }

    return NextResponse.json({
      success: true,
      message:
        loadedInfo.totalLoadedCount > 0
          ? `已成功强制下架 ${ids.length} 个组件，并向 ${notificationCount} 位空间负责人发送下架通知`
          : `已成功下架 ${ids.length} 个组件`,
      details: {
        unpublishCount: ids.length,
        notificationCount,
        loadedWorkspacesCount: loadedInfo.totalLoadedCount,
      },
    });
  } catch (error: any) {
    console.error("Unpublish components error:", error);
    return NextResponse.json(
      { error: "下架组件失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
