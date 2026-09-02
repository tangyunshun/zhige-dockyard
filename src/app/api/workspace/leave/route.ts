import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/security";

/**
 * 协同成员主动退出工作空间 (退群) 接口
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const { workspaceId } = await request.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, type: true, ownerId: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 所有者不能退出空间，所有者只能选择解散空间
    if (workspace.ownerId === userId) {
      return NextResponse.json(
        { error: "空间所有者无法退出空间，请选择注销或转让所有者" },
        { status: 403 }
      );
    }

    // 检查用户是否是该工作空间的成员
    const member = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "您当前不是该工作空间的协同成员" },
        { status: 404 }
      );
    }

    // 移除成员绑定关系
    await prisma.workspacemember.delete({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    // 记录成员主动退群审计日志（非阻断式）
    await writeAuditLog(userId, "member:leave", { workspaceId, workspaceName: workspace.name }, workspaceId, null, request).catch((e) => console.warn("[审计] 成员退群日志写入失败:", e));

    console.log(`[主动退出空间] 用户 ${userId} 成功退出了空间 ${workspaceId}(${workspace.name})`);

    return NextResponse.json({
      success: true,
      message: `您已成功退出 ${workspace.name} 工作空间`,
    });
  } catch (error) {
    console.error("Workspace leave api error:", error);
    return NextResponse.json(
      { error: "退出空间失败，请稍后重试" },
      { status: 500 }
    );
  }
}
