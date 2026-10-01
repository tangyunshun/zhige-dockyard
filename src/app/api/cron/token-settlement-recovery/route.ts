import { NextRequest, NextResponse } from "next/server";
import { runSettlementRecovery, reapExpiredHolds } from "@/lib/token-settlement-service";
import { requirePlatformPermission } from "@/lib/security";

/**
 * HTTP 定时恢复入口：
 * POST /api/cron/token-settlement-recovery
 *
 * 安全约束：
 * 1. 优先校验独立 CRON_SECRET（通过 Authorization: Bearer 或 x-cron-secret）；
 * 2. 若未匹配 CRON_SECRET，则必须具备平台最高管理权限 system:manage 或 billing:manage；
 * 3. 禁止任何普通用户通过普通登录态调用。
 * 4. 生产 Recovery 调度执行流程：先执行 reapExpiredHolds，再执行 runSettlementRecovery；
 *    返回 reaped、processed、settled、released、inReview、failed 统计。
 */
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
      if (perm.authorized) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      // 严禁在错误响应中回显任何密钥明文（含 CRON_SECRET）
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED: 缺少有效 CRON_SECRET 凭据或平台管理权限" },
        { status: 401 }
      );
    }

    // 严格校验 cron 入参：非法参数直接返回 400，绝不下沉到执行层
    const body = await request.json().catch(() => ({}));

    // limit: 必须为有限正整数且带上限
    const MAX_CRON_LIMIT = 1000;
    const rawLimit = body?.limit;
    let limit = 20;
    if (rawLimit !== undefined && rawLimit !== null) {
      if (
        typeof rawLimit !== "number" ||
        !Number.isFinite(rawLimit) ||
        !Number.isInteger(rawLimit) ||
        rawLimit <= 0 ||
        rawLimit > MAX_CRON_LIMIT
      ) {
        return NextResponse.json(
          { success: false, error: `limit 必须为 1~${MAX_CRON_LIMIT} 之间的正整数` },
          { status: 400 }
        );
      }
      limit = rawLimit;
    }

    // leaseDurationMs: 必须为有限正整数且具合理上下限
    const MIN_LEASE_MS = 1000;
    const MAX_LEASE_MS = 30 * 60 * 1000; // 30 分钟
    const rawLease = body?.leaseDurationMs ?? body?.leaseMs;
    let leaseMs = 60000;
    if (rawLease !== undefined && rawLease !== null) {
      if (
        typeof rawLease !== "number" ||
        !Number.isFinite(rawLease) ||
        !Number.isInteger(rawLease) ||
        rawLease < MIN_LEASE_MS ||
        rawLease > MAX_LEASE_MS
      ) {
        return NextResponse.json(
          { success: false, error: `leaseDurationMs 必须为 ${MIN_LEASE_MS}~${MAX_LEASE_MS} 之间的正整数(毫秒)` },
          { status: 400 }
        );
      }
      leaseMs = rawLease;
    }

    // workerId: 非空且限制长度
    const MAX_WORKER_ID_LEN = 64;
    let workerId: string | undefined;
    if (body?.workerId !== undefined && body?.workerId !== null) {
      if (typeof body.workerId !== "string" || body.workerId.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "workerId 必须为非空字符串" },
          { status: 400 }
        );
      }
      if (body.workerId.length > MAX_WORKER_ID_LEN) {
        return NextResponse.json(
          { success: false, error: `workerId 长度不得超过 ${MAX_WORKER_ID_LEN} 字符` },
          { status: 400 }
        );
      }
      workerId = body.workerId;
    }

    // 步骤 1: 扫描并回收过期预扣 HOLD 单据
    const reapResult = await reapExpiredHolds({ limit });
    const reaped = reapResult.reapedCount;

    // 步骤 2: 执行结算恢复队列 Worker
    const recoveryResult = await runSettlementRecovery({
      limit,
      workerId,
      leaseMs,
      leaseDurationMs: leaseMs,
    });

    return NextResponse.json({
      success: true,
      data: {
        reaped,
        processed: recoveryResult.processed,
        settled: recoveryResult.settled,
        released: recoveryResult.released,
        inReview: recoveryResult.inReview,
        failed: recoveryResult.failed,
      },
    });
  } catch (err: unknown) {
    console.error("[cron:token-settlement-recovery] 执行异常:", (err as Error)?.message || err);
    return NextResponse.json(
      { success: false, error: "恢复执行失败" },
      { status: 500 }
    );
  }
}
