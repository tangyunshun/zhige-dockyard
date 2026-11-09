export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isPlatformAdminRole, requirePlatformPermission, writeAuditLog } from "@/lib/security";

/**
 * 后台「线下充值工单」管理（对公转账 / 合同结算闭环）
 *
 * GET   /api/admin/recharge-orders           查看全平台工单（可按 status / workspaceId 过滤）
 * PATCH /api/admin/recharge-orders           审批动作
 *   action:
 *     APPROVE      待审批 → 审批通过（待收款）
 *     REJECT       待审批/待收款 → 驳回（需填写 reviewNote）
 *     CONFIRM_PAID 待收款 → 已收款并自动入账（见 M02：当前暂停，零资金副作用）
 *
 * [R0 / 原方案 F16 · M02 止损]
 * - APPROVE/REJECT/CONFIRM_PAID 各自检查最小专用动作权限：recharge_order:approve /
 *   recharge_order:reject / recharge_order:confirm_paid；并保留 order:manage / order:audit 作为
 *   审批/驳回的兼容粗粒度键（requirePlatformPermission 的 OR 语义）。**删除**原先把
 *   order:refund_approve / order:refund_apply（退款申请权限）当作充值审批放行的错误；
 *   退款申请权限不得用于确认充值。
 * - 工单状态按条件裁决（updateMany + count 检查），避免「先读后无条件 update」覆盖并发动作。
 * - CONFIRM_PAID：当前不存在可核验收款来源或批准规则，明确暂停并零资金/权益/成功账单副作用，
 *   保留待处理工单；请求中的备注/上传图片/流水号/paid=true 均非「已核验收款事实」。
 *   本动作不参与 grantPoints / 账单写入 / 工单状态变更。
 */

// APPROVE/REJECT 兼容的既有审批权限（粗粒度），与专用 recharge_order:* 键 OR 放行
const REVIEW_COMPAT_PERMS = ["order:manage", "order:audit"] as const;

