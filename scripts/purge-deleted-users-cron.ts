/**
 * 已注销用户数据自动物理清理 - 独立定时脚本
 *
 * 用途：供系统级定时任务（crontab / Windows 任务计划程序）周期性调用，
 *       或运维手动执行。与 src/lib/account-deletion-auto-purge.ts 配套。
 *
 * 运行：
 *   npm run cron:purge-deleted-users            # 默认 dry-run（仅统计，不删除）
 *   npm run cron:purge-deleted-users -- --execute   # 真正执行物理清理
 *   # 或
 *   npx tsx --tsconfig tsconfig.json scripts/purge-deleted-users-cron.ts --execute
 *
 * 环境变量（可选）：
 *   AUTO_PURGE_EXECUTE=1        等同于 --execute，真正删除
 *   PURGE_RETENTION_DAYS=182   保留期（天），默认 182（约半年）
 *   PURGE_LIMIT=100            单批处理上限，默认 100
 *
 * 系统级调度示例（每日 04:20 执行，先 dry-run 观察，确认后再开启 --execute）：
 *   20 4 * * * cd /path/to/zhige-dockyard-web && npx tsx --tsconfig tsconfig.json scripts/purge-deleted-users-cron.ts --execute >> logs/purge-deleted-users.log 2>&1
 */
import { runDeletedUserAutoPurgeCron } from "@/lib/account-deletion-auto-purge";

async function main() {
  const execute = process.argv.includes("--execute") || process.env.AUTO_PURGE_EXECUTE === "1";
  const retentionDays = process.env.PURGE_RETENTION_DAYS
    ? Number(process.env.PURGE_RETENTION_DAYS)
    : undefined;
  const limit = process.env.PURGE_LIMIT ? Number(process.env.PURGE_LIMIT) : undefined;

  console.log(
    `[purge-deleted-users-cron] 启动，dryRun=${!execute}` +
      `${retentionDays ? ` retentionDays=${retentionDays}` : ""}${limit ? ` limit=${limit}` : ""}`
  );

  const result = await runDeletedUserAutoPurgeCron({
    dryRun: !execute,
    retentionDays,
    limit,
    operator: "cron:purge-deleted-users",
  });

  console.log(
    `[purge-deleted-users-cron] 完成 | cutoff=${result.cutoff} retentionDays=${result.retentionDays} ` +
      `scanned=${result.scanned} purged=${result.purged} skipped=${result.skipped}`
  );
  if (result.skippedItems.length > 0) {
    console.log(`[purge-deleted-users-cron] 跳过清单（需人工处理）：`);
    for (const s of result.skippedItems) {
      console.log(`  - ${s.id}: ${s.reason}`);
    }
  }
  if (!result.dryRun && result.purgedIds.length > 0) {
    console.log(`[purge-deleted-users-cron] 已物理清理用户：${result.purgedIds.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[purge-deleted-users-cron] 执行失败:", e);
    process.exit(1);
  });
