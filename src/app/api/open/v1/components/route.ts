import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1/components
 * 开放接口：获取平台已上架的组件目录（只读）。
 * 鉴权：Authorization: Bearer <API_KEY> 或 x-api-key: <API_KEY>
 *
 * 安全约束：仅返回公开可读字段，不下发任何合同内部结构与模型/密钥信息。
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "无效或缺失的 API Key" }, { status: 401 });
  }

  const rows = await prisma.componentcatalog.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      icon: true,
      inputMode: true,
    },
  });

  return NextResponse.json({
    success: true,
    total: rows.length,
    data: rows,
    auth: { keyId: auth.keyId, keyName: auth.keyName },
  });
}
