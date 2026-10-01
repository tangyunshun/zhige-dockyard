/**
 * 已注销用户数据自动物理清理（被遗忘权定时任务）
 *
 * 对应 admin-user-deletion.ts 顶部注释预留的「独立定时任务物理清理」扩展点：
 * 管理员删除默认只做软删除（status=deleted + 匿名化），物理清理交由本独立任务在保留期后执行。
 *
 * 处理对象：status === "deleted" 且 updatedAt 早于保留期（默认 ~6 个月）的用户。
 * 锚点说明：finalizeAccountDeletion 通过 prisma.user.update 将账号置为 deleted 并刷新 updatedAt，
 *           终态 deleted 账号此后不再被业务改动，故 updatedAt 即「注销完成」时刻，可免迁移作为保留期锚点。
 *
 * 归属安全（复用 analyzeUserDeletion）：
 *  - 情况 C 企业唯一所有者 → 跳过，留待人工移交所有权后再清理（红线，绝不自动删企业资产）；
 *  - 企业非唯一所有者 → 将 workspace.ownerId 改派给其他 OWNER 成员（释放 FK，避免 Restrict 阻断）；
 *  - 个人空间所有者 → 物理删除其个人工作空间（含成员/文档/资产级联，被遗忘权下个人数据彻底清除）；
 *  - 最后物理删除用户行（级联清理设备索引、API Key、会话、操作日志等）。
 *
 * 默认 dryRun（仅统计待清理清单，零写入），需显式 execute 才真正删除；整体幂等可重复调用。
 */
import { prisma } from "@/lib/prisma";
import { analyzeUserDeletion } from "@/lib/admin-user-deletion";

const DEFAULT_RETENTION_DAYS = 182; // 约半年
const MAX_LIMIT = 1000;

export interface AutoPurgeOptions {
  limit?: number;
  retentionDays?: number;
  dryRun?: boolean;
  operator?: string;
}

export interface AutoPurgeResult {
  cutoff: string;
  retentionDays: number;
  dryRun: boolean;
  scanned: number;
  purged: number;
  skipped: number;
  purgedIds: string[];
  skippedItems: { id: string; reason: string }[];
}

export async function runDeletedUserAutoPurgeCron(
  opts: AutoPurgeOptions = {}
): Promise<AutoPurgeResult> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), MAX_LIMIT);
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const dryRun = opts.dryRun ?? true;
  const operator = opts.operator || "system:auto-purge";
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: { status: "deleted", updatedAt: { lt: cutoff } },
    select: { id: true },
    take: limit,
  });

  const purgedIds: string[] = [];
  const skippedItems: { id: string; reason: string }[] = [];

  for (const { id } of candidates) {
    try {
      const preview = await analyzeUserDeletion(id);
      if (!preview.exists) continue;

      // 情况 C：企业唯一所有者，红线拦截，跳过留人工处理
      if (preview.case === "ENTERPRISE_SOLE_OWNER") {
        skippedItems.push({ id, reason: preview.blockers.join("；") || "企业空间唯一所有者，跳过自动清理" });
        continue;
      }

      // dry-run：仅统计将清理清单，不执行任何写入
      if (dryRun) {
        purgedIds.push(id);
        continue;
      }

      // 企业非唯一所有者：改派 ownerId 给其他 OWNER 成员，释放外键
      for (const w of preview.dataSummary.ownedEnterpriseWorkspaces) {
        if (!w.soleOwner) {
          const newOwner = await prisma.workspacemember.findFirst({
            where: { workspaceId: w.id, role: "OWNER", userId: { not: id } },
            select: { userId: true },
          });
          if (newOwner) {
            await prisma.workspace.update({
              where: { id: w.id },
              data: { ownerId: newOwner.userId },
            });
          }
        }
      }

      // 个人空间所有者：物理删除其个人工作空间（被遗忘权：个人数据彻底清除）
      const personalWsIds = preview.dataSummary.ownedPersonalWorkspaces.map((w) => w.id);
      if (personalWsIds.length > 0) {
        await prisma.workspace.deleteMany({ where: { id: { in: personalWsIds } } });
      }

      // 物理删除用户行，级联清理设备索引 / API Key / 会话 / 操作日志等子表
      await prisma.user.delete({ where: { id } });
      purgedIds.push(id);
    } catch (err) {
      skippedItems.push({ id, reason: err instanceof Error ? err.message : "清理异常" });
    }
  }

  console.log(
    `[auto-purge:deleted-users] operator=${operator} dryRun=${dryRun} cutoff=${cutoff.toISOString()} ` +
      `scanned=${candidates.length} purged=${purgedIds.length} skipped=${skippedItems.length}`
  );

  return {
    cutoff: cutoff.toISOString(),
    retentionDays,
    dryRun,
    scanned: candidates.length,
    purged: purgedIds.length,
    skipped: skippedItems.length,
    purgedIds,
    skippedItems,
  };
}
