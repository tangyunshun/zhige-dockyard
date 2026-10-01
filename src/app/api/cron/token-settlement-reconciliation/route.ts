import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { runSettlementReconciliationCron } from "@/lib/token-settlement-ops";

/**
 * HTTP 定时对账入口：
 * POST /api/cron/token-settlement-reconciliation
 *
 * 严格顺序：过期 HOLD 回收 -> Recovery claim/process -> 对账扫描。
 * 安全约束：
 *  1. 优先校验独立 CRON_SECRET（Authorization: Bearer 或 x-cron-secret）；
 *  2. 否则必须具备 system:manage 或 billing:manage 平台权限；
 *  3. 参数严格校验，非法参数直接 400；
 *  4. 每一步返回独立统计，任一步失败不阻断后续安全扫描；
 *  5. 每步具备超时边界（stepTimeoutMs），且整体幂等（可安全重复调用）。
 */
export const maxDuration = 60;

const MAX_CRON_LIMIT = 1000;
const MIN_LEASE_MS = 1000;
const MAX_LEASE_MS = 30 * 60 * 1000;
const MIN_STEP_TIMEOUT_MS = 1000;
const MAX_STEP_TIMEOUT_MS = 120 * 1000;
const MAX_WORKER_ID_LEN = 64;

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const headerSecret = request.headers.get("x-cron-secret");

    let isAuthorized = false;
    if (cronSecret && cronSecret.trim().length > 0) {
      if (headerSecret === cronSecret || authHeader === `Bearer ${cronSecret}`) {
        isAuthorized = true;
      }
    }
    if (!isAuthorized) {
      const perm = await requirePlatformPermission(request, "system:manage", "billing:manage");
      if (perm.authorized) isAuthorized = true;
    }
    if (!isAuthorized) {
      // 严禁在错误响应中回显任何密钥明文（含 CRON_SECRET）
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED: 缺少有效 CRON_SECRET 凭据或平台管理权限" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // limit
    let limit = 20;
    if (body?.limit !== undefined && body?.limit !== null) {
      const v = body.limit;
      if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > MAX_CRON_LIMIT) {
        return NextResponse.json(
          { success: false, error: `limit 必须为 1~${MAX_CRON_LIMIT} 之间的正整数` },
          { status: 400 }
        );
      }
      limit = v;
    }

    // leaseDurationMs
    let leaseMs = 60000;
    const rawLease = body?.leaseDurationMs ?? body?.leaseMs;
    if (rawLease !== undefined && rawLease !== null) {
      if (typeof rawLease !== "number" || !Number.isInteger(rawLease) || rawLease < MIN_LEASE_MS || rawLease > MAX_LEASE_MS) {
        return NextResponse.json(
          { success: false, error: `leaseDurationMs 必须为 ${MIN_LEASE_MS}~${MAX_LEASE_MS} 之间的正整数(毫秒)` },
          { status: 400 }
        );
      }
      leaseMs = rawLease;
    }

    // stepTimeoutMs
    let stepTimeoutMs = 30000;
    if (body?.stepTimeoutMs !== undefined && body?.stepTimeoutMs !== null) {
      const v = body.stepTimeoutMs;
      if (typeof v !== "number" || !Number.isInteger(v) || v < MIN_STEP_TIMEOUT_MS || v > MAX_STEP_TIMEOUT_MS) {
        return NextResponse.json(
          { success: false, error: `stepTimeoutMs 必须为 ${MIN_STEP_TIMEOUT_MS}~${MAX_STEP_TIMEOUT_MS} 之间的正整数(毫秒)` },
          { status: 400 }
        );
      }
      stepTimeoutMs = v;
    }

    // workerId
    let workerId: string | undefined;
    if (body?.workerId !== undefined && body?.workerId !== null) {
      if (typeof body.workerId !== "string" || body.workerId.trim().length === 0) {
        return NextResponse.json({ success: false, error: "workerId 必须为非空字符串" }, { status: 400 });
      }
      if (body.workerId.length > MAX_WORKER_ID_LEN) {
        return NextResponse.json(
          { success: false, error: `workerId 长度不得超过 ${MAX_WORKER_ID_LEN} 字符` },
          { status: 400 }
        );
      }
      workerId = body.workerId;
    }

    // autoFix：本阶段 cron 只运行 dry-run，严禁外部开启自动修复
    if (body?.autoFix !== undefined && body?.autoFix !== null) {
      if (typeof body.autoFix !== "boolean") {
        return NextResponse.json({ success: false, error: "autoFix 必须为布尔值" }, { status: 400 });
      }
      if (body.autoFix === true) {
        return NextResponse.json(
          { success: false, error: "cron 对账当前只运行 dry-run，禁止开启 autoFix" },
          { status: 400 }
        );
      }
    }

    // 可选数据作用域（用于隔离/定向对账；缺省为全局运营调度）
    const MAX_SCOPE_LEN = 64;
    let userId: string | undefined;
    if (body?.userId !== undefined && body?.userId !== null) {
      if (typeof body.userId !== "string" || body.userId.trim() === "" || body.userId.length > MAX_SCOPE_LEN) {
        return NextResponse.json({ success: false, error: `userId 必须为 1~${MAX_SCOPE_LEN} 字符的非空字符串` }, { status: 400 });
      }
      userId = body.userId;
    }
    let workspaceId: string | undefined;
    if (body?.workspaceId !== undefined && body?.workspaceId !== null) {
      if (typeof body.workspaceId !== "string" || body.workspaceId.trim() === "" || body.workspaceId.length > MAX_SCOPE_LEN) {
        return NextResponse.json({ success: false, error: `workspaceId 必须为 1~${MAX_SCOPE_LEN} 字符的非空字符串` }, { status: 400 });
      }
      workspaceId = body.workspaceId;
    }

    const result = await runSettlementReconciliationCron({
      limit,
      workerId,
      leaseMs,
      stepTimeoutMs,
      operator: workerId || "cron-reconciliation",
      userId,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      data: {
        reap: result.reaped,
        recovery: result.recovery,
        reconcile: result.reconcile,
        allStepsSucceeded: result.allStepsSucceeded,
      },
    });
  } catch (err: unknown) {
    console.error("[cron:token-settlement-reconciliation] 执行异常:", (err as Error)?.message || err);
    return NextResponse.json({ success: false, error: "对账执行失败" }, { status: 500 });
  }
}
