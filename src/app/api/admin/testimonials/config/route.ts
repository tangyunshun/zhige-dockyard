import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { getRotationState, setActiveGroup, setRotationMode } from "@/lib/testimonial-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/testimonials/config
 * 轮换设置：
 *   - mode: "auto"（每周自动轮换）| "manual"（仅展示指定组）
 *   - activeGroup: 1..5，手动指定当前展示组（同时重置轮换计时点）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "无权限修改轮换设置" },
        { status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const hasMode = body?.mode === "auto" || body?.mode === "manual";
    const hasGroup = body?.activeGroup !== undefined && body?.activeGroup !== null;

    if (!hasMode && !hasGroup) {
      return NextResponse.json({ error: "请提供 mode 或 activeGroup 参数" }, { status: 400 });
    }

    // 先读当前状态，只按提交的字段覆盖（仅改组不会改变 auto/manual 模式）
    let state = await getRotationState();

    if (hasMode) {
      state = await setRotationMode(body.mode);
    }
    if (hasGroup) {
      state = await setActiveGroup(Number(body.activeGroup));
    }

    await writeAuditLog(
      auth.user!.id,
      "testimonial:config",
      { mode: state.mode, activeGroup: state.activeGroup },
      null,
      null,
      request
    );

    return NextResponse.json({
      success: true,
      state,
      message:
        state.mode === "auto"
          ? `已开启每周自动轮换，当前展示第 ${state.activeGroup} 组`
          : `已切换为手动模式，当前展示第 ${state.activeGroup} 组`,
    });
  } catch (error) {
    console.error("Update testimonial config error:", error);
    return NextResponse.json({ error: "更新轮换设置失败" }, { status: 500 });
  }
}
