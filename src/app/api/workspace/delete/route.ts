import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireStepUp } from "@/lib/step-up";

export async function DELETE(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, verifyToken } = body;
    const action = body.action || "DEACTIVATE";

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    if (!["DELETE", "DEACTIVATE"].includes(action)) {
      return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
    }

    // 获取工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 验证权限
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权删除该工作空间" }, { status: 403 });
    }

    // 检查工作空间依赖 (区分企业空间与个人空间，对齐真实装配口径)
    const otherMembers = workspace.workspacemember.filter((m: any) => m.userId !== userId);
    const rawUsages = await prisma.componentusage.findMany({
      where: { workspaceId },
      select: { metadata: true },
    });
    const assetCount = rawUsages.filter((u: any) => {
      if (!u.metadata) return false;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
        if (meta && typeof meta.enabled === "boolean") return meta.enabled === true;
      } catch {}
      return false;
    }).length;

    if (workspace.type === "ENTERPRISE") {
      if (otherMembers.length > 0 || assetCount > 0) {
        return NextResponse.json(
          { error: "当前企业空间内仍存有授权组件资产或协作团队成员，请先将其清空/移出后再申请解散。" },
          { status: 400 }
        );
      }
    } else if (workspace.type === "PERSONAL") {
      const activeTaskCount = await prisma.componenttask.count({
        where: { tenantId: workspaceId, status: { in: ["IN_PROGRESS", "PENDING"] } },
      });
      if (assetCount > 0 || activeTaskCount > 0) {
        return NextResponse.json(
          { error: "当前个人空间内仍存有未解绑组件资产或未完成任务，请先将其清空后再申请注销。" },
          { status: 400 }
        );
      }
    }

    // 根据 action 执行不同的操作
    if (action === "DELETE") {
      // 验证二次鉴权令牌 (SCENARIO_033 / PRD E-04，DB 化一次性令牌)
      const stepUp = await requireStepUp(request, "delete_workspace", userId, { verifyToken });
      if (!stepUp.ok) {
        return NextResponse.json(
          {
            error: stepUp.error,
            message:
              stepUp.error === "SEC_AUTH_REQUIRED"
                ? "此高危操作需要进行二次身份验证"
                : "验证令牌无效或已过期，请重新验证",
          },
          { status: stepUp.status }
        );
      }

      // 删除工作空间
      await prisma.workspace.delete({
        where: { id: workspaceId },
      });
    } else if (action === "DEACTIVATE") {
      // 禁用工作空间
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { status: "DISABLED" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json({ error: "删除工作空间失败" }, { status: 500 });
  }
}
