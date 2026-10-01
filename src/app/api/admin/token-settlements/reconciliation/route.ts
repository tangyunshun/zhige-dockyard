import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  TokenSettlementError,
  RefundAccountNotFoundError,
} from "@/lib/token-settlement-service";
import {
  adminSettlementAction,
  isAdminSettlementAction,
  listReconciliationRecords,
  type ReconcileFilters,
} from "@/lib/token-settlement-ops";

/**
 * 管理员 Token 结算对账接口
 * GET  /api/admin/token-settlements/reconciliation  —— 分页 + 状态/错误码/时间/空间/用户/任务筛选
 * POST /api/admin/token-settlements/reconciliation  —— retry / release / settle / mark-review（幂等）
 *
 * 权限：GET 需要 system:manage | billing:read | billing:manage；POST 需要 system:manage | billing:manage。
 * 普通用户与无权限管理员一律返回明确 403。
 */

const MAX_PAGE_SIZE = 100;

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const asNum = Number(value);
  const d = Number.isFinite(asNum) && value.trim() !== "" && /^\d+$/.test(value) ? new Date(asNum) : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseFilters(searchParams: URLSearchParams): ReconcileFilters {
  return {
    status: searchParams.get("status") || undefined,
    errorCode: searchParams.get("errorCode") || undefined,
    workspaceId: searchParams.get("workspaceId") || undefined,
    userId: searchParams.get("userId") || undefined,
    taskId: searchParams.get("taskId") || undefined,
    createdFrom: parseDate(searchParams.get("from")),
    createdTo: parseDate(searchParams.get("to")),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:read", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20)
    );
    const includeConsistent = searchParams.get("includeConsistent") === "true";

    const result = await listReconciliationRecords({
      filters: parseFilters(searchParams),
      page,
      pageSize,
      includeConsistent,
    });

    return NextResponse.json({
      success: true,
      data: {
        records: result.records,
        findingsTotal: result.findingsTotal,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    });
  } catch (err: unknown) {
    console.error("[admin:token-settlement:reconciliation:list] 失败:", (err as Error)?.message || err);
    return NextResponse.json({ success: false, error: "对账列表查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
    const action = body?.action;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!taskId) {
      return NextResponse.json({ success: false, error: "缺少 taskId" }, { status: 400 });
    }
    if (!isAdminSettlementAction(action)) {
      return NextResponse.json(
        { success: false, error: "操作类型非法，只允许 retry / release / settle / mark-review" },
        { status: 400 }
      );
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: "必须提供非空操作原因 reason" }, { status: 400 });
    }

    // actualPoints 严格校验（仅 settle 使用）
    let actualPoints: number | bigint | undefined;
    const rawActualPoints = body?.actualPoints;
    if (rawActualPoints !== undefined && rawActualPoints !== null) {
      if (typeof rawActualPoints === "number") {
        if (!Number.isSafeInteger(rawActualPoints) || rawActualPoints < 0) {
          return NextResponse.json({ success: false, error: "actualPoints 必须为非负安全整数" }, { status: 400 });
        }
        actualPoints = rawActualPoints;
      } else if (typeof rawActualPoints === "string" && /^\d+$/.test(rawActualPoints.trim())) {
        const b = BigInt(rawActualPoints.trim());
        if (b > BigInt(Number.MAX_SAFE_INTEGER)) {
          return NextResponse.json({ success: false, error: "actualPoints 超出安全整数上限" }, { status: 400 });
        }
        actualPoints = b;
      } else {
        return NextResponse.json({ success: false, error: "actualPoints 类型非法" }, { status: 400 });
      }
    }

    const expectedClaimToken =
      typeof body?.expectedClaimToken === "string" && body.expectedClaimToken.trim() !== ""
        ? body.expectedClaimToken
        : undefined;
    const expectedSettlementVersion =
      typeof body?.expectedSettlementVersion === "number" && Number.isSafeInteger(body.expectedSettlementVersion)
        ? body.expectedSettlementVersion
        : undefined;
    const expectedStatus = typeof body?.expectedStatus === "string" ? body.expectedStatus : undefined;

    const result = await adminSettlementAction({
      taskId,
      action,
      adminUserId: auth.user?.id || "admin",
      reason,
      actualPoints,
      expectedClaimToken,
      expectedSettlementVersion,
      expectedStatus,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: result.taskId,
        action: result.action,
        status: result.status,
        applied: result.applied,
        idempotent: result.idempotent,
        message: result.message,
      },
    });
  } catch (err: unknown) {
    if (err instanceof TokenSettlementError) {
      if (err.code === "SETTLEMENT_RECORD_NOT_FOUND") {
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 404 });
      }
      if (
        err.code === "INVALID_ACTION_TYPE" ||
        err.code === "INVALID_STATE_FOR_REVIEW_ACTION" ||
        err.code === "INVALID_POINTS" ||
        err.code === "INVALID_POINTS_OR_REASON" ||
        err.code === "USAGE_EXCEEDS_SAFE_LIMIT"
      ) {
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 400 });
      }
      if (
        err.code === "FENCING_TOKEN_MISMATCH" ||
        err.code === "SETTLEMENT_VERSION_MISMATCH" ||
        err.code === "RECOVERY_LEASE_ACTIVE" ||
        err.code === "SETTLEMENT_CONCURRENCY_CONFLICT"
      ) {
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 409 });
      }
    }
    if (err instanceof RefundAccountNotFoundError) {
      return NextResponse.json(
        { success: false, error: err.message, code: (err as Error & { code?: string }).code || "REFUND_ACCOUNT_NOT_FOUND" },
        { status: 409 }
      );
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[admin:token-settlement:reconciliation:action] 失败:", errorMessage);
    return NextResponse.json({ success: false, error: errorMessage || "对账操作异常" }, { status: 500 });
  }
}
