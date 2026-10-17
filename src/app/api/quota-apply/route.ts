import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 算力点提升申请（用户侧）。
 *
 * GET  ：当前用户在自己所属空间内的申请记录
 * POST ：为指定空间提交提升申请（仅限该空间的成员）
 */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    if (!authResult.valid) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }
    const userId = authResult.user!.id;

    // 仅返回用户有权限访问的空间的申请（个人空间所有者为本人，企业空间按成员关系）
    const memberships = await prisma.workspacemember.findMany({
      where: { userId },
      select: { workspaceId: true, role: true },
    });
    const workspaceIds = memberships.map((m) => m.workspaceId);

    const rows = await prisma.quotaapply.findMany({
      where: { userId, workspaceId: { in: workspaceIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        applyPoints: Number(r.applyPoints),
        approvedPoints: r.approvedPoints != null ? Number(r.approvedPoints) : null,
        reason: r.reason,
        status: r.status,
        adminRemark: r.adminRemark,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[quota-apply] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询申请记录失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    if (!authResult.valid) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }
    const userId = authResult.user!.id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const applyPoints = Number(body.applyPoints);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "请指定要申请提升的工作空间" }, { status: 400 });
    }
    if (!Number.isFinite(applyPoints) || applyPoints <= 0) {
      return NextResponse.json({ success: false, error: "申请额度必须大于 0" }, { status: 400 });
    }
    if (applyPoints > 1_000_000) {
      return NextResponse.json({ success: false, error: "单次申请额度不能超过 1,000,000 算力点" }, { status: 400 });
    }

    // 必须是该空间成员
    const membership = await prisma.workspacemember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "你不是该空间的成员，无法提交申请" }, { status: 403 });
    }

    // 同一空间只允许一条待处理申请，避免重复排队
    const pending = await prisma.quotaapply.findFirst({
      where: { workspaceId, userId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { success: false, error: "该空间已有一条待审批的申请，请等待管理员处理后再提交" },
        { status: 409 },
      );
    }

    const created = await prisma.quotaapply.create({
      data: {
        workspaceId,
        userId,
        applyPoints: BigInt(Math.floor(applyPoints)),
        reason: reason || null,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: created.id },
      message: "申请已提交，请等待管理员审批",
    });
  } catch (error) {
    console.error("[quota-apply] 提交失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "提交申请失败" }, { status: 500 });
  }
}
