import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 按关键词一键拉取所有匹配用户 ID（用于「一键全部添加」场景）
 * 返回的 id 数组将直接进入定向发送池，不再逐个显示个体
 * 限制：单次最多返回 MAX_MATCHES 个 ID，超出时给出 moreAvailable 标志
 */

const MAX_MATCHES = 50000;

async function requireAdmin(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !isAdminRole(user.role)) {
    return { error: NextResponse.json({ error: "权限不足" }, { status: 403 }) };
  }
  return { admin: user };
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const body = await request.json().catch(() => ({}));
    const keyword = String(body.keyword || "").trim();
    if (!keyword) {
      return NextResponse.json({ error: "请提供搜索关键词" }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: keyword } },
          { email: { contains: keyword } },
          { phone: { contains: keyword } },
        ],
      },
      select: { id: true },
      take: MAX_MATCHES + 1,
    });

    const moreAvailable = users.length > MAX_MATCHES;
    const ids = users.slice(0, MAX_MATCHES).map((u) => u.id);

    return NextResponse.json({
      success: true,
      ids,
      total: users.length,
      moreAvailable,
    });
  } catch (error) {
    console.error("Search ids error:", error);
    return NextResponse.json(
      { error: "搜索匹配用户失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}