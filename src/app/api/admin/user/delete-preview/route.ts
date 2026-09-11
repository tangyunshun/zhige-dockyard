import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { analyzeUserDeletion } from "@/lib/admin-user-deletion";

/**
 * 删除用户前的数据归属与价值分析（只读）。
 * 返回情况 A/B/C 分类、数据摘要、拦截原因与提示，供前端弹窗展示。
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:delete");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }
    if (userId === adminId) {
      return NextResponse.json({ error: "不能删除自己" }, { status: 403 });
    }

    const preview = await analyzeUserDeletion(userId);
    if (!preview.exists) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    console.error("Delete preview error:", error);
    return NextResponse.json(
      { error: "获取删除预览失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
