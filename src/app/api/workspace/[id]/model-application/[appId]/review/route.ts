import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/[id]/model-application/[appId]/review
 *
 * 审批模型使用申请（仅空间所有者可审批；空间管理员 ADMIN 与平台管理员均无此审批权限）。
 * - action=APPROVE：按 (userId, workspaceId) upsert workspace_member_model_preference，
 *   仅将该申请人默认模型改为申请模型，不影响其他成员；并通知申请人。
 * - action=REJECT：必须填写拒绝原因；并通知申请人。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> },
) {
  try {
    const { id: workspaceId, appId } = await params;
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "请先登录后再审批" }, { status: 401 });
    }
    const userId = auth.user.id;

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!ws) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });

    // 权限边界：仅空间所有者可审批；空间管理员(ADMIN)与平台管理员均无审批权限
    if (ws.ownerId !== userId) {
      return NextResponse.json(
        { success: false, error: "仅空间所有者可审批模型使用申请" },
        { status: 403 },
      );
    }

    const { action, rejectReason } = (await request.json()) || {};
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ success: false, error: "非法的审批动作" }, { status: 400 });
    }

    const app = await prisma.modelapplication.findUnique({ where: { id: appId } });
    if (!app || app.workspaceId !== workspaceId) {
      return NextResponse.json({ success: false, error: "未找到对应的申请记录" }, { status: 404 });
    }
    if (app.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "该申请已处理，请勿重复操作" }, { status: 400 });
    }

    const reviewerName = auth.user.name || auth.user.email;
    const modelName = app.modelLabel || app.deploymentId;

    if (action === "REJECT") {
      const r = (rejectReason || "").toString().trim();
      if (r.length < 2) {
        return NextResponse.json({ success: false, error: "拒绝必须填写原因" }, { status: 400 });
      }
      await prisma.modelapplication.update({
        where: { id: appId },
        data: {
          status: "REJECTED",
          reviewerId: userId,
          reviewerName,
          rejectReason: r,
          reviewedAt: new Date(),
        },
      });
      await addNotification(
        app.applicantId,
        "模型使用申请被驳回",
        `您申请使用的模型【${modelName}】未通过审批。原因：${r}`,
        "system",
        `/workspace/${workspaceId}?tab=models`,
      );
      return NextResponse.json({ success: true, data: { status: "REJECTED" } });
    }

    // APPROVE：仅改变该申请人默认模型，不影响其他成员
    await prisma.$transaction([
      prisma.workspace_member_model_preference.upsert({
        where: { workspaceId_userId: { workspaceId, userId: app.applicantId } },
        update: { deploymentId: app.deploymentId, isAuto: false, updatedAt: new Date() },
        create: {
          workspaceId,
          userId: app.applicantId,
          deploymentId: app.deploymentId,
          isAuto: false,
        },
      }),
      prisma.modelapplication.update({
        where: { id: appId },
        data: {
          status: "APPROVED",
          reviewerId: userId,
          reviewerName,
          reviewedAt: new Date(),
        },
      }),
    ]);

    await addNotification(
      app.applicantId,
      "模型使用申请已通过",
      `您申请使用的模型【${modelName}】已审批通过，现已设为您在本空间的默认模型。`,
      "system",
      `/workspace/${workspaceId}?tab=models`,
    );

    return NextResponse.json({ success: true, data: { status: "APPROVED" } });
  } catch (error) {
    console.error("[model-application review] 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "审批失败，请稍后重试" }, { status: 500 });
  }
}
