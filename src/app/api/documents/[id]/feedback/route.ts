import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * 查询当前登录用户对某文档的投票（用于前端回显“已提交”与自身票型）。
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = auth.user.id;

  const [existing, doc] = await Promise.all([
    prisma.systemdocumentfeedback.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
    }),
    prisma.systemdocument.findUnique({ where: { id }, select: { helpfulCount: true } }),
  ]);

  return NextResponse.json({
    success: true,
    myVote: existing?.vote || null,
    helpfulCount: doc?.helpfulCount || 0,
  });
}

/**
 * 提交/改票：登录用户才能评价。upsert 覆盖本人票型；
 * 写完后真实重算 helpfulCount = 该文档 HELPFUL 票数（NOT_HELPFUL 不计入），并落操作日志。
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = auth.user.id;

  const body = await request.json().catch(() => ({}));
  const vote = body?.vote;
  if (vote !== "HELPFUL" && vote !== "NOT_HELPFUL") {
    return NextResponse.json({ error: "无效的投票类型" }, { status: 400 });
  }

  const doc = await prisma.systemdocument.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  // ADMIN_ONLY 文档对非管理员不可交互（防按 id 越权探测）
  const auth0 = await validateUser(request.headers.get("Authorization"), request);
  const isAdmin0 = auth0.valid && isAdminRole((auth0.user as { role?: string }).role);
  if (doc.visibility === "ADMIN_ONLY" && !isAdmin0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  // upsert：同 (documentId, userId) 改票覆盖，保证一人一票且可改票
  await prisma.systemdocumentfeedback.upsert({
    where: { documentId_userId: { documentId: id, userId } },
    create: { documentId: id, userId, vote },
    update: { vote },
  });

  // 真实重算 helpfulCount：仅统计 HELPFUL 票数（NOT_HELPFUL 不影响点赞数）
  const helpfulAgg = await prisma.systemdocumentfeedback.aggregate({
    where: { documentId: id, vote: "HELPFUL" },
    _count: { _all: true },
  });
  const helpfulCount = helpfulAgg._count._all;

  await prisma.systemdocument.update({
    where: { id },
    data: { helpfulCount },
  });

  await prisma.operationlog.create({
    data: {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      action: "DOC_FEEDBACK",
      resource: "SYSTEM_DOCUMENT",
      details: { documentId: id, vote, helpfulCount },
    },
  }).catch((err) => {
    console.warn("[文档反馈] 操作日志非阻断提示:", err);
  });

  return NextResponse.json({ success: true, helpfulCount, myVote: vote });
}
