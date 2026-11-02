import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 浏览量真实化（去重口径）：
 * - 服务端按 “观众 + 文档” 在 24 小时内只计一次（+1）。
 * - 观众标识：登录用户用 userId；未登录访客用持久化于 Cookie 的匿名 id（zhige_anon_id），
 *   保证每浏览器每文档 24h 仅 +1，杜绝此前“可无限刷”的虚假浏览量。
 * - 去重状态存于进程内 Map（单实例 / 重启或扩缩容会重置窗口）。如需跨实例精确去重，
 *   应改走持久化去重表；当前按审计需求采用轻量内存口径。
 */
const VIEW_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const viewDedupMap = new Map<string, number>();

const ANON_COOKIE = "zhige_anon_id";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const documentId: string | undefined = body?.documentId;
  if (!documentId) {
    return NextResponse.json({ error: "缺少 documentId" }, { status: 400 });
  }

  const doc = await prisma.systemdocument.findUnique({
    where: { id: documentId },
    select: { id: true, viewCount: true, visibility: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  // ADMIN_ONLY 文档对非管理员不计数也不暴露存在性
  const auth0 = await validateUser(request.headers.get("Authorization"), request);
  const isAdmin0 = auth0.valid && isAdminRole((auth0.user as { role?: string }).role);
  if (doc.visibility === "ADMIN_ONLY" && !isAdmin0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  // 解析观众标识：登录用户优先，否则匿名 Cookie
  const auth = await validateUser(request.headers.get("Authorization"), request);
  let viewerId: string;
  let anonToSet: string | null = null;
  if (auth.valid && auth.user) {
    viewerId = `u_${auth.user.id}`;
  } else {
    let anon = request.cookies.get(ANON_COOKIE)?.value;
    if (!anon) {
      anon = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      anonToSet = anon;
    }
    viewerId = anon;
  }

  const key = `${viewerId}:${documentId}`;
  const now = Date.now();
  const lastCounted = viewDedupMap.get(key) || 0;

  let counted = false;
  let viewCount = doc.viewCount;

  if (now - lastCounted >= VIEW_DEDUP_WINDOW_MS) {
    viewDedupMap.set(key, now);
    const updated = await prisma.systemdocument.update({
      where: { id: documentId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    viewCount = updated.viewCount;
    counted = true;
  }

  const res = NextResponse.json({ success: true, counted, viewCount });
  if (anonToSet) {
    res.cookies.set(ANON_COOKIE, anonToSet, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });
  }
  return res;
}
