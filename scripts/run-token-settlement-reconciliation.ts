/**
 * 🚢 知阁·舟坊 - Token 结算每日对账独立生产执行脚本
 *
 * 用途：供生产环境定时任务（crontab / Windows 任务计划程序）周期调用，
 *       或运维手动执行对账扫描。严格顺序：过期 HOLD 回收 -> Recovery 扫描 -> 对账扫描。
 *
 * 本阶段对账仅运行 dry-run（autoFix 强制 false），只报告差异与「明确 CAS 修复」，
 * 绝不自动猜测修复金额、绝不静默修数。
 *
 * 运行示例：
 *   npm run cron:token-settlement-reconciliation -- --limit 100 --worker-id recon-prod-1
 *   # 或
 *   npx tsx --tsconfig tsconfig.json scripts/run-token-settlement-reconciliation.ts --limit 50
 */
import { randomUUID } from "crypto";
import { loadCliEnv } from "./cli-env";

// 1. 统一加载 CLI 环境变量（不输出任何密钥明文）
loadCliEnv();

import { prisma } from "@/lib/prisma";
import {
  runSettlementReconciliationCron,
  getSettlementOperationalStats,
  scanSettlementReconciliation,
} from "@/lib/token-settlement-ops";

export interface CliReconcileOptions {
  limit: number;
  workerId: string;
  leaseDurationMs: number;
  stepTimeoutMs: number;
}

export function parseReconcileArgs(args: string[] = process.argv.slice(2)): CliReconcileOptions {
  let limit = 100;
  let workerId = `recon-${randomUUID().slice(0, 8)}`;
  let leaseDurationMs = 60000;
  let stepTimeoutMs = 30000;

  const MAX_CLI_LIMIT = 1000;
  const MIN_LEASE_MS = 1000;
  const MAX_LEASE_MS = 30 * 60 * 1000;
  const MIN_STEP_MS = 1000;
  const MAX_STEP_MS = 120 * 1000;
  const MAX_WORKER_ID_LEN = 64;

  const clampSafeInt = (raw: string, fallback: number, min: number, max: number): number => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit" && args[i + 1]) {
      limit = clampSafeInt(args[i + 1], limit, 1, MAX_CLI_LIMIT);
      i++;
    } else if (arg.startsWith("--limit=")) {
      limit = clampSafeInt(arg.split("=")[1], limit, 1, MAX_CLI_LIMIT);
    } else if (arg === "--worker-id" && args[i + 1]) {
      workerId = args[i + 1].slice(0, MAX_WORKER_ID_LEN);
      i++;
    } else if (arg.startsWith("--worker-id=")) {
      workerId = arg.split("=")[1].slice(0, MAX_WORKER_ID_LEN);
    } else if (arg === "--lease-duration-ms" && args[i + 1]) {
      leaseDurationMs = clampSafeInt(args[i + 1], leaseDurationMs, MIN_LEASE_MS, MAX_LEASE_MS);
      i++;
    } else if (arg.startsWith("--lease-duration-ms=")) {
      leaseDurationMs = clampSafeInt(arg.split("=")[1], leaseDurationMs, MIN_LEASE_MS, MAX_LEASE_MS);
    } else if (arg === "--step-timeout-ms" && args[i + 1]) {
      stepTimeoutMs = clampSafeInt(args[i + 1], stepTimeoutMs, MIN_STEP_MS, MAX_STEP_MS);
      i++;
    } else if (arg.startsWith("--step-timeout-ms=")) {
      stepTimeoutMs = clampSafeInt(arg.split("=")[1], stepTimeoutMs, MIN_STEP_MS, MAX_STEP_MS);
    }
  }

  return { limit, workerId, leaseDurationMs, stepTimeoutMs };
}

