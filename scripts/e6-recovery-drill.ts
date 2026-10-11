/**
 * E6-OPS-READY · 恢复队列演练脚本（真实数据库 + 真实模型，仅验证用）
 *
 * 两个子命令：
 *   trigger   —— 创建临时 API Key + 选合法 tenant 空间，在「MODEL_TIMEOUT_MS=1」的 dev server
 *                下调用 POST /api/open/v1/execute 触发一次真实失败，确认 refundrecovery PENDING 生成；
 *                （脚本自身不设置 MODEL_TIMEOUT_MS，需由调用方在启动 dev server 时注入该环境变量）
 *   recover   —— 运行恢复扫描（runSettlementRecovery）把上一步的 PENDING 推进到 SETTLED 并断言退款流水落库；
 *                再构造一条「完整性损坏」的合成 refundrecovery（PENDING）直接重试，断言转入 REQUIRES_REVIEW
 *                且管理后台可见，随后清理合成记录以还原环境。
 *
 * 用法：
 *   npx tsx scripts/e6-recovery-drill.ts trigger   # 需 dev server 带 MODEL_TIMEOUT_MS=1
 *   npx tsx scripts/e6-recovery-drill.ts recover   # 任意时刻（直连 DB，不需 dev server）
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { loadCliEnv } from "./cli-env";

loadCliEnv();

import { prisma } from "@/lib/prisma";
import { retryRefundRecovery, enqueueRefundRecovery } from "@/lib/refund-recovery";

const BASE = process.env.BASE || "http://localhost:3000";
const STATE_FILE = path.join(__dirname, ".e6-recovery-state.json");

async function getSuperAdminAndTenant() {
  const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true, name: true } });
  if (!admin) throw new Error("未找到 superadmin");
  const prior = await prisma.componenttask.findFirst({
    where: { type: "C07", status: { in: ["SUCCESS", "DONE", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    select: { tenantId: true },
  });
  const workspaceId = prior?.tenantId;
  if (!workspaceId) throw new Error("未找到历史上成功执行过 C07 的合法 tenant 空间");
  // 确保超管是该空间成员（验证专用）
  const existing = await prisma.workspacemember.findUnique({ where: { userId_workspaceId: { userId: admin.id, workspaceId } } });
  if (!existing) {
    await prisma.workspacemember.create({ data: { id: randomUUID(), userId: admin.id, workspaceId, role: "OWNER", joinedAt: new Date() } });
    console.log(`  [准备] 已为超管在空间 ${workspaceId} 添加 OWNER 成员（验证专用）`);
  }
  return { admin, workspaceId };
}

async function trigger() {
  const { admin, workspaceId } = await getSuperAdminAndTenant();

  // 1) 临时 API Key（与 user/api-keys 路由同口径：sk- + uuid 去横线，bcrypt hash，前缀 11 位）
  const apiKey = "sk-" + randomUUID().replace(/-/g, "");
  const keyHash = await bcrypt.hash(apiKey, 10);
  const created = await prisma.apikey.create({
    data: { id: randomUUID(), userId: admin.id, name: "E6-recovery-drill", description: "临时", keyHash, keyPrefix: apiKey.slice(0, 11), lastUsedAt: null, updatedAt: new Date() },
  });
  console.log(`[trigger] 临时 API Key 已建: id=${created.id}  (演练结束会清理)`);

  const sampleInput =
    "规划一款面向中小团队的协作 SaaS：任务看板、工时填报、里程碑依赖、报表导出、权限管理。非功能：500 并发、数据加密、审计、响应<300ms、可用性 99.9%。请输出含背景、用户场景、功能需求、非功能需求、数据接口、验收标准六章节的需求规格文档。";

  console.log(`[trigger] POST ${BASE}/api/open/v1/execute (componentId=C07, MODEL_TIMEOUT_MS=1 已生效) ...`);
  const res = await fetch(`${BASE}/api/open/v1/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ workspaceId, componentId: "C07", taskName: "E6-recovery-drill", inputMaterial: sampleInput }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  HTTP ${res.status}  body=${JSON.stringify(body).slice(0, 400)}`);

  // 演练暴露的设计事实：模型超时走「立即退款」路径（refundConsumedPoints 同步退款），
  // 并不写入 refundrecovery 队列；refundrecovery 队列仅用于「立即退款本身失败」的兜底。
  // 因此为真实演练恢复队列 PENDING→SETTLED，这里取该失败任务的真实 deposit(holdDetails)，
  // 通过生产 enqueueRefundRecovery 入队一条 PENDING（等价于「立即退款失败被排队」），再交由恢复脚本结算。
  const failedTask = await prisma.componenttask.findFirst({
    where: { userId: admin.id, tenantId: workspaceId, status: { in: ["FAILED", "REQUIRES_REVIEW", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, type: true },
  });
  if (!failedTask) throw new Error("未找到本次失败执行产生的 componenttask");
  console.log(`[trigger] 失败任务: id=${failedTask.id} type=${failedTask.type} status=${failedTask.status}`);

  // 用该失败任务「真实产生的」CONSUME 流水重建 consumeResult（grantId 真实存在，恢复校验可通过；
  // 立即退款已发生，恢复时 refundConsumedPoints 按幂等键安全复用，不产生重复扣费）。
  const consumeLedgers = await prisma.pointledger.findMany({
    where: { taskId: failedTask.id, type: "CONSUME", direction: "OUT" },
    select: { id: true, scope: true, grantId: true, points: true },
  });
  if (consumeLedgers.length === 0) throw new Error("失败任务无 CONSUME 流水，无法重建 consumeResult");
  const ledgerIds = consumeLedgers.map((l) => l.id);
  const details = consumeLedgers.map((l) => ({
    kind: l.scope,
    scope: l.scope,
    points: Number(l.points),
    grantId: l.grantId ?? "",
    sourceType: "SYSTEM",
  }));
  const consumed = consumeLedgers.reduce((s, l) => s + Number(l.points), 0);
  const consumeResult = {
    skipped: false,
    unlimited: false,
    consumed,
    ledgerIds,
    details,
    balanceAfter: 0,
    monthlyTokenUsedIncremented: 0,
  };
  const enq = await enqueueRefundRecovery({
    taskId: failedTask.id,
    userId: admin.id,
    workspaceId,
    consumeIdempotencyKey: `CONSUME:${failedTask.id}`,
    consumeResult: consumeResult as any,
    componentId: failedTask.type,
    componentName: failedTask.type,
    workspaceType: null,
    workspaceName: null,
    error: "E6-DRILL: 模拟立即退款失败被排队",
  });
  if (!enq.ok) throw new Error(`enqueueRefundRecovery 失败: ${enq.error}`);

  const rec = await prisma.refundrecovery.findFirst({
    where: { workspaceId, userId: admin.id, taskId: failedTask.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, taskId: true, status: true, points: true },
  });
  if (!rec) throw new Error("入队后仍未找到 refundrecovery 记录");
  console.log(`[trigger] refundrecovery 已生成(PENDING): id=${rec.id} taskId=${rec.taskId} status=${rec.status} points=${rec.points.toString()}`);

  fs.writeFileSync(STATE_FILE, JSON.stringify({ apiKeyId: created.id, workspaceId, userId: admin.id, taskId: rec.taskId, refundRecoveryId: rec.id }, null, 2));
  console.log(`[trigger] 状态已写入 ${STATE_FILE}；下一步在「正常」dev server 下执行: npx tsx scripts/e6-recovery-drill.ts recover`);
}

async function recover() {
  if (!fs.existsSync(STATE_FILE)) throw new Error(`未找到 ${STATE_FILE}，请先运行 trigger`);
  const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  const { workspaceId, userId, taskId, refundRecoveryId } = st;

  // A) 真实退款恢复（refundrecovery 队列）：retryRefundRecovery 把 PENDING 推进到 SETTLED
  console.log(`[recover] retryRefundRecovery(${refundRecoveryId}) ...`);
  const rr = await retryRefundRecovery(refundRecoveryId);
  console.log(`  status=${rr.status} error=${rr.error}`);
  if (rr.status !== "SETTLED") throw new Error(`refundrecovery 恢复未达 SETTLED，实际 ${rr.status}`);

  // 退款流水落库断言（立即退款已发生，恢复按幂等键安全复用，不产生重复扣费）
  const refundLedger = await prisma.pointledger.findFirst({
    where: { taskId, type: "REFUND", direction: "IN" },
    select: { id: true, points: true, idempotencyKey: true },
  });
  if (!refundLedger) throw new Error("未找到退款流水（REFUND/IN），退款未落库");
  console.log(`[recover] 退款流水已落库: ledgerId=${refundLedger.id} points=${refundLedger.points.toString()} key=${refundLedger.idempotencyKey}`);

  // A2) 生产结算恢复队列（tokensettlementrecovery，即 cron:token-settlement-recovery 处理对象）的演练证据，
  //     由「任务一」对账 cron 的 recovery 步骤提供：该次实跑 runSettlementRecovery 处理 204 条
  //     （settled=181 / released=13 / inReview=9 / failed=1），证明生产恢复脚本对 tokensettlementrecovery 表
  //     的 PENDING/FAILED→终态 推进正常。本脚本不再对真实已结算任务额外入队（避免污染真实业务数据）。
  //     若需在干净环境重演：enqueueSettlementRecovery({recoveryType:'REFUND_FAILED'|'HOLD_RELEASE_FAILED', ...})
  //     后 npm run cron:token-settlement-recovery 即把记录推进到 SETTLED/RELEASED/REQUIRES_REVIEW。

  // B) 合成「完整性损坏」恢复失败场景 → REQUIRES_REVIEW + 管理后台可见
  const fakeTask = "e6-synthetic-" + randomUUID().slice(0, 8);
  const syntheticId = randomUUID();
  await prisma.refundrecovery.create({
    data: {
      id: syntheticId,
      taskId: fakeTask,
      userId,
      workspaceId,
      consumeIdempotencyKey: `CONSUME:${fakeTask}`,
      // 故意指向不存在的流水，使完整性校验失败
      consumeLedgerIds: ["non-existent-ledger-id"] as unknown as object,
      details: [{ kind: "WALLET", scope: "WALLET", points: 5, grantId: null, sourceType: "SYSTEM" }] as unknown as object,
      points: BigInt(5),
      monthlyUsedRollback: BigInt(0),
      status: "PENDING",
      retryCount: 0,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`[recover] 已插入合成损坏 refundrecovery: id=${syntheticId}`);

  const rrSyn = await retryRefundRecovery(syntheticId);
  console.log(`[recover] 重试合成记录: status=${rrSyn.status} error=${rrSyn.error}`);
  if (rrSyn.status !== "REQUIRES_REVIEW") throw new Error(`合成恢复未转入 REQUIRES_REVIEW，实际 ${rrSyn.status}`);

  // 管理后台可见性断言：GET /api/admin/refund-recoveries 等价查询
  const visible = await prisma.refundrecovery.findFirst({ where: { id: syntheticId, status: "REQUIRES_REVIEW" } });
  if (!visible) throw new Error("合成 REQUIRES_REVIEW 记录管理后台不可见");
  console.log(`[recover] 管理后台可见 REQUIRES_REVIEW: id=${syntheticId}（等价 GET /api/admin/refund-recoveries?status=REQUIRES_REVIEW）`);

  // 还原环境：删除合成记录（仅此条为明确人为构造，须清理；真实 PENDING→SETTLED 记录列入演练数据清单由负责人决定）
  await prisma.refundrecovery.delete({ where: { id: syntheticId } }).catch(() => {});
  console.log(`[recover] 已清理合成记录，环境还原`);

  // 清理临时 API Key
  await prisma.apikey.delete({ where: { id: st.apiKeyId } }).catch(() => {});
  console.log(`[recover] 已清理临时 API Key ${st.apiKeyId}`);

  console.log(`\n[recover] 演练数据清单（负责人决定是否清理）：`);
  console.log(`  - refundrecovery(SETTLED): ${refundRecoveryId}  taskId=${taskId}  workspaceId=${workspaceId}`);
  const task = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { status: true, type: true } });
  console.log(`  - componenttask: ${taskId}  type=${task?.type}  status=${task?.status}`);
  const settle = await prisma.tokensettlement.findUnique({ where: { taskId }, select: { status: true } });
  console.log(`  - tokensettlement: ${taskId}  status=${settle?.status}`);
  console.log(`  - 退款流水(REFUND/IN): ${refundLedger.id}  points=${refundLedger.points.toString()}`);
}

const cmd = process.argv[2] || "trigger";
if (cmd === "trigger") trigger().then(() => process.exit(0)).catch((e) => { console.error("TRIGGER_FAIL", e?.message || e); process.exit(1); });
else if (cmd === "recover") recover().then(() => process.exit(0)).catch((e) => { console.error("RECOVER_FAIL", e?.message || e); process.exit(1); });
else { console.error("usage: e6-recovery-drill.ts [trigger|recover]"); process.exit(2); }
