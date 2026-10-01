import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { getSettlementOperationalStats, type ReconcileFilters } from "@/lib/token-settlement-ops";

/**
 * 管理员 Token 结算运营统计
 * GET /api/admin/token-settlements/stats?userId=&workspaceId=&status=&errorCode=&from=&to=
 *
 * 统计全部来自数据库聚合（不写死）；输出仅含计数与时间戳，
 * 绝不含 API Key / JWT / 模型密钥 / 完整用户隐私资料。
 */
function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = /^\d+$/.test(value.trim()) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:read", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const filters: ReconcileFilters = {
      status: searchParams.get("status") || undefined,
      errorCode: searchParams.get("errorCode") || undefined,
      workspaceId: searchParams.get("workspaceId") || undefined,
      userId: searchParams.get("userId") || undefined,
      taskId: searchParams.get("taskId") || undefined,
      createdFrom: parseDate(searchParams.get("from")),
      createdTo: parseDate(searchParams.get("to")),
    };

    const stats = await getSettlementOperationalStats(filters);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    console.error("[admin:token-settlement:stats] 失败:", (err as Error)?.message || err);
    return NextResponse.json({ success: false, error: "运营统计查询失败" }, { status: 500 });
  }
}
