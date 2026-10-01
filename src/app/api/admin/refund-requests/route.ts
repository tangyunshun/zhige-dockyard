export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/**
 * GET /api/admin/refund-requests?status=PENDING
 *
 * 管理员查看用户提交的退款申请（默认返回待审批）。
 * 同时带上申请人邮箱、组件名与任务标题，方便管理员核验「是不是真的该退」。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "order:read");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const status = (request.nextUrl.searchParams.get("status") || "PENDING").trim().toUpperCase();
    const where = status && status !== "ALL" ? { status } : {};

    const rows = await prisma.refundrequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const taskIds = Array.from(new Set(rows.map((r) => r.taskId)));
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));

    const [tasks, users] = await Promise.all([
      taskIds.length
        ? prisma.componenttask.findMany({ where: { id: { in: taskIds } }, select: { id: true, name: true, status: true } })
        : [],
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
        : [],
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        points: Number(r.points),
        taskName: taskMap.get(r.taskId)?.name ?? null,
        taskStatus: taskMap.get(r.taskId)?.status ?? null,
        applicant: userMap.get(r.userId) ?? null,
      })),
    });
  } catch (error) {
    console.error("[admin-refund-request] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ error: "查询退款申请失败" }, { status: 500 });
  }
}
