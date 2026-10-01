import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { listRefundRecoveries, retryRefundRecovery } from "@/lib/refund-recovery";

/**
 * 管理员：查询待退款/退款恢复记录
 * GET /api/admin/refund-recoveries?status=PENDING&page=1&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:read", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const data = await listRefundRecoveries({
      status: searchParams.get("status") || undefined,
      page: Number(searchParams.get("page") || "1"),
      limit: Number(searchParams.get("limit") || "20"),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[refund-recovery] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询待退款记录失败" }, { status: 500 });
  }
}

/**
 * 管理员：幂等重试退款
 * POST /api/admin/refund-recoveries  { id }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const id = typeof (body as { id?: unknown })?.id === "string" ? (body as { id: string }).id : "";
    if (!id) {
      return NextResponse.json({ success: false, error: "缺少待退款记录 ID" }, { status: 400 });
    }
    const result = await retryRefundRecovery(id);
    return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("[refund-recovery] 重试失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "退款重试失败" }, { status: 500 });
  }
}
