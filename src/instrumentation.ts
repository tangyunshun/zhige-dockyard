/**
 * Next.js 启动钩子（Instrumentation）
 *
 * 在 Node.js server 启动时注册进程内定时任务。
 * 当前承担「算力分桶到期清零」的每日周期调度（兜底），
 * 与系统级 cron 脚本 scripts/expire-points-cron.ts 互为冗余，确保每日至少清算一次。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 防止 dev / HMR 下重复注册多个定时器
  const g = globalThis as unknown as { __pointsExpireScheduled?: boolean };
  if (g.__pointsExpireScheduled) return;
  g.__pointsExpireScheduled = true;

  const DAY_MS = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const { expireExpiredGrants } = await import("@/lib/credit-service");
      const cleared = await expireExpiredGrants({});
      console.log(`[points-expire] 每日到期清算完成，清零 ${cleared} 算力点`);
    } catch (e) {
      console.error("[points-expire] 每日到期清算失败:", e);
    }
  };

  // 启动 60s 后首跑（避开启动高峰），之后每 24h 一次
  setTimeout(async () => {
    await run();
    setInterval(run, DAY_MS);
  }, 60 * 1000);

  // 僵尸用户每日扫描：刷新 is_zombie 标记并向超级管理员推送清理提醒。
  // 首跑延后 90s（避开算力清算与启动高峰），之后每 24h 一次；与 scripts/zombie-scan-cron.ts 互为兜底。
  const scanZombies = async () => {
    try {
      const { scanAndNotifyZombies } = await import("@/lib/zombie-user");
      const res = await scanAndNotifyZombies();
      console.log(
        `[zombie-scan] 每日扫描完成，识别 ${res.zombieCount} 个僵尸用户，已通知 ${res.notified} 位超级管理员`
      );
    } catch (e) {
      console.error("[zombie-scan] 每日扫描失败:", e);
    }
  };

  setTimeout(async () => {
    await scanZombies();
    setInterval(scanZombies, DAY_MS);
  }, 90 * 1000);
}