export async function executeReconciliation(opts?: Partial<CliReconcileOptions>) {
  const parsed = parseReconcileArgs();
  const limit = opts?.limit ?? parsed.limit;
  const workerId = opts?.workerId ?? parsed.workerId;
  const leaseMs = opts?.leaseDurationMs ?? parsed.leaseDurationMs;
  const stepTimeoutMs = opts?.stepTimeoutMs ?? parsed.stepTimeoutMs;

  console.log(`[token-settlement-reconciliation] 启动: limit=${limit}, workerId=${workerId}, leaseMs=${leaseMs}, stepTimeoutMs=${stepTimeoutMs}`);

  const cron = await runSettlementReconciliationCron({
    limit,
    workerId,
    leaseMs,
    stepTimeoutMs,
    operator: workerId,
  });

  // 运营统计（tokensettlement / recovery 状态分布）
  const stats = await getSettlementOperationalStats({});

  // 逐任务对账明细（全量扫描，dry-run）
  const scan = await scanSettlementReconciliation({ limit: 1000, autoFix: false, operator: workerId });

  // 余额守恒补充信号：全局 pointledger 净流入净额（IN - OUT），仅作监控信号；
  // 注意：账户级绝对值核对（userwallet/quota/grant）属后续「总账对账」任务，本轮不宣称已完整核对。
  const ledgerAgg = await prisma.$queryRaw<Array<{ inSum: bigint; outSum: bigint; net: bigint }>>`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN' THEN points ELSE 0 END), 0) AS inSum,
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN points ELSE 0 END), 0) AS outSum,
      COALESCE(SUM(CASE WHEN direction = 'IN' THEN points ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN direction = 'OUT' THEN points ELSE 0 END), 0) AS net
    FROM pointledger
  `;
  const net = ledgerAgg[0] ?? { inSum: BigInt(0), outSum: BigInt(0), net: BigInt(0) };

  const report = {
    generatedAt: new Date().toISOString(),
    steps: {
      reap: { ok: cron.reaped.ok, reaped: cron.reaped.data?.reaped ?? 0, error: cron.reaped.error ?? null },
      recovery: {
        ok: cron.recovery.ok,
        processed: cron.recovery.data?.processed ?? 0,
        settled: cron.recovery.data?.settled ?? 0,
        released: cron.recovery.data?.released ?? 0,
        inReview: cron.recovery.data?.inReview ?? 0,
        failed: cron.recovery.data?.failed ?? 0,
        error: cron.recovery.error ?? null,
      },
      reconcile: {
        ok: cron.reconcile.ok,
        scanned: cron.reconcile.data?.scanned ?? 0,
        findingsCount: cron.reconcile.data?.findingsCount ?? 0,
        inconsistentCount: cron.reconcile.data?.inconsistentCount ?? 0,
        dryRun: cron.reconcile.data?.dryRun ?? true,
        error: cron.reconcile.error ?? null,
      },
    },
    allStepsSucceeded: cron.allStepsSucceeded,
    settlementStatusCounts: stats.settlementStatusCounts,
    recoveryStatusCounts: stats.recoveryStatusCounts,
    anomalies: stats.anomalies,
    globalLedgerNet: { inSum: net.inSum.toString(), outSum: net.outSum.toString(), net: net.net.toString() },
    findingsByKind: scan.byKind,
    verificationScope: scan.verificationScope,
    findings: scan.findings.map((f) => ({
      taskId: f.taskId,
      kind: f.kind,
      severity: f.severity,
      settlementStatus: f.settlementStatus,
      holdStatus: f.holdStatus,
      recoveryStatus: f.recoveryStatus,
      expected: f.expected,
      actual: f.actual,
      fixable: f.fixable,
      reason: f.reason,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

// 当直接作为命令行脚本运行时触发
if (require.main === module) {
  executeReconciliation()
    .then((r) => {
      if (r.findings.length > 0) {
        console.error(`[token-settlement-reconciliation] 发现 ${r.findings.length} 条不一致，请人工复核（本脚本不静默修复）`);
        process.exit(1);
      }
      console.log("[token-settlement-reconciliation] 对账零差错");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[token-settlement-reconciliation] 执行致命崩溃:", (err as Error)?.message || err);
      process.exit(1);
    });
}
