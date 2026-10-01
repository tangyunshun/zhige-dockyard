// 只读脱敏 manifest（批次 CORE-3-GOLDEN-PATH-FINAL-CLOSURE 第七节）
// 仅做 SELECT 查询，绝不写入/删除/更新任何数据，绝不打印会话字段、JWT、密码、API Key。
import { prisma } from "../src/lib/prisma";

const USER = "cmtd04l660000y2miz6av52qn";
const WS = "ws-enterprise-1787927954618-9arzol";
const COMPS = ["C01", "C02", "C07"];

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER },
    select: { id: true, name: true, status: true, sessionToken: true, sessionExpiresAt: true },
  });
  // 当前测试余额：pointledger 按类型汇总点数（CONSUME 为负、REFUND/GRANT 为正）
  const ledger = await prisma.pointledger.findMany({
    where: { userId: USER },
    select: { type: true, points: true, taskId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const net = ledger.reduce((s, l) => s + Number(l.points), 0);
  const grants = await prisma.pointgrant.count({ where: { userId: USER } });

  const tasks = await prisma.componenttask.findMany({
    where: { userId: USER, type: { in: COMPS } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true, type: true, status: true,
      createdAt: true,
      result: true, config: true,
    },
  });

  const taskIds = tasks.map((t) => t.id);
  const consume = await prisma.pointledger.findMany({
    where: { userId: USER, type: "CONSUME", taskId: { in: taskIds } },
    select: { taskId: true, points: true },
  });
  const refund = await prisma.pointledger.findMany({
    where: { userId: USER, type: "REFUND", taskId: { in: taskIds } },
    select: { taskId: true, points: true },
  });
  const recovery = await prisma.refundrecovery.findMany({
    where: { taskId: { in: taskIds } },
    select: { taskId: true, status: true, createdAt: true },
  });
  const usage = await prisma.componentusage.count({ where: { userId: USER, componentId: { in: COMPS }, workspaceId: WS } });

  const taskView = tasks.map((t) => {
    const res: any = t.result && typeof t.result === "object" ? t.result : {};
    const cfg: any = t.config && typeof t.config === "object" ? t.config : {};
    const cons = consume.filter((c) => c.taskId === t.id).reduce((s, c) => s + Number(c.points), 0);
    const ref = refund.filter((r) => r.taskId === t.id).reduce((s, r) => s + Number(r.points), 0);
    return {
      id: t.id, type: t.type, status: t.status,
      errorCode: res.errorCode || cfg.errorCode || null,
      chargeAttempted: typeof cfg.chargeAttempted === "boolean" ? cfg.chargeAttempted : null,
      contractVersion: cfg.contractVersion || (cfg.contractSnapshot && (cfg.contractSnapshot as any).contractVersion) || null,
      executionMode: cfg.executionMode, billingMode: cfg.billingMode,
      estimatedPoints: cfg.estimatedPoints,
      artifactCount: Array.isArray(res.artifacts) ? res.artifacts.length : 0,
      hasArtifact: res.hasArtifact, outputDataNull: res.outputData === null,
      consumed: cons, refunded: ref,
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    user: { id: user?.id, name: user?.name, status: user?.status, sessionExpiresAt: user?.sessionExpiresAt, sessionTokenRedacted: user?.sessionToken ? "<set>" : null },
    ledgerNetPoints: net,
    pointGrantCount: grants,
    usageRows: usage,
    tasks: taskView,
    refundRecovery: recovery,
    consumedTotal: consume.reduce((s, c) => s + Number(c.points), 0),
    refundedTotal: refund.reduce((s, r) => s + Number(r.points), 0),
  };
  console.log(JSON.stringify(manifest, null, 2));
}

main()
  .catch((e) => { console.error("MANIFEST_ERR", e && e.message ? e.message : String(e)); process.exit(2); })
  .finally(() => prisma.$disconnect());
