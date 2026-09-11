/**
 * 僵尸用户扫描 - 独立定时脚本
 *
 * 用途：供系统级定时任务（crontab / Windows 任务计划程序）每日调用，
 *       或运维手动执行。与 src/instrumentation.ts 的进程内调度互为兜底。
 *
 * 运行：
 *   npm run cron:zombie-scan
 *   # 或
 *   npx tsx --tsconfig tsconfig.json scripts/zombie-scan-cron.ts
 *
 * 系统级调度示例：
 *   # Linux crontab：每日 03:30 执行，日志追加到文件
 *   30 3 * * * cd /path/to/zhige-dockyard-web && npx tsx --tsconfig tsconfig.json scripts/zombie-scan-cron.ts >> logs/zombie-scan.log 2>&1
 *   # Windows 任务计划程序：触发器“每日 03:30”，操作运行
 *   npx tsx --tsconfig tsconfig.json scripts/zombie-scan-cron.ts
 */
import { scanAndNotifyZombies } from "@/lib/zombie-user";

async function main() {
  console.log("[zombie-scan-cron] 开始全量僵尸用户扫描...");
  const result = await scanAndNotifyZombies();
  console.log(
    `[zombie-scan-cron] 完成，共识别 ${result.zombieCount} 个僵尸用户，已通知 ${result.notified} 位超级管理员`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[zombie-scan-cron] 扫描失败:", e);
    process.exit(1);
  });
