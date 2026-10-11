import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1/tasks/:id
 * 开放接口：查询「该 API Key 所属账号」某一组件任务的进度与结果（轮询端点）。
 *
 * 权限边界：以 auth.userId + id 强校验，越权一律 404（不暴露他人任务存在性）。
 * 渠道对账：返回 config.channel（开放接口执行固定为 "OPEN_API"），便于区分来源。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "无效或缺失的 API Key" },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "缺少任务 id" }, { status: 400 });
  }

  const task = await prisma.componenttask.findFirst({
    where: { id, userId: auth.userId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      config: true,
      result: true,
      tenantId: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!task) {
    return NextResponse.json(
      { error: "TASK_NOT_FOUND", message: "任务不存在或不属于当前账号" },
      { status: 404 },
    );
  }

  const config = (typeof task.config === "object" && task.config ? task.config : {}) as Record<string, any>;

  return NextResponse.json({
    success: true,
    data: {
      taskId: task.id,
      name: task.name,
      type: task.type,
      status: task.status,
      workspaceId: task.tenantId,
      channel: config.channel ?? null,
      contractVersion: config.contractVersion ?? null,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      result: task.result,
    },
    auth: { keyId: auth.keyId, keyName: auth.keyName },
  });
}
