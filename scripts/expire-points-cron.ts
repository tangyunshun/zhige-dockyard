/**
 * 算力分桶到期清零 - 独立定时脚本
 *
 * 用途：供系统级定时任务（crontab / Windows 任务计划程序）每日调用，
 *       或运维手动执行。与 src/instrumentation.ts 的进程内调度互为兜底。
 *
 * 运行：
 *   npm run cron:expire-points
 *   # 或
 *   npx tsx --tsconfig tsconfig.json scripts/expire-points-cron.ts
 *
 * 系统级调度示例：
 *   # Linux crontab：每日 03:10 执行，日志追加到文件
 *   10 3 * * * cd /path/to/zhige-dockyard-web && npx tsx --tsconfig tsconfig.json scripts/expire-points-cron.ts >> logs/expire-points.log 2>&1
 *   # Windows 任务计划程序：触发器“每日 03:10”，操作运行
 *   npx tsx --tsconfig tsconfig.json scripts/expire-points-cron.ts
 */
import { expireExpiredGrants } from "@/lib/credit-service";

async function main() {
  console.log("[expire-points-cron] 开始全局算力分桶到期清算...");
  const cleared = await expireExpiredGrants({});
  console.log(`[expire-points-cron] 完成，共清零 ${cleared} 算力点`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[expire-points-cron] 清算失败:", e);
    process.exit(1);
  });
