import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1/workspaces
 * 开放接口：使用 API Key 获取当前账号可访问的工作空间列表（只读）。
 * 鉴权：Authorization: Bearer <API_KEY> 或 x-api-key: <API_KEY>
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "无效或缺失的 API Key" },
      { status: 401 },
    );
  }

  try {
    const [memberships, owned] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId: auth.userId },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
              createdAt: true,
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      }),
      prisma.workspace.findMany({
        where: { ownerId: auth.userId },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

    const map = new Map<string, any>();
    for (const m of memberships) {
      map.set(m.workspace.id, {
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        description: m.workspace.description,
        role: m.role,
        createdAt: m.workspace.createdAt,
      });
    }
    for (const w of owned) {
      const existing = map.get(w.id);
      map.set(w.id, {
        id: w.id,
        name: w.name,
        type: w.type,
        description: w.description,
        role: existing?.role || "OWNER",
        createdAt: w.createdAt,
      });
    }

    const workspaces = Array.from(map.values());
    return NextResponse.json({
      success: true,
      total: workspaces.length,
      data: workspaces,
      auth: { keyId: auth.keyId, keyName: auth.keyName },
    });
  } catch (error) {
    console.error("[open/v1/workspaces] 查询失败:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
