export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { addNotification } from "@/lib/notifications-store";
import { ADMIN_ROLE_VALUES } from "@/lib/role-utils";

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
      take: 100,
    });

    const requestedTaskIds = new Set(myRequests.map((r) => r.taskId));

    const chargedRows = await prisma.pointledger.findMany({
      where: { userId: user.id, type: "CONSUME", taskId: { not: null } },
      select: {
        taskId: true,
        points: true,
        scope: true,
        componentId: true,
        componentName: true,
        workspaceId: true,
        workspaceName: true,
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
      grouped.set(taskId, {
        points: (prev?.points ?? 0) + Math.abs(Number(row.points)),
        row: prev?.row ?? row,
      });
    }

    // 批量查询关联的任务、组件目录与工作空间信息，补齐任务名称、组件名称、空间名称
    const allTaskIds = Array.from(
      new Set([...Array.from(grouped.keys()), ...myRequests.map((r) => r.taskId)].filter(Boolean))
    );
    const [tasks, components, workspaces] = await Promise.all([
      allTaskIds.length > 0
        ? prisma.componenttask
            .findMany({
              where: { id: { in: allTaskIds } },
              select: { id: true, name: true, type: true, status: true, workspaceId: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.componentcatalog
        .findMany({
          select: { id: true, code: true, name: true },
        })
        .catch(() => []),
      prisma.workspace
        .findMany({
          where: {
            OR: [
              { ownerId: user.id },
              { workspacemember: { some: { userId: user.id } } },
            ],
          },
          select: { id: true, name: true, type: true },
        })
        .catch(() => []),
    ]);

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const compMap = new Map<string, string>();
    for (const c of components) {
      if (c.id) compMap.set(c.id, c.name);
      if (c.code) compMap.set(c.code, c.name);
    }
    const wsMap = new Map(workspaces.map((w) => [w.id, w]));

    const cleanTitle = (raw?: string | null) => {
      if (!raw) return null;
      const trimmed = raw
        .replace(/^组件消耗[：:\s-]*/i, "")
        .replace(/^执行组件[：:\s-]*/i, "")
        .trim();
      return trimmed || raw;
    };

    const candidates = Array.from(grouped.entries())
      .filter(([taskId, v]) => !requestedTaskIds.has(taskId) && v.points > 0)
      .map(([taskId, v]) => {
        const taskInfo = taskMap.get(taskId);
        const compId = v.row.componentId || taskInfo?.type || null;
        const compName =
          v.row.componentName ||
          (compId ? compMap.get(compId) : null) ||
          cleanTitle(v.row.title) ||
          null;
        const wsId = v.row.workspaceId || taskInfo?.workspaceId || null;
        const wsName = v.row.workspaceName || (wsId ? wsMap.get(wsId)?.name : null) || null;
        const taskName =
          taskInfo?.name ||
          compName ||
          cleanTitle(v.row.title) ||
          "组件执行任务";

        return {
          taskId,
          taskName,
          taskStatus: taskInfo?.status || null,
          points: v.points,
          scope: v.row.scope || "WALLET",
          componentId: compId,
          componentName: compName,
          workspaceId: wsId,
          workspaceName: wsName,
          chargedAt: v.row.createdAt,
        };
      });

    const enrichedRequests = myRequests.map((r) => {
      const taskInfo = taskMap.get(r.taskId);
      const ledgerEntry = grouped.get(r.taskId)?.row;
      const compId = r.componentId || ledgerEntry?.componentId || taskInfo?.type || null;
      const compName =
        ledgerEntry?.componentName ||
        (compId ? compMap.get(compId) : null) ||
        cleanTitle(ledgerEntry?.title) ||
        null;
      const wsId = r.workspaceId || ledgerEntry?.workspaceId || taskInfo?.workspaceId || null;
      const wsName = ledgerEntry?.workspaceName || (wsId ? wsMap.get(wsId)?.name : null) || null;
      const taskName =
        taskInfo?.name ||
        compName ||
        cleanTitle(ledgerEntry?.title) ||
        "组件执行任务";

      return {
        ...r,
        points: Number(r.points),
        taskName,
        componentName: compName,
        workspaceName: wsName,
        scope: ledgerEntry?.scope || "WALLET",
      };
    });

    const summary = {
      candidateCount: candidates.length,
      pendingCount: enrichedRequests.filter((r) => r.status === "PENDING").length,
      approvedCount: enrichedRequests.filter((r) => r.status === "APPROVED").length,
      rejectedCount: enrichedRequests.filter((r) => r.status === "REJECTED").length,
      totalRefundedPoints: enrichedRequests
        .filter((r) => r.status === "APPROVED")
        .reduce((sum, r) => sum + Number(r.points || 0), 0),
    };

    return NextResponse.json({
      success: true,
      data: { requests: enrichedRequests, candidates, summary },
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
      const statusLabel =
        exist.status === "PENDING" ? "待审批" : exist.status === "APPROVED" ? "已退回" : "已驳回";
      return NextResponse.json({ error: `该任务已提交过退款申请（当前状态：${statusLabel}）` }, { status: 409 });
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

    // 查询关联任务信息，以便生成清晰明确的消息文案
    const taskRecord = await prisma.componenttask.findUnique({
      where: { id: taskId },
      select: { name: true },
    }).catch(() => null);
    const taskName = taskRecord?.name || "组件执行任务";
    const applicantName = user.name || user.email?.split("@")[0] || "用户";

    // 1. 发送用户端受理通知
    await addNotification(
      user.id,
      "算力点退还申请已受理",
      `您针对任务【${taskName}】提交的退还 ${points} 算力点申请已成功进入审核流程（工单号: ${created.id}），请留意后续审批结果。`,
      "finance",
      "/user/points"
    ).catch((e) => console.warn("[refund-request] 发送用户通知失败:", e?.message));

    // 2. 向系统管理员广播待办通知
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: [...ADMIN_ROLE_VALUES] }, status: "active" },
        select: { id: true },
        take: 10,
      });
      for (const admin of admins) {
        if (admin.id !== user.id) {
          await addNotification(
            admin.id,
            "收到新的算力点退还申请",
            `用户【${applicantName}】针对任务【${taskName}】申请退还 ${points} 算力点，请前往「退款工单」中心审批。`,
            "finance",
            "/admin/finance/refund-requests"
          ).catch(() => {});
        }
      }
    } catch (adminErr) {
      console.warn("[refund-request] 广播管理员通知失败:", (adminErr as Error)?.message);
    }

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("[refund-request] 提交失败:", (error as Error)?.message);
    return NextResponse.json({ error: "提交退款申请失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const id = (request.nextUrl.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ error: "缺少申请记录编号" }, { status: 400 });
    }

    const record = await prisma.refundrequest.findFirst({
      where: { id, userId: user.id },
    });
    if (!record) {
      return NextResponse.json({ error: "未找到对应的退款申请记录" }, { status: 404 });
    }
    if (record.status !== "PENDING") {
      return NextResponse.json({ error: "仅支持撤销待审批状态的退款申请" }, { status: 400 });
    }

    await prisma.refundrequest.delete({
      where: { id: record.id },
    });

    await addNotification(
      user.id,
      "算力点退还申请已撤销",
      `您已主动撤销对任务【${record.taskId}】的算力点退回申请，对应任务已恢复至可申请列表。`,
      "finance",
      "/user/points"
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "已撤销该笔算力点退回申请",
    });
  } catch (error) {
    console.error("[refund-request] 撤销失败:", (error as Error)?.message);
    return NextResponse.json({ error: "撤销退款申请失败" }, { status: 500 });
  }
}
