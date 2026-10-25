/**
 * 一次性修复：workspace.workspacequotaId 外键补录。
 *
 * 背景：Prisma 模型中 workspace.workspacequota 关系走 workspace.workspacequotaId 外键，
 * 但历史上大量配额记录是通过「独立 create」（自愈补建 / 脚本补录）产生的，
 * 只写了 workspacequota.workspaceId，从未回写 workspace.workspacequotaId（为 NULL）。
 * 导致所有 `include: { workspacequota: true }` 的读取点取到 null（如调度面板算力点显示 0）。
 *
 * 本脚本按 workspacequota.workspaceId 正向把外键补齐（幂等，可重复执行）。
 */
import { prisma } from "../src/lib/prisma";

(async () => {
  const quotas = await prisma.workspacequota.findMany({ select: { id: true, workspaceId: true } });
  let fixed = 0;
  let already = 0;
  for (const q of quotas) {
    const ws = await prisma.workspace.findUnique({
      where: { id: q.workspaceId },
      select: { id: true, workspacequotaId: true },
    });
    if (!ws) continue;
    if (ws.workspacequotaId === q.id) {
      already++;
      continue;
    }
    if (ws.workspacequotaId && ws.workspacequotaId !== q.id) {
      console.log(`冲突：空间 ${q.workspaceId} 已指向其它配额 ${ws.workspacequotaId}，跳过（配额 ${q.id}）`);
      continue;
    }
    await prisma.workspace.update({
      where: { id: q.workspaceId },
      data: { workspacequotaId: q.id },
    });
    console.log(`已修复: workspace ${q.workspaceId} → workspacequotaId = ${q.id}`);
    fixed++;
  }
  console.log(`\n完成：修复 ${fixed} 个，已正确 ${already} 个，配额记录总数 ${quotas.length}`);
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(String(e).slice(0, 600));
  await prisma.$disconnect();
  process.exit(1);
});
