import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PUT /api/workspace/[id]/model-preference
 *
 * 保存当前成员在本空间的「仅我使用」模型偏好（个人默认）。
 * 仅影响本人：不改空间默认模型配置，也不影响其他成员。
 * 快速任务等依赖后端 resolveDefaultDeployment 的路径会读取此偏好作为最高优先级。
 *
 * body: { deploymentId?: string | null, isAuto?: boolean }
 *  - isAuto=true（或 deploymentId 为空）：恢复为空间默认（自动调度）
 *  - isAuto=false + deploymentId：显式指定个人默认模型（可为 byo:<workspaceId> 或系统部署 id）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;
    // Next.js 15：动态路由 params 为 Promise，必须 await（同步访问将得到 undefined）
    const { id: workspaceId } = await params;
    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "缺少 workspaceId" }, { status: 400 });
    }

    // 必须为空间成员或空间所有者（与 available-models 路由的权限口径一致：
    // 空间所有者未必存在于 workspacemember 表，但同样允许设置个人偏好）
    const [ws, member] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
      prisma.workspacemember.findFirst({ where: { workspaceId, userId }, select: { id: true } }),
    ]);
    if (!ws || (ws.ownerId !== userId && !member)) {
      return NextResponse.json({ success: false, error: "无权访问该工作空间，无法设置模型偏好" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const deploymentId: string | null =
      typeof body.deploymentId === "string" && body.deploymentId.length > 0 ? body.deploymentId : null;
    const isAuto: boolean = body.isAuto === true || deploymentId === null;

    // deploymentId 在库中为必填列（NOT NULL）：恢复为空间默认时以空字符串表示"未指定具体模型"，
    // 读取侧以 isAuto 为准、空值按"无显式偏好"处理
    if (isAuto) {
      await prisma.workspace_member_model_preference.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: { isAuto: true, deploymentId: "", updatedAt: new Date() },
        create: { workspaceId, userId, isAuto: true, deploymentId: "" },
      });
    } else {
      await prisma.workspace_member_model_preference.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: { isAuto: false, deploymentId, updatedAt: new Date() },
        create: { workspaceId, userId, isAuto: false, deploymentId },
      });
    }

    return NextResponse.json({ success: true, data: { workspaceId, userId, deploymentId, isAuto } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "保存模型偏好失败" },
      { status: 500 },
    );
  }
}
