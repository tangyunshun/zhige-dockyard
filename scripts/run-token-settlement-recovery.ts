/**
 * 🚢 知阁·舟坊 - Token 结算恢复队列独立生产执行脚本
 *
 * 用途：供生产环境定时任务（crontab / Windows 任务计划程序）周期调用，
 *       或运维手动执行恢复扫描。
 *
 * 运行示例：
 *   npm run cron:token-settlement-recovery -- --limit 50 --worker-id worker-prod-1
 *   # 或
 *   npx tsx --tsconfig tsconfig.json scripts/run-token-settlement-recovery.ts --limit 20
 */
import { randomUUID } from "crypto";
import { loadCliEnv } from "./cli-env";

// 1. 统一加载 CLI 环境变量（不输出任何密钥明文）
loadCliEnv();

import { runSettlementRecovery, reapExpiredHolds } from "@/lib/token-settlement-service";

export interface CliRecoveryOptions {
  limit: number;
  workerId: string;
  leaseDurationMs: number;
}

export interface RecoveryExecutionResult {
  reaped: number;
  processed: number;
  settled: number;
  released: number;
  inReview: number;
  failed: number;
}

export function parseRecoveryArgs(args: string[] = process.argv.slice(2)): CliRecoveryOptions {
  let limit = 20;
  let workerId = `worker-${randomUUID().slice(0, 8)}`;
  let leaseDurationMs = 60000;

  const MAX_CLI_LIMIT = 1000;
  const MIN_LEASE_MS = 1000;
  const MAX_LEASE_MS = 30 * 60 * 1000;
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
    }
  }

  return { limit, workerId, leaseDurationMs };
}

export async function executeRecovery(opts?: Partial<CliRecoveryOptions>): Promise<RecoveryExecutionResult> {
  const parsed = parseRecoveryArgs();
  const limit = opts?.limit ?? parsed.limit;
  const workerId = opts?.workerId ?? parsed.workerId;
  const leaseDurationMs = opts?.leaseDurationMs ?? parsed.leaseDurationMs;

  console.log(
    `[token-settlement-recovery] 步骤 1: 开始扫描并回收过期预扣 HOLD (limit=${limit})...`
  );
  const reapRes = await reapExpiredHolds({ limit });
  const reaped = reapRes.reapedCount;
  console.log(`[token-settlement-recovery] 步骤 1 完成: 回收过期预扣=${reaped}`);

  console.log(
    `[token-settlement-recovery] 步骤 2: 开始执行恢复队列扫描 (limit=${limit}, workerId=${workerId}, leaseMs=${leaseDurationMs})...`
  );
  const recoveryRes = await runSettlementRecovery({
    limit,
    workerId,
    leaseMs: leaseDurationMs,
    leaseDurationMs,
  });

  const finalResult: RecoveryExecutionResult = {
    reaped,
    processed: recoveryRes.processed,
    settled: recoveryRes.settled,
    released: recoveryRes.released,
    inReview: recoveryRes.inReview,
    failed: recoveryRes.failed,
  };

  console.log(
    `[token-settlement-recovery] 恢复执行全部完成: 回收预扣=${finalResult.reaped}, 共处理=${finalResult.processed}, 已结算=${finalResult.settled}, 已释放=${finalResult.released}, 转人工复核=${finalResult.inReview}, 失败=${finalResult.failed}`
  );

  return finalResult;
}

// 当直接作为命令行脚本运行时触发
if (require.main === module) {
  executeRecovery()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[token-settlement-recovery] 执行致命崩溃:", (err as Error)?.message || err);
      process.exit(1);
    });
}
