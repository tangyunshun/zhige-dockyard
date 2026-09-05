export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { grantPoints } from "@/lib/credit-service";

/**
 * 后台「线下充值工单」管理（对公转账 / 合同结算闭环）
 *
 * GET   /api/admin/recharge-orders           查看全平台工单（可按 status / workspaceId 过滤）
 * PATCH /api/admin/recharge-orders           审批动作
 *   action:
 *     APPROVE      待审批 → 审批通过（待收款）
 *     REJECT       待审批/待收款 → 驳回（需填写 reviewNote）
 *     CONFIRM_PAID 待收款 → 已收款并自动入账（写入算力分桶 + 流水 + 财务账单）
 */

function isPlatformAdmin(role?: string | null): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "PLATFORM_ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdmin(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可查看充值工单" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const workspaceId = searchParams.get("workspaceId");

    const orders = await prisma.tokenrechargeorder.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      },
      take: 200,
    });

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

    const stats = {
      pending: orders.filter((o) => o.status === "PENDING").length,
      approved: orders.filter((o) => o.status === "APPROVED").length,
      paid: orders.filter((o) => o.status === "PAID").length,
      rejected: orders.filter((o) => o.status === "REJECTED").length,
      paidAmountCents: orders
        .filter((o) => o.status === "PAID")
        .reduce((s, o) => s + Number(o.amountCents || 0), 0),
    };

    return NextResponse.json(
      { success: true, orders: list, stats },
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
    if (!isPlatformAdmin(auth.user.role)) {
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
      if (order.status !== "PENDING") {
        return NextResponse.json({ error: "仅待审批的工单可通过审批" }, { status: 400 });
      }
      await prisma.tokenrechargeorder.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewerId: auth.user.id,
          reviewerName,
          reviewNote: reviewNote || null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: "工单已审批通过，等待确认收款" });
    }

    if (action === "REJECT") {
      if (order.status !== "PENDING" && order.status !== "APPROVED") {
        return NextResponse.json({ error: "该工单当前状态不可驳回" }, { status: 400 });
      }
      if (!reviewNote || !String(reviewNote).trim()) {
        return NextResponse.json({ error: "驳回必须填写审批意见" }, { status: 400 });
      }
      await prisma.tokenrechargeorder.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewerId: auth.user.id,
          reviewerName,
          reviewNote: String(reviewNote).trim(),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: "工单已驳回" });
    }

    if (action === "CONFIRM_PAID") {
      if (order.status !== "APPROVED") {
        return NextResponse.json({ error: "仅审批通过（待收款）的工单可确认到账" }, { status: 400 });
      }

      const ws = await prisma.workspace.findUnique({
        where: { id: order.workspaceId },
        select: { id: true, name: true, type: true },
      });
      const applicant = await prisma.user.findUnique({
        where: { id: order.applicantId },
        select: { id: true, email: true },
      });

      const points = Number(order.points);

      // 入账：企业共享池 或 用户钱包（与工单 scope 一致）
      const grant = await grantPoints({
        scope: order.scope === "WORKSPACE" ? "WORKSPACE" : "WALLET",
        userId: order.applicantId,
        workspaceId: order.scope === "WORKSPACE" ? order.workspaceId : null,
        points,
        sourceType: "OFFLINE_ORDER",
        type: "OFFLINE_RECHARGE",
        title: `线下充值入账 ${points.toLocaleString()} 算力点（工单 ${order.orderNo}）`,
        amountCents: Number(order.amountCents || 0),
        paymentMethod: order.paymentMethod || "OFFLINE_BANK",
        orderNo: order.orderNo,
        sourceId: order.id,
        workspaceType: ws?.type || null,
        workspaceName: ws?.name || order.workspaceName || null,
        userEmail: applicant?.email || null,
        operatorId: auth.user.id,
        remark: reviewNote || order.remark || `对公充值工单 ${order.orderNo} 已确认收款`,
        idempotencyKey: `OFFLINE_ORDER:${order.orderNo}`,
      });

      // 财务账单留痕
      const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
      if (billingModel && typeof billingModel.create === "function") {
        await billingModel.create({
          data: {
            id: crypto.randomUUID(),
            userId: order.applicantId,
            workspaceId: order.workspaceId,
            type: "TOKEN_RECHARGE",
            title: `线下对公充值 ${points.toLocaleString()} 算力点（工单 ${order.orderNo}）`,
            amount: Number(order.amountCents || 0),
            currency: "CNY",
            status: "SUCCESS",
            channel: order.paymentMethod || "OFFLINE_BANK",
            referenceId: order.orderNo,
            metadata: {
              points,
              orderNo: order.orderNo,
              scope: order.scope,
              invoiceTitle: order.invoiceTitle,
              taxNo: order.taxNo,
              confirmedBy: reviewerName,
              ledgerId: grant.ledgerId,
              paidAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          },
        }).catch((e: any) => console.warn("写入线下充值账单记录警告:", e));
      }

      await prisma.tokenrechargeorder.update({
        where: { id },
        data: {
          status: "PAID",
          reviewerId: order.reviewerId || auth.user.id,
          reviewerName: order.reviewerName || reviewerName,
          paidAt: new Date(),
          ledgerId: grant.ledgerId,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `已确认收款并自动入账 ${points.toLocaleString()} 算力点`,
        ledgerId: grant.ledgerId,
        balanceAfter: grant.balanceAfter,
      });
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
