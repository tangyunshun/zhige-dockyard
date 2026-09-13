import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1/me
 * 开放接口：使用 API Key 获取当前账号概要信息。
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

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      membershipLevel: true,
      avatar: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  let tokenBalance = 0;
  try {
    const personalWs = await prisma.workspace.findFirst({
      where: { ownerId: user.id, type: "PERSONAL" },
      include: { workspacequota: true },
    });
    if (personalWs?.workspacequota) {
      tokenBalance = Number(personalWs.workspacequota.tokenBalance);
    }
  } catch {
    // 忽略配额查询异常，不影响主体信息返回
  }

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      membershipLevel: user.membershipLevel,
      avatar: user.avatar,
      createdAt: user.createdAt,
      tokenBalance,
    },
    auth: { keyId: auth.keyId, keyName: auth.keyName },
  });
}
