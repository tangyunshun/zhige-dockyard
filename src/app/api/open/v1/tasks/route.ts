import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1/tasks?limit=20
 * 开放接口：获取「该 API Key 所属账号」最近发起的组件任务列表（只读）。
 * 鉴权：Authorization: Bearer <API_KEY> 或 x-api-key: <API_KEY>
 *
 * 安全约束：但凡越权一律返回空或 401；任务结果正文不在列表接口返回，
 * 需调用方另行在站内查看（避免开放接口成为成果物泄露面）。
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "无效或缺失的 API Key" }, { status: 401 });
  }

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;

  const rows = await prisma.componenttask.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      tenantId: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    total: rows.length,
    data: rows,
    auth: { keyId: auth.keyId, keyName: auth.keyName },
  });
}
