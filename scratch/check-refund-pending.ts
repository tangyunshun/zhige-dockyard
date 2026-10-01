/**
 * 【只读核查】refundrecovery 未决记录归属核查（PENDING / REQUIRES_REVIEW）
 * 只读：findMany，不写任何表。
 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";

loadCliEnv();

async function main() {
  const rows = await prisma.refundrecovery.findMany({
    where: { status: { in: ["PENDING", "PROCESSING", "REQUIRES_REVIEW", "FAILED"] } },
    select: {
      id: true, taskId: true, status: true, points: true,
      consumeIdempotencyKey: true, retryCount: true, lastError: true,
      createdAt: true, updatedAt: true, leaseUntil: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`未决记录共 ${rows.length} 条：`);
  for (const r of rows) {
    // 关联任务信息（只读），判断是否测试遗留
    const task = await prisma.componenttask.findUnique({
      where: { id: r.taskId },
      select: { type: true, status: true, createdAt: true, config: true },
    });
    const cfg = (task?.config ?? {}) as Record<string, unknown>;
    console.log(JSON.stringify({
      recoveryId: r.id,
      status: r.status,
      points: Number(r.points),
      retryCount: r.retryCount,
      lastError: r.lastError?.slice(0, 120),
      createdAt: r.createdAt,
      leaseUntil: r.leaseUntil,
      taskType: task?.type,
      taskStatus: task?.status,
      taskComponent: cfg.workspaceId ? (task?.type) : task?.type,
      taskCreatedAt: task?.createdAt,
    }));
  }

  // 对应任务的账务流水核对（CONSUME/REFUND 配对）
  for (const r of rows) {
    const ledgers = await prisma.pointledger.findMany({
      where: { taskId: r.taskId, type: { in: ["CONSUME", "REFUND"] } },
      select: { type: true, points: true, idempotencyKey: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`taskId=${r.taskId} 流水:`, JSON.stringify(ledgers.map((l) => ({ type: l.type, points: Number(l.points), key: l.idempotencyKey }))));
  }
}

main()
  .catch((e) => { console.error("核查失败:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
