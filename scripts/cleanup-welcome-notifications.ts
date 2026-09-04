/**
 * 一次性数据修复脚本：清理因旧逻辑误注入到老用户身上的默认欢迎/安全通知。
 *
 * 策略：
 * 1. 仅处理注册时间超过 24 小时的用户（视为老用户）。
 * 2. 删除这些用户身上标题为默认欢迎/安全通知的记录。
 * 3. 将对应用户的 usernotification.defaultsSeeded 标记为 true，防止后续代码再次注入。
 *
 * 运行方式（Windows PowerShell，从 .env 读取 DATABASE_URL）：
 *   cd zhige-dockyard-web
 *   $env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=(.*)$' } | ForEach-Object { $matches[1] }); npx tsx scripts/cleanup-welcome-notifications.ts
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_TITLES = [
  "🎉 欢迎使用知阁舟坊工作台！",
  "🔐 账号安全防护已开启",
];

async function main() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const affected = await prisma.$transaction(async (tx) => {
    const oldUsers = await tx.user.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const userIds = oldUsers.map((u) => u.id);

    if (userIds.length === 0) {
      console.log("未发现老用户，无需清理");
      return { deleted: 0, marked: 0 };
    }

    console.log(`发现 ${userIds.length} 位老用户，准备清理默认通知...`);

    const deleteResult = await tx.notification.deleteMany({
      where: {
        userId: { in: userIds },
        title: { in: DEFAULT_TITLES },
      },
    });

    const existingPrefs = await tx.usernotification.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });
    const existingUserIds = new Set(existingPrefs.map((p) => p.userId));
    const missingUserIds = userIds.filter((id) => !existingUserIds.has(id));

    if (missingUserIds.length > 0) {
      await tx.usernotification.createMany({
        data: missingUserIds.map((userId) => ({
          id: crypto.randomUUID(),
          userId,
          defaultsSeeded: true,
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });
    }

    await tx.usernotification.updateMany({
      where: { userId: { in: userIds } },
      data: { defaultsSeeded: true },
    });

    return { deleted: deleteResult.count, marked: userIds.length };
  });

  console.log(
    `清理完成：删除 ${affected.deleted} 条默认通知，标记/创建 ${affected.marked} 位用户的 defaultsSeeded=true`
  );
}

main()
  .catch((e) => {
    console.error("清理脚本执行失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
