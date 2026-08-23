import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 清空工作空间数据
export async function POST(req: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = req.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error || "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const userId = authResult.user!.id;
    const { workspaceId, confirmText } = await req.json();

    // 验证确认文本
    if (confirmText !== "确认删除" && confirmText !== "确认重置") {
      return NextResponse.json(
        { error: "确认文本不正确" },
        { status: 400 }
      );
    }

    // 验证工作空间 ID
    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    // 验证用户是否有权限管理该工作空间 (Owner 拥有绝对权限，或者在 workspacemember 中是 OWNER/ADMIN)
    const isOwner = workspace.ownerId === userId;
    let isAuthorized = isOwner;

    if (!isAuthorized) {
      const membership = await prisma.workspacemember.findFirst({
        where: {
          userId,
          workspaceId,
          role: {
            in: ["OWNER", "ADMIN"],
          },
        },
      });
      if (membership) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "无权管理该工作空间" },
        { status: 403 }
      );
    }

    // 执行真正的空间数据物理清空重置 (彻底清空该空间下所有历史任务、文档资料与知识规约)
    // 1. 删除组件任务运行历史（任务按 tenantId 关联工作空间）
    await prisma.componenttask.deleteMany({
      where: { tenantId: workspaceId },
    });

    // 2. 删除归档文档资料与分析报告（含 knowledge 类型的知识库条目）
    await prisma.document.deleteMany({
      where: { workspaceId },
    });

    return NextResponse.json({
      success: true,
      message: "工作空间核心业务数据、执行历史与归档文档已全量物理清空重置",
    });
  } catch (error) {
    console.error("Clear workspace data error:", error);
    return NextResponse.json(
      { error: "清空工作空间数据失败" },
      { status: 500 }
    );
  }
}
