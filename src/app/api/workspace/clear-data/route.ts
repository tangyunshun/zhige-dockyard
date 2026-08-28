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

    // 执行真正的空间数据物理清空重置 (彻底清空该空间下所有历史任务、组件装配、文档资料与知识规约)
    // 1. 删除组件任务运行历史（任务按 tenantId 关联工作空间）
    await prisma.componenttask.deleteMany({
      where: { tenantId: workspaceId },
    });

    // 2. 删除组件装配绑定与装配历史记录
    await prisma.componentusage.deleteMany({
      where: { workspaceId },
    });

    // 3. 删除归档文档资料与分析报告（含 knowledge 类型的知识库条目）
    await prisma.document.deleteMany({
      where: { workspaceId },
    });

    // 4. 删除该空间的历史操作审计日志 (确保空间彻底还原为物理出厂初始状态)
    await prisma.operationlog.deleteMany({
      where: { workspaceId },
    });

    // 5. 更新工作空间的 updatedAt 时间戳为最新的重置时间 (独立 try-catch 保证绝对写入成功)
    try {
      const resetTime = new Date();
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { updatedAt: resetTime },
      });
      console.log(`[clear-data] 工作空间 ${workspaceId} updatedAt 成功更新为: ${resetTime.toISOString()}`);
    } catch (updateErr) {
      console.error(`[clear-data] 更新工作空间 ${workspaceId} updatedAt 失败:`, updateErr);
    }

    // 6. 对个人空间自动进行出厂默认组件装配恢复 (百分百重新自动装配 5 个初始化默认通用效能组件)
    if (workspace.type === "PERSONAL") {
      const { ensureDefaultComponents } = await import("@/lib/workspaceInit");
      await ensureDefaultComponents(workspaceId, userId);
    }

    return NextResponse.json({
      success: true,
      message: "个人空间已成功物理重置为纯净出厂状态，5 个出厂默认组件已重新装配",
      resetAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Clear workspace data error:", error);
    return NextResponse.json(
      { error: "清空工作空间数据失败" },
      { status: 500 }
    );
  }
}
