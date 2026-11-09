export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { addNotification } from "@/lib/notifications-store";

/**
 * POST /api/admin/refund-requests/[id]/resolve
 *
 * body: { action: "APPROVE" | "REJECT", remark?: string }
 *
 * [R0-D / 原方案 F07 止损]
 * - APPROVE / REJECT 均要求既有专用审批权限 order:refund_approve（high 级「终审并将资金原路退回」），
 *   不再使用只读的 order:read；权限在读取指定申请与任何业务写之前检查。
 * - 人工 APPROVE 当前无法证明「净可退额度」与「原扣款来源」（申请只累计 CONSUME，
 *   未扣除既有自动退点，也不区分企业/赠送来源），统一返回 409 非成功暂停响应：
 *   在读取申请、grantPoints、钱包/池/桶/流水/账单写、APPROVED 状态变更及成功通知之前拒绝。
 *   不新增开关、角色后门或旁路接口；自动任务失败原路退点实现不受影响。
 * - REJECT 沿用理由校验与 PENDING 限制，按 PENDING 条件裁决并检查 count；不产生任何退款加点。
 */
const REFUND_APPROVE_PERMISSION = "order:refund_approve";
const MANUAL_REFUND_APPROVAL_PAUSED = "MANUAL_REFUND_APPROVAL_PAUSED";
const MANUAL_REFUND_APPROVAL_MESSAGE =
  "人工批准退点暂不可用，申请保留待核查；不会因此重复退点或转入个人钱包";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 权限前置：APPROVE / REJECT 都是资金/工单裁决，必须持有既有专用审批权限；
    // 只读的 order:read 只能查询工单。此检查在读取指定申请和任何业务写之前完成。
    const auth = await requirePlatformPermission(request, REFUND_APPROVE_PERMISSION);
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const adminId = (auth as { user?: { id?: string } }).user?.id ?? null;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { action?: string; remark?: string };
    const action = String(body.action || "").toUpperCase();
    const remark = (body.remark || "").trim();

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ error: "裁决动作必须为 APPROVE 或 REJECT" }, { status: 400 });
    }
    if (action === "REJECT" && remark.length < 5) {
      return NextResponse.json({ error: "驳回必须填写理由（至少 5 个字），以便申请人知悉原因" }, { status: 400 });
    }

    // [R0-D] 人工批准加点统一暂停：在读取申请、grantPoints、任何资产写、
    // APPROVED 状态变更与成功通知之前返回，零业务写；不泄露申请/余额信息。
    if (action === "APPROVE") {
      return NextResponse.json(
        {
          success: false,
          code: MANUAL_REFUND_APPROVAL_PAUSED,
          error: MANUAL_REFUND_APPROVAL_MESSAGE,
        },
        { status: 409 },
      );
    }

    // 以下仅处理 REJECT（合法驳回仍可用，不产生任何退款加点）
    const req = await prisma.refundrequest.findUnique({ where: { id } });
    if (!req) return NextResponse.json({ error: "退款申请不存在" }, { status: 404 });
    if (req.status !== "PENDING") {
      return NextResponse.json({ error: `该申请已处理完毕（当前状态：${req.status}），不可重复裁决` }, { status: 409 });
    }

    // PENDING 条件裁决并检查 count：避免旧读覆盖新状态（不重做全站工单状态机）
    const rejected = await prisma.refundrequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", adminId, adminRemark: remark, resolvedAt: new Date() },
    });
    if (rejected.count !== 1) {
      const latest = await prisma.refundrequest.findUnique({ where: { id } });
      return NextResponse.json(
        { error: `该申请已被处理或状态变化（当前状态：${latest?.status ?? "不存在"}），不可重复裁决` },
        { status: 409 },
      );
    }
    await writeAuditLog(adminId, "refund:resolve", { id, action: "REJECT", remark }, null, null, request);

    // 查询任务名称，生成清晰驳回通知（如实显示，不含任何退款到账承诺）
    const task = await prisma.componenttask.findUnique({
      where: { id: req.taskId },
      select: { name: true },
    }).catch(() => null);
    const taskName = task?.name || req.taskId;

    await addNotification(
      req.userId,
      "算力点退还申请未通过",
      `您针对任务【${taskName}】提交的退还 ${req.points} 算力点申请未能通过审批。处理说明：${remark}。`,
      "finance",
      "/user/points"
    ).catch((e) => console.warn("[refund-resolve] 发送用户驳回通知失败:", e?.message));
    return NextResponse.json({ success: true, data: { status: "REJECTED" } });
  } catch (error) {
    console.error("[admin-refund-request] 裁决失败:", (error as Error)?.message);
    return NextResponse.json({ error: "裁决退款申请失败" }, { status: 500 });
  }
}
