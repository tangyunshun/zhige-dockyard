export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { grantPoints } from "@/lib/credit-service";

/**
 * POST /api/admin/refund-requests/[id]/resolve
 *
 * body: { action: "APPROVE" | "REJECT", remark?: string }
 *
 * APPROVE：调用账务层 grantPoints 真正产生 REFUND 流水后退点，并把流水号写回申请单（refundLedgerId），
 *          做到「页面显示已退」与「账务真有一条退款流水」严格一致，杜绝只改状态不入账的假退款。
 * REJECT ：必须填写驳回理由，原样呈现给申请人。
 *
 * 口径说明：本次退点统一退入用户个人钱包（WALLET），该钱包余额跨工作空间通用；
 * 严格「按原扣费分桶逐桶退回」需复用执行期 ConsumeResult 明细，当前版本未实现，界面与流水均如实标注为「退回钱包」。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePlatformPermission(request, "order:read");
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

    const req = await prisma.refundrequest.findUnique({ where: { id } });
    if (!req) return NextResponse.json({ error: "退款申请不存在" }, { status: 404 });
    if (req.status !== "PENDING") {
      return NextResponse.json({ error: `该申请已处理完毕（当前状态：${req.status}），不可重复裁决` }, { status: 409 });
    }

    if (action === "REJECT") {
      await prisma.refundrequest.update({
        where: { id },
        data: { status: "REJECTED", adminId, adminRemark: remark, resolvedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: { status: "REJECTED" } });
    }

    const points = Number(req.points);
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json({ error: "该申请没有可退的点数（可能为 0 扣点任务）" }, { status: 400 });
    }

    // 组件名用于流水标题，便于用户在算力中心一眼看懂这笔退款来自哪个组件
    const component = req.componentId
      ? await prisma.componentcatalog.findUnique({ where: { id: req.componentId }, select: { name: true } })
      : null;

    const grant = await grantPoints({
      scope: "WALLET",
      userId: req.userId,
      points,
      sourceType: "REFUND",
      type: "REFUND",
      title: `退款申请通过：${component?.name || req.componentId || "组件任务"}`,
      componentId: req.componentId ?? null,
      componentName: component?.name ?? null,
      taskId: req.taskId,
      operatorId: adminId,
      remark: `用户退款申请 ${id} 审批通过，退回钱包`,
      // 幂等键：同一张申请单重复提交只会退一次
      idempotencyKey: `USER_REFUND_REQUEST:${id}`,
    });

    const updated = await prisma.refundrequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminId,
        adminRemark: remark || null,
        refundLedgerId: grant.ledgerId,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: { status: "APPROVED", refundLedgerId: grant.ledgerId, refunded: points, updated } });
  } catch (error) {
    console.error("[admin-refund-request] 裁决失败:", (error as Error)?.message);
    return NextResponse.json({ error: "裁决退款申请失败" }, { status: 500 });
  }
}
