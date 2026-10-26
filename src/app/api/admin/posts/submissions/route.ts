import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import {
  getSubmittedPostsFromDB,
  reviewSubmittedPost,
} from "@/lib/workspace-post-submissions";

export const dynamic = "force-dynamic";

/**
 * GET: 获取空间提报岗位列表
 */
export async function GET(request: NextRequest) {
  try {
    // 严格校验岗位提交审核查看权限点（无权直接阻断）
    const permCheck = await requirePlatformPermission(request, "post:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权查看岗位提交" }, { status: 403 });
    }
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user || !isAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "FORBIDDEN_NOT_ADMIN" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // "PENDING" | "ACCEPTED" | "REJECTED" | "ALL"

    const list = await getSubmittedPostsFromDB();
    const filtered =
      !statusFilter || statusFilter === "ALL"
        ? list
        : list.filter((item) => item.status === statusFilter);

    return NextResponse.json({
      success: true,
      submissions: filtered,
      total: list.length,
      pendingCount: list.filter((i) => i.status === "PENDING").length,
    });
  } catch (error) {
    console.error("获取空间提报岗位错误:", error);
    return NextResponse.json(
      { error: "获取提报岗位列表失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST: 超管审核空间提报岗位
 * body: { submissionId, action: "ACCEPT" | "REJECT" | "EDIT", editData, adminNote }
 */
export async function POST(request: NextRequest) {
  try {
    // 严格校验岗位提交审核权限点（无权直接阻断）
    const permCheck = await requirePlatformPermission(request, "post:update");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限审核岗位提交" }, { status: 403 });
    }
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user || !isAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "FORBIDDEN_NOT_ADMIN" }, { status: 403 });
    }

    const body = await request.json();
    const { submissionId, action, editData, adminNote } = body;

    if (!submissionId || !action) {
      return NextResponse.json({ error: "缺少提报ID或操作指令" }, { status: 400 });
    }

    const result = await reviewSubmittedPost({
      submissionId,
      action,
      editData,
      adminNote,
    });

    await writeAuditLog(auth.user?.id || null, "post:submission", { submissionId, action }, null, null, request);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("审核空间提报岗位错误:", error);
    return NextResponse.json(
      { error: "审核操作失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 管理员批量删除空间提报岗位记录（单条或批量，ids 数组）
 */
export async function DELETE(request: NextRequest) {
  try {
    const permCheck = await requirePlatformPermission(request, "post:delete");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限删除岗位提交" }, { status: 403 });
    }
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user || !isAdminRole(auth.user.role)) {
      return NextResponse.json({ error: "FORBIDDEN_NOT_ADMIN" }, { status: 403 });
    }

    const body = await request.json();
    const { ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "未提供待删除记录ID" }, { status: 400 });
    }

    const { adminDeleteSubmissions } = await import("@/lib/workspace-post-submissions");
    const result = await adminDeleteSubmissions(ids);

    await writeAuditLog(auth.user?.id || null, "post:submission:delete", { ids }, null, null, request);

    return NextResponse.json({
      success: true,
      message: result.message,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error("删除空间提报岗位错误:", error);
    return NextResponse.json(
      { error: "删除操作失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
