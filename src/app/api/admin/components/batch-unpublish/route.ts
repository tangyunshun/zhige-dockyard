import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:publish");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json();
    const ids = body.ids || body.componentIds;
    const force = Boolean(body.force);
    const noticeReason = (body.noticeReason || "").trim();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少组件 ID 列表" }, { status: 400 });
    }

    // 1. 查询待下架的目标组件信息
    const targetComponents = await prisma.componentcatalog.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isPublished: true },
    });

    if (targetComponents.length === 0) {
      return NextResponse.json({ error: "未找到待下架的目标组件" }, { status: 404 });
    }

    // 2. 检测这些组件是否被空间装配载入
    const usages = await prisma.componentusage.findMany({
      where: {
        componentId: { in: ids },
        workspaceId: { not: null },
      },
      select: {
        workspaceId: true,
        componentId: true,
        userId: true,
      },
    });

    const permissions = await prisma.componentpermission.findMany({
      where: {
        componentId: { in: ids },
        OR: [{ canView: true }, { canExecute: true }],
      },
      select: {
        componentId: true,
        post: { select: { workspaceId: true } },
      },
    });

    const workspaceIdSet = new Set<string>();
    const affectedUserIdSet = new Set<string>();

    usages.forEach((u) => {
      if (u.workspaceId) workspaceIdSet.add(u.workspaceId);
      if (u.userId) affectedUserIdSet.add(u.userId);
    });
    permissions.forEach((p) => {
      if (p.post?.workspaceId) workspaceIdSet.add(p.post.workspaceId);
    });

    if (workspaceIdSet.size > 0) {
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
            select: { userId: true, role: true },
          },
        },
      });

      let personalCount = 0;
      let enterpriseCount = 0;

      workspaceList.forEach((ws) => {
        if (ws.type === "PERSONAL") personalCount++;
        else enterpriseCount++;
        if (ws.ownerId) affectedUserIdSet.add(ws.ownerId);
        ws.workspacemember.forEach((m) => affectedUserIdSet.add(m.userId));
      });

      // 若被空间载入且未显式指定 force，强力阻断下架
      if (!force) {
        return NextResponse.json(
          {
            error: `安全拦截：所选组件当前正被 ${workspaceList.length} 个空间（含 ${enterpriseCount} 个企业协同空间、${personalCount} 个个人空间）装配使用中！禁止直接下架。如需下架，请确认强制下架并向相关空间管理者发送站内信通知。`,
            needConfirmForce: true,
            totalLoadedCount: workspaceList.length,
            enterpriseCount,
            personalCount,
            workspaces: workspaceList.map((ws) => ({
              id: ws.id,
              name: ws.name,
              type: ws.type,
            })),
          },
          { status: 400 }
        );
      }
    }

    // 3. 执行下架
    await prisma.componentcatalog.updateMany({
      where: { id: { in: ids } },
      data: { isPublished: false },
    });

    // 4. 若有受影响用户且确认下架，自动派发站内信通知
    let notificationCount = 0;
    if (affectedUserIdSet.size > 0) {
      const compNames = targetComponents.map((c) => `【${c.name}】`).join("、");
      const defaultReason = "因平台核心组件矩阵升级与维护规划调整，该组件即日起下架停用。";
      const finalReason = noticeReason || defaultReason;

      const notificationsData = Array.from(affectedUserIdSet).map((userId) => ({
        id: crypto.randomUUID(),
        userId,
        title: `⚠️ 空间组件下架停用通知：${compNames}`,
        content: `尊敬的空间管理者/使用者：您所在工作空间装配载入的组件 ${compNames} 已被平台管理员执行批量下架操作。\n\n下架说明：${finalReason}\n\n下架后工作空间内将暂停该组件的调度与任务执行。如有任何疑问或业务需求，请及时联系平台管理员或服务支持人员。`,
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
        affectedUserIdSet.size > 0
          ? `已批量强制下架 ${ids.length} 个组件，并向 ${notificationCount} 位相关空间负责人/使用者派发了站内信通知`
          : `已批量下架 ${ids.length} 个组件`,
      notificationCount,
    });
  } catch (error) {
    console.error("Batch unpublish components error:", error);
    return NextResponse.json({ error: "批量下架组件失败" }, { status: 500 });
  }
}
