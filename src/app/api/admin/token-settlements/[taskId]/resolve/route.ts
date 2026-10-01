import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  adminResolveSettlementReview,
  TokenSettlementError,
  RefundAccountNotFoundError,
} from "@/lib/token-settlement-service";

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

/**
 * 管理员人工复核结算单独立处理端点
 * POST /api/admin/token-settlements/[taskId]/resolve
 *
 * 权限要求：
 * - 必须具备 platform 角色权限 system:manage 或 billing:manage
 * - 仅在 status=REQUIRES_REVIEW 时允许执行裁决，终态幂等安全返回
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "billing:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const { taskId } = await params;
    if (!taskId || taskId.trim() === "") {
      return NextResponse.json({ success: false, error: "缺少任务标识 taskId" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const auditRemark = typeof body?.auditRemark === "string" ? body.auditRemark.trim() : "";
    const rawActualPoints = body?.actualPoints;
    let actualPoints: bigint | number | undefined = undefined;

    if (action !== "SETTLE" && action !== "RELEASE") {
      return NextResponse.json(
        { success: false, error: "操作类型非法，只允许 SETTLE 或 RELEASE" },
        { status: 400 }
      );
    }

    if (!auditRemark) {
      return NextResponse.json(
        { success: false, error: "审核备注 auditRemark 不能为空" },
        { status: 400 }
      );
    }

    if (action === "SETTLE" && rawActualPoints !== undefined && rawActualPoints !== null) {
      if (typeof rawActualPoints === "number") {
        if (!Number.isSafeInteger(rawActualPoints) || rawActualPoints < 0) {
          return NextResponse.json(
            { success: false, error: "实际点数 actualPoints 必须为非负安全整数" },
            { status: 400 }
          );
        }
        actualPoints = rawActualPoints;
      } else if (typeof rawActualPoints === "string") {
        const trimmed = rawActualPoints.trim();
        if (!/^\d+$/.test(trimmed)) {
          return NextResponse.json(
            { success: false, error: "实际点数 actualPoints 必须为非负整数" },
            { status: 400 }
          );
        }
        const b = BigInt(trimmed);
        if (b > BigInt(Number.MAX_SAFE_INTEGER)) {
          return NextResponse.json(
            { success: false, error: "实际点数 actualPoints 超出安全整数上限" },
            { status: 400 }
          );
        }
        actualPoints = b;
      } else {
        return NextResponse.json(
          { success: false, error: "实际点数 actualPoints 类型非法" },
          { status: 400 }
        );
      }
    }

    const result = await adminResolveSettlementReview({
      taskId,
      adminUserId: auth.user?.id || "admin",
      action,
      actualPoints,
      auditRemark,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: result.taskId,
        status: result.status,
        auditMessage: result.auditMessage,
        releasedPoints: result.releasedPoints ? Number(result.releasedPoints) : 0,
        supplementPoints: result.supplementPoints ? Number(result.supplementPoints) : 0,
        actualPricePoints: result.actualPricePoints ? Number(result.actualPricePoints) : 0,
      },
    });
  } catch (err: unknown) {
    if (err instanceof TokenSettlementError) {
      if (err.code === "SETTLEMENT_RECORD_NOT_FOUND") {
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 404 });
      }
      if (
        err.code === "INVALID_STATE_FOR_ADMIN_RESOLVE" ||
        err.code === "INVALID_POINTS" ||
        err.code === "USAGE_EXCEEDS_SAFE_LIMIT"
      ) {
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 400 });
      }
    }
    if (err instanceof RefundAccountNotFoundError) {
      return NextResponse.json(
        { success: false, error: err.message, code: (err as Error & { code?: string }).code || "REFUND_ACCOUNT_NOT_FOUND" },
        { status: 409 }
      );
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[admin:token-settlement:resolve] 复核异常:", errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage || "人工复核处理异常" },
      { status: 500 }
    );
  }
}
