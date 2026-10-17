import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { grantPoints } from "@/lib/credit-service";

/**
 * 算力点提升申请审批（管理员侧）。
 *
 * GET   ：分页查询申请列表（可按状态筛选）
 * POST  ：审批（通过 = 入账到空间共享池并记流水；拒绝 = 填写理由）
 *
 * 入账复用 grantPoints（pointgrant 分桶 + pointledger 流水 + workspacequota.tokenBalance 同事务更新），
 * 不新建平行账本，保证与既有算力体系口径一致。
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage", "billing:read");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

    const where = status && status !== "ALL" ? { status } : {};

    const [rows, total] = await Promise.all([
      prisma.quotaapply.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          workspace: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.quotaapply.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        workspaceName: r.workspace?.name || r.workspaceId,
        workspaceType: r.workspace?.type || null,
        userId: r.userId,
        userName: r.user?.name || null,
        userEmail: r.user?.email || null,
        applyPoints: Number(r.applyPoints),
        approvedPoints: r.approvedPoints != null ? Number(r.approvedPoints) : null,
        reason: r.reason,
        status: r.status,
        adminRemark: r.adminRemark,
        ledgerId: r.ledgerId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("[admin/quota-apply] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询申请列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const adminId = auth.user?.id ?? null;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const applyId = typeof body.applyId === "string" ? body.applyId : "";
    const action = body.action === "APPROVE" ? "APPROVE" : body.action === "REJECT" ? "REJECT" : "";
    const approvedPoints = Number(body.approvedPoints);
    const adminRemark = typeof body.adminRemark === "string" ? body.adminRemark.trim() : "";

    if (!applyId || !action) {
      return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
    }

    const apply = await prisma.quotaapply.findUnique({ where: { id: applyId } });
    if (!apply) {
      return NextResponse.json({ success: false, error: "申请不存在" }, { status: 404 });
    }
    if (apply.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "该申请已被处理，请勿重复审批" }, { status: 409 });
    }

    if (action === "REJECT") {
      if (!adminRemark) {
        return NextResponse.json({ success: false, error: "拒绝时必须填写理由" }, { status: 400 });
      }
      await prisma.quotaapply.update({
        where: { id: applyId },
        data: {
          status: "REJECTED",
          adminId,
          adminRemark,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: "已拒绝该申请" });
    }

    // 通过：默认按申请数量批准，允许管理员修改
    const finalPoints =
      Number.isFinite(approvedPoints) && approvedPoints > 0
        ? Math.floor(approvedPoints)
        : Number(apply.applyPoints);
    if (finalPoints <= 0) {
      return NextResponse.json({ success: false, error: "批准额度必须大于 0" }, { status: 400 });
    }

    // 入账到空间共享池（WORKSPACE scope），复用既有分桶与流水机制
    const grantResult = await grantPoints({
      scope: "WORKSPACE",
      workspaceId: apply.workspaceId,
      points: finalPoints,
      sourceType: "MANUAL",
      type: "MANUAL_ADJUST",
      operatorId: adminId,
      title: `额度提升申请批准 ${finalPoints} 算力点`,
      remark: `来自算力点提升申请（申请 ${Number(apply.applyPoints)} 点）${adminRemark ? `；审批意见：${adminRemark}` : ""}`,
      idempotencyKey: `QUOTA_APPLY_APPROVE:${applyId}`,
    });

    await prisma.quotaapply.update({
      where: { id: applyId },
      data: {
        status: "APPROVED",
        adminId,
        approvedPoints: BigInt(finalPoints),
        adminRemark: adminRemark || "审批通过",
        ledgerId: (grantResult as { ledgerId?: string })?.ledgerId ?? null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `已批准并入账 ${finalPoints} 算力点`,
      data: { approvedPoints: finalPoints },
    });
  } catch (error) {
    console.error("[admin/quota-apply] 审批失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "审批失败" }, { status: 500 });
  }
}
