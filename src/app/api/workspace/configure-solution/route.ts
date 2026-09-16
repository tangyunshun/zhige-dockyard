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

    // 结构化持久化：不再向 description 文本写入方案标记（避免把描述字段当元数据存储），
    // 方案信息以 CONFIGURE_SOLUTION 操作日志为权威来源（见本文件 GET）。
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
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

/**
 * 结构化读取：以 CONFIGURE_SOLUTION 操作日志为权威来源，
 * 返回「工作空间 -> 已配置方案」映射（每个空间取最新一条）。
 * 取代此前从 workspace.description 文本正则解析的脆弱做法。
 */
export async function GET(request: NextRequest) {
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

    const logs = await prisma.operationlog.findMany({
      where: { userId, action: "CONFIGURE_SOLUTION", workspaceId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { workspaceId: true, resource: true },
    });

    const configs: Record<string, string> = {};
    for (const log of logs) {
      if (log.workspaceId && log.resource && !configs[log.workspaceId]) {
        configs[log.workspaceId] = log.resource;
      }
    }

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    console.error("Get configured solutions error:", error);
    return NextResponse.json({ error: "读取方案配置失败" }, { status: 500 });
  }
}
