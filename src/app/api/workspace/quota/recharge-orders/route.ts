export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { pointsToCents, discountedCents, formatDiscountLabel } from "@/lib/point-rate";

/**
 * 线下充值工单（对公转账 / 合同结算）
 *
 * POST /api/workspace/quota/recharge-orders  提交工单（PENDING）
 * GET  /api/workspace/quota/recharge-orders  查询我提交的 / 我所属空间的工单
 *
 * 闭环流程：提交(PENDING) → 超管审批(APPROVED/REJECTED) → 财务确认收款(PAID，自动入账)
 */

function genOrderNo(): string {
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `RO${datePart}${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      points,
      packId,
      paymentMethod,
      invoiceTitle,
      taxNo,
      bankName,
      bankAccount,
      remark,
    } = body;

    if (!workspaceId || !points || Number(points) <= 0) {
      return NextResponse.json({ error: "参数无效：充值点数必须大于 0" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const requesterMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });
    const isOwner = ws.ownerId === auth.user.id || requesterMember?.role === "OWNER";
    const isAdmin = requesterMember?.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({
        error: "越权警告：仅空间所有者或管理员可提交企业充值工单",
      }, { status: 403 });
    }

    // 金额：优先按在售加油包定价 × 会员折扣，否则按统一汇率折算
    const buyer = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { name: true, membershipLevel: true },
    });
    const level = await prisma.membershiplevel.findUnique({
      where: { id: buyer?.membershipLevel || "FREE" },
      select: { tokenPackDiscount: true },
    });
    const discountPercent = level?.tokenPackDiscount || 0;

    let effectivePoints = Math.floor(Number(points));
    let packName: string | null = null;
    let amountCents: number;

    if (typeof packId === "string" && packId) {
      const pack = await prisma.tokenpack.findUnique({ where: { id: packId } });
      if (pack && pack.isActive && Number(pack.points) > 0) {
        effectivePoints = Number(pack.points);
        packName = pack.name;
        amountCents = discountedCents(pack.price, discountPercent);
      } else {
        amountCents = pointsToCents(effectivePoints);
      }
    } else {
      amountCents = pointsToCents(effectivePoints);
    }

    // 归属：企业空间进入共享池，个人空间进入用户钱包
    const scope = ws.type === "ENTERPRISE" ? "WORKSPACE" : "WALLET";

    const order = await prisma.tokenrechargeorder.create({
      data: {
        id: crypto.randomUUID(),
        orderNo: genOrderNo(),
        workspaceId,
        workspaceName: ws.name,
        scope,
        applicantId: auth.user.id,
        applicantName: buyer?.name || null,
        packId: typeof packId === "string" && packId ? packId : null,
        packName,
        points: BigInt(effectivePoints),
        amountCents,
        paymentMethod: paymentMethod || "OFFLINE_BANK",
        invoiceTitle: invoiceTitle || null,
        taxNo: taxNo || null,
        bankName: bankName || null,
        bankAccount: bankAccount || null,
        remark: remark || null,
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "充值工单已提交，等待平台管理员审批",
      order: {
        id: order.id,
        orderNo: order.orderNo,
        points: Number(order.points),
        amountCents: order.amountCents,
        status: order.status,
        scope: order.scope,
        createdAt: order.createdAt,
      },
      discountLabel: formatDiscountLabel(discountPercent),
    });
  } catch (error) {
    console.error("提交线下充值工单失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "10", 10) || 10, 100));

    // 我所属的空间（用于查看本空间工单）
    const myMemberships = await prisma.workspacemember.findMany({
      where: { userId: auth.user.id },
      select: { workspaceId: true },
    });
    const myWorkspaceIds = myMemberships.map((m) => m.workspaceId);

    const dateCondition: any = {};
    if (startDate) dateCondition.gte = new Date(startDate);
    if (endDate) {
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);
      dateCondition.lte = endD;
    }

    const where: any = {
      OR: [
        { applicantId: auth.user.id },
        ...(myWorkspaceIds.length ? [{ workspaceId: { in: myWorkspaceIds } }] : []),
      ],
      ...(workspaceId ? { workspaceId } : {}),
      ...(status ? { status } : {}),
      ...(Object.keys(dateCondition).length ? { createdAt: dateCondition } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.tokenrechargeorder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tokenrechargeorder.count({ where }),
    ]);

    const list = rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      workspaceId: o.workspaceId,
      workspaceName: o.workspaceName,
      scope: o.scope,
      points: Number(o.points),
      amountCents: o.amountCents,
      paymentMethod: o.paymentMethod,
      status: o.status,
      reviewNote: o.reviewNote,
      applicantName: o.applicantName,
      invoiceTitle: o.invoiceTitle,
      remark: o.remark,
      createdAt: o.createdAt.toISOString(),
      reviewedAt: o.reviewedAt ? o.reviewedAt.toISOString() : null,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    }));

    return NextResponse.json(
      {
        success: true,
        orders: list,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1),
        },
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
    console.error("查询线下充值工单失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/workspace/quota/recharge-orders
 * 删除本人充值工单：仅允许删除「创建时间距今超过 3 年」的工单（数据安全合规，近 3 年不可删）。
 * body: { ids?: string[], clearExpired?: boolean }
 *  - ids: 指定工单 id 批量删除（每项均须本人且超 3 年）
 *  - clearExpired: true 时删除本人全部超 3 年工单（用于「清除超时订单」）
 */
const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/**
 * PATCH /api/workspace/quota/recharge-orders
 * 用户自助撤销本人「待审批」工单（action: CANCEL）。仅 PENDING 且本人/所属空间可操作。
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { id?: string; action?: string };
    if (body.action !== "CANCEL" || !body.id) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const order = await prisma.tokenrechargeorder.findUnique({ where: { id: body.id } });
    if (!order) return NextResponse.json({ error: "工单不存在" }, { status: 404 });

    const myMemberships = await prisma.workspacemember.findMany({
      where: { userId: auth.user.id },
      select: { workspaceId: true },
    });
    const myWorkspaceIds = myMemberships.map((m) => m.workspaceId);
    const owned = order.applicantId === auth.user.id || myWorkspaceIds.includes(order.workspaceId);
    if (!owned) return NextResponse.json({ error: "无权操作该工单" }, { status: 403 });
    if (order.status !== "PENDING") {
      return NextResponse.json({ error: "仅待审批状态的工单可撤销" }, { status: 400 });
    }

    const updated = await prisma.tokenrechargeorder.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        reviewNote: order.reviewNote ? `${order.reviewNote} | 用户撤销` : "用户撤销",
      },
    });
    return NextResponse.json({ success: true, order: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("撤销工单失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      ids?: string[];
      clearExpired?: boolean;
    };

    const myMemberships = await prisma.workspacemember.findMany({
      where: { userId: auth.user.id },
      select: { workspaceId: true },
    });
    const myWorkspaceIds = myMemberships.map((m) => m.workspaceId);

    const ownershipWhere = {
      OR: [
        { applicantId: auth.user.id },
        ...(myWorkspaceIds.length ? [{ workspaceId: { in: myWorkspaceIds } }] : []),
      ],
    };

    let targets: { id: string; createdAt: Date }[] = [];

    if (body.clearExpired) {
      const cutoff = new Date(Date.now() - THREE_YEARS_MS);
      targets = await prisma.tokenrechargeorder.findMany({
        where: { ...ownershipWhere, createdAt: { lt: cutoff } },
        select: { id: true, createdAt: true },
      });
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      const found = await prisma.tokenrechargeorder.findMany({
        where: { ...ownershipWhere, id: { in: body.ids } },
        select: { id: true, createdAt: true },
      });
      if (found.length !== body.ids.length) {
        return NextResponse.json(
          { error: "存在无权操作的工单（非本人或所属空间）" },
          { status: 403 }
        );
      }
      targets = found;
    } else {
      return NextResponse.json({ error: "请选择要删除的工单" }, { status: 400 });
    }

    if (targets.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: "无符合条件的超时工单" });
    }

    const cutoff = Date.now() - THREE_YEARS_MS;
    const within3yr = targets.filter((t) => +new Date(t.createdAt) > cutoff);
    if (within3yr.length > 0) {
      return NextResponse.json(
        { error: "仅创建时间超过 3 年的工单可删除，近 3 年内的工单不可删除" },
        { status: 400 }
      );
    }

    const ids = targets.map((t) => t.id);
    const del = await prisma.tokenrechargeorder.deleteMany({ where: { id: { in: ids } } });

    return NextResponse.json({
      success: true,
      deleted: del.count,
      message: `已清除 ${del.count} 笔超过 3 年的工单`,
    });
  } catch (error) {
    console.error("删除线下充值工单失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
