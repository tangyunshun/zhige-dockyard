export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 用户自助退款申请（只退「算力点」，不涉及任何真实资金）
 *
 * GET  /api/user/refund-requests      返回「我的申请记录」+「可申请退款的任务清单」
 * POST /api/user/refund-requests      提交退款申请（body: { taskId, reason }）
 *
 * 可申请清单口径：取本人 CONSUME 扣点流水中带 taskId 的记录，按任务汇总实际扣点数，
 * 已申请过的任务不再出现在候选里（同一个任务同一用户仅允许一条申请）。
 */
async function requireAuth(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) return null;
  return auth.user;
}

/** 汇总某个任务对该用户实际扣除的算力点（CONSUME 流水取绝对值累加） */
function sumCharged(rows: { points: bigint | number }[]): number {
  return rows.reduce((sum, r) => sum + Math.abs(Number(r.points)), 0);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const myRequests = await prisma.refundrequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const requestedTaskIds = new Set(myRequests.map((r) => r.taskId));

    const chargedRows = await prisma.pointledger.findMany({
      where: { userId: user.id, type: "CONSUME", taskId: { not: null } },
      select: {
        taskId: true,
        points: true,
        componentId: true,
        componentName: true,
        workspaceId: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    // 按任务聚合：同一任务可能从多个分桶扣点，需合并为一个候选
    const grouped = new Map<string, { points: number; row: (typeof chargedRows)[number] }>();
    for (const row of chargedRows) {
      const taskId = row.taskId as string;
      const prev = grouped.get(taskId);
      grouped.set(taskId, { points: (prev?.points ?? 0) + Math.abs(Number(row.points)), row });
    }

    const candidates = Array.from(grouped.entries())
      .filter(([taskId]) => !requestedTaskIds.has(taskId))
      .map(([taskId, v]) => ({
        taskId,
        points: v.points,
        componentId: v.row.componentId,
        componentName: v.row.componentName,
        workspaceId: v.row.workspaceId,
        chargedAt: v.row.createdAt,
      }));

    return NextResponse.json({
      success: true,
      data: { requests: myRequests, candidates },
    });
  } catch (error) {
    console.error("[refund-request] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ error: "查询退款申请失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { taskId?: string; reason?: string };
    const taskId = (body.taskId || "").trim();
    const reason = (body.reason || "").trim();

    if (!taskId) return NextResponse.json({ error: "请指定要申请退款的任务" }, { status: 400 });
    if (reason.length < 5) return NextResponse.json({ error: "请填写退款原因（至少 5 个字）" }, { status: 400 });
    if (reason.length > 500) return NextResponse.json({ error: "退款原因不能超过 500 字" }, { status: 400 });

    // 只认本人真实的扣点流水，杜绝替他人任务申请
    const rows = await prisma.pointledger.findMany({
      where: { userId: user.id, taskId, type: "CONSUME" },
      select: { points: true, componentId: true, workspaceId: true },
    });
    const points = sumCharged(rows);
    if (points <= 0) {
      return NextResponse.json({ error: "该任务没有属于你的可退扣点记录" }, { status: 400 });
    }

    const exist = await prisma.refundrequest.findFirst({ where: { taskId, userId: user.id } });
    if (exist) {
      return NextResponse.json({ error: `该任务已提交过退款申请（当前状态：${exist.status}）` }, { status: 409 });
    }

    const created = await prisma.refundrequest.create({
      data: {
        id: randomUUID(),
        taskId,
        userId: user.id,
        workspaceId: rows[0]?.workspaceId ?? null,
        componentId: rows[0]?.componentId ?? null,
        points,
        reason,
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("[refund-request] 提交失败:", (error as Error)?.message);
    return NextResponse.json({ error: "提交退款申请失败" }, { status: 500 });
  }
}