export async function GET(request: NextRequest) {
  try {
    // 细粒度权限：order:detail ∨ 兼容 order:read
    const permCheck = await requirePlatformPermission(request, "order:detail", "order:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限查看充值订单" }, { status: 403 });
    }
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可查看充值工单" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    // 导出用途（export=1）需额外持有 billing:export，超级管理员自动放行
    if (searchParams.get("export") === "1") {
      const exportAuth = await requirePlatformPermission(request, "billing:export");
      if (!exportAuth.authorized) {
        return exportAuth.errorResponse || NextResponse.json({ error: "无权限导出充值订单" }, { status: 403 });
      }
    }
    const status = searchParams.get("status");
    const workspaceId = searchParams.get("workspaceId");
    // KN-UI：服务端分页（自查清单指令八）；export=1 保持全量口径
    const isExport = searchParams.get("export") === "1";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50") || 50));
    const where = {
      ...(status ? { status } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    };

    const [orders, total, statusGroups, paidAgg] = await Promise.all([
      prisma.tokenrechargeorder.findMany({
        where,
        ...(isExport
          ? { take: 200 }
          : { skip: (page - 1) * pageSize, take: pageSize }),
      } as any),
      prisma.tokenrechargeorder.count({ where }),
      prisma.tokenrechargeorder.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.tokenrechargeorder.aggregate({
        where: { status: "PAID" },
        _sum: { amountCents: true },
      }),
    ]);

    const applicantIds = Array.from(new Set(orders.map((o) => o.applicantId)));
    const applicants = applicantIds.length
      ? await prisma.user.findMany({
          where: { id: { in: applicantIds } },
          select: { id: true, name: true, email: true },
        }).catch(() => [])
      : [];

    const applicantMap = new Map<string, string>();
    (applicants as any[]).forEach((u) => applicantMap.set(u.id, u.name || u.email || "未知用户"));

    const list = orders
      .map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        workspaceId: o.workspaceId,
        workspaceName: o.workspaceName,
        scope: o.scope,
        applicantId: o.applicantId,
        applicantName: o.applicantName || applicantMap.get(o.applicantId) || "未知用户",
        packName: o.packName,
        points: Number(o.points),
        amountCents: o.amountCents,
        paymentMethod: o.paymentMethod,
        invoiceTitle: o.invoiceTitle,
        taxNo: o.taxNo,
        bankName: o.bankName,
        bankAccount: o.bankAccount,
        remark: o.remark,
        status: o.status,
        reviewerName: o.reviewerName,
        reviewNote: o.reviewNote,
        createdAt: o.createdAt.toISOString(),
        reviewedAt: o.reviewedAt ? o.reviewedAt.toISOString() : null,
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      }))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    const countBy = new Map(statusGroups.map((g) => [g.status, g._count._all]));
    const stats = {
      pending: countBy.get("PENDING") || 0,
      approved: countBy.get("APPROVED") || 0,
      paid: countBy.get("PAID") || 0,
      rejected: countBy.get("REJECTED") || 0,
      paidAmountCents: Number(paidAgg._sum.amountCents || 0),
    };
    const totalAll = isExport ? list.length : total;
    const totalPages = Math.ceil(totalAll / pageSize) || 1;

    return NextResponse.json(
      {
        success: true,
        orders: list,
        stats,
        total: totalAll,
        page: isExport ? 1 : page,
        pageSize: isExport ? list.length : pageSize,
        totalPages: isExport ? 1 : totalPages,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("后台查询充值工单失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可审批充值工单" }, { status: 403 });
    }

    const body = await request.json();
    const { id, action, reviewNote } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "缺少工单 ID 或审批动作" }, { status: 400 });
    }

    const order = await prisma.tokenrechargeorder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "未找到该充值工单" }, { status: 404 });
    }

    const reviewer = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { name: true },
    });
    const reviewerName = reviewer?.name || auth.user.id;

    if (action === "APPROVE") {
      // 专用动作权限 + 兼容粗粒度审批权限；退款申请权限不在放行列表
      const pa = await requirePlatformPermission(
        request,
        "recharge_order:approve",
        ...REVIEW_COMPAT_PERMS,
      );
      if (!pa.authorized) {
        return pa.errorResponse || NextResponse.json({ error: "无权限审批充值工单" }, { status: 403 });
      }
      if (order.status !== "PENDING") {
        return NextResponse.json(
          { error: `该工单已被处理或状态变化（当前状态：${order.status}），不可审批` },
          { status: 409 },
        );
      }
      // 条件裁决：WHERE 携带当前状态，避免并发覆盖
      const updated = await prisma.tokenrechargeorder.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "APPROVED",
          reviewerId: auth.user.id,
          reviewerName,
          reviewNote: reviewNote || null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const latest = await prisma.tokenrechargeorder.findUnique({ where: { id } });
        return NextResponse.json(
          { error: `该工单已被处理或状态变化（当前状态：${latest?.status ?? "不存在"}），不可审批` },
          { status: 409 },
        );
      }
      await writeAuditLog(
        auth.user.id,
        "billing:recharge_order_approve",
        { orderId: order.id, orderNo: order.orderNo, action: "APPROVE" },
        order.workspaceId,
        null,
        request,
      );
      return NextResponse.json({ success: true, message: "工单已审批通过，等待确认收款" });
    }

    if (action === "REJECT") {
      const pa = await requirePlatformPermission(
        request,
        "recharge_order:reject",
        ...REVIEW_COMPAT_PERMS,
      );
      if (!pa.authorized) {
        return pa.errorResponse || NextResponse.json({ error: "无权限驳回充值工单" }, { status: 403 });
      }
      if (order.status !== "PENDING" && order.status !== "APPROVED") {
        return NextResponse.json({ error: "该工单当前状态不可驳回" }, { status: 400 });
      }
      if (!reviewNote || !String(reviewNote).trim()) {
        return NextResponse.json({ error: "驳回必须填写审批意见" }, { status: 400 });
      }
      const updated = await prisma.tokenrechargeorder.updateMany({
        where: { id, status: { in: ["PENDING", "APPROVED"] } },
        data: {
          status: "REJECTED",
          reviewerId: auth.user.id,
          reviewerName,
          reviewNote: String(reviewNote).trim(),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const latest = await prisma.tokenrechargeorder.findUnique({ where: { id } });
        return NextResponse.json(
          { error: `该工单已被处理或状态变化（当前状态：${latest?.status ?? "不存在"}），不可驳回` },
          { status: 409 },
        );
      }
      await writeAuditLog(
        auth.user.id,
        "billing:recharge_order_reject",
        { orderId: order.id, orderNo: order.orderNo, action: "REJECT", reviewNote: String(reviewNote).trim() },
        order.workspaceId,
        null,
        request,
      );
      return NextResponse.json({ success: true, message: "工单已驳回" });
    }

    if (action === "CONFIRM_PAID") {
      // 专用动作权限（当前无人持有 → 默认拒绝；即便持有，下列暂停守卫仍生效）
      const pa = await requirePlatformPermission(request, "recharge_order:confirm_paid");
      if (!pa.authorized) {
        return pa.errorResponse || NextResponse.json({ error: "无权限确认充值收款" }, { status: 403 });
      }
      // [M02] 当前不存在可核验收款来源或批准规则：明确暂停人工收款确认，
      // 在任何 grantPoints / 账单写 / 工单状态变更之前返回，零资金/权益/成功账单副作用，保留待处理工单。
      await writeAuditLog(
        auth.user.id,
        "billing:recharge_order_confirm_paused",
        { orderId: order.id, orderNo: order.orderNo, action: "CONFIRM_PAID", result: "PAUSED" },
        order.workspaceId,
        null,
        request,
      );
      return NextResponse.json(
        {
          success: false,
          code: "RECHARGE_CONFIRM_PAID_PAUSED",
          error:
            "人工收款确认暂未开放（缺少可核验收款来源）；工单保留待处理，不会因此重复加点或生成虚假到账。",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "未知的审批动作" }, { status: 400 });
  } catch (error: any) {
    console.error("审批线下充值工单失败:", error);
    return NextResponse.json(
      { error: error?.message || "服务器内部错误" },
      { status: 500 },
    );
  }
}
