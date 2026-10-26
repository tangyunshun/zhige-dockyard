import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import {
  getUserSubmissions,
  withdrawSubmission,
  resubmitSubmission,
  deleteSubmission,
} from "@/lib/workspace-post-submissions";

export const dynamic = "force-dynamic";

/**
 * GET: 获取当前用户本人提交的全部岗位提报（按本人隔离）
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const authResult = await validateUser(authHeader);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "未找到用户" }, { status: 401 });
    }

    const list = await getUserSubmissions(authResult.user.id);
    return NextResponse.json({ success: true, submissions: list });
  } catch (error) {
    console.error("获取用户岗位提报错误:", error);
    return NextResponse.json(
      { error: "获取提报记录失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST: 用户侧管理自己的提报
 * body: { submissionId, action: "WITHDRAW" | "RESUBMIT" | "DELETE" }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const authResult = await validateUser(authHeader);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "未找到用户" }, { status: 401 });
    }
    const userId = authResult.user.id;

    const body = await request.json();
    const { submissionId, action } = body;
    if (!submissionId || !action) {
      return NextResponse.json({ error: "缺少提报ID或操作指令" }, { status: 400 });
    }

    let result: { success: boolean; message: string };
    switch (action) {
      case "WITHDRAW":
        result = await withdrawSubmission(submissionId, userId);
        break;
      case "RESUBMIT":
        result = await resubmitSubmission(submissionId, userId);
        break;
      case "DELETE":
        result = await deleteSubmission(submissionId, userId);
        break;
      default:
        return NextResponse.json({ error: "未知操作指令" }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error("管理岗位提报错误:", error);
    return NextResponse.json(
      { error: "操作失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
