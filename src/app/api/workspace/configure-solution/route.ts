import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const authResult = await validateUser(authHeader);
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, solutionName } = body;

    if (!workspaceId || !solutionName) {
      return NextResponse.json({ error: "缺少工作空间 ID 或方案名称" }, { status: 400 });
    }

    // 验证空间所有权
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权访问此工作空间" }, { status: 403 });
    }

    // 清理原有的部署前缀并更新 description
    let rawDesc = workspace.description || "";
    rawDesc = rawDesc.replace(/\[已部署方案:\s*\w+\]\s*/g, ""); // 清理可能存在的旧前缀
    const newDescription = `[已部署方案: ${solutionName}] ${rawDesc}`.trim();

    // 1. 更新工作空间的 description
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        description: newDescription,
        updatedAt: new Date(),
      },
    });

    // 2. 写入操作日志以持久化审计 (数据库记录)
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        workspaceId,
        action: "CONFIGURE_SOLUTION",
        resource: solutionName,
        details: {
          solution: solutionName,
          workspaceName: workspace.name,
          configuredAt: new Date(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      workspace: updated,
      message: `方案 ${solutionName} 已成功部署并持久化到数据库！`,
    });
  } catch (error) {
    console.error("Configure solution error:", error);
    return NextResponse.json(
      { error: "配置方案失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
