import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
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
