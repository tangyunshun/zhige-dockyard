import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "未登录或登录已失效" }, { status: 401 });
    }

    const userId = authResult.user.id;
    const body = await request.json();
    const { workspaceId, action, targetMemberId, targetUsageId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 1. 验证工作空间与 Owner 身份
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "只有空间所有者才可以执行清理操作" }, { status: 403 });
    }

    let removedMembersCount = 0;
    let unboundAssetsCount = 0;
    let cancelledInvitationsCount = 0;

    // 2. 根据 action 拆解执行真实的数据清理
    if (action === "REMOVE_MEMBERS" || action === "CLEAR_ALL") {
      // 移出除 Owner 外的所有协同团队成员
      const membersRes = await prisma.workspacemember.deleteMany({
        where: {
          workspaceId,
          userId: { not: userId },
        },
      });
      removedMembersCount = membersRes.count;

      // 同时作废并清理悬空的 Pending 邀请函
      const invRes = await prisma.workspaceinvitation.deleteMany({
        where: {
          workspaceId,
          status: "PENDING",
        },
      });
      cancelledInvitationsCount = invRes.count;
    }

    if (action === "UNBIND_ASSETS" || action === "CLEAR_ALL") {
      // 彻底解绑该工作空间关联的所有授权组件资产 (componentusage)
      const assetRes = await prisma.componentusage.deleteMany({
        where: { workspaceId },
      });
      unboundAssetsCount = assetRes.count;
    }

    if (action === "REMOVE_SINGLE_MEMBER" && targetMemberId) {
      // 移除指定的单名团队成员（不能移除 Owner）
      const singleMember = await prisma.workspacemember.findUnique({
        where: { id: targetMemberId },
      });
      if (singleMember && singleMember.workspaceId === workspaceId && singleMember.userId !== userId) {
        await prisma.workspacemember.delete({
          where: { id: targetMemberId },
        });
        removedMembersCount = 1;
      }
    }

    if (action === "UNBIND_SINGLE_ASSET" && targetUsageId) {
      // 解绑指定的单个组件资产
      const singleUsage = await prisma.componentusage.findUnique({
        where: { id: targetUsageId },
      });
      if (singleUsage && singleUsage.workspaceId === workspaceId) {
        await prisma.componentusage.delete({
          where: { id: targetUsageId },
        });
        unboundAssetsCount = 1;
      }
    }

    // 3. 再次查询剩余状态，做即时复查反馈
    const remainingMembers = await prisma.workspacemember.count({
      where: { workspaceId, userId: { not: userId } },
    });
    const remainingAssets = await prisma.componentusage.count({
      where: { workspaceId },
    });

    return NextResponse.json({
      success: true,
      message: "数据清理完成",
      cleaned: {
        removedMembersCount,
        unboundAssetsCount,
        cancelledInvitationsCount,
      },
      remaining: {
        memberCount: remainingMembers,
        assetCount: remainingAssets,
        canDissolve: remainingMembers === 0 && remainingAssets === 0,
      },
    });
  } catch (error: any) {
    console.error("Dissolve cleanup error:", error);
    return NextResponse.json(
      { error: "解散清理失败，请稍后重试", details: error?.message },
      { status: 500 }
    );
  }
}
