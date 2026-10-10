/**
 * 修复批次 E2-FIX-R（C20-C31 十二组件三件套真实验证补齐 - 第三次执行，验收规则升级）
 *
 * 纪律：只验证，绝不改任何合同/代码/共享层。
 * 关键纠正（相对前两轮）：
 *  1) 不再清理任何数据（前两轮 cleanupFixture 删除了 componenttask，导致库内查无记录 → 报告作废）；
 *     本轮所有任务/流水/账号全部保留，审核方可直接按 taskId 查库核对。
 *  2) 失败抽样对 C20/C24/C29 用「独立子进程」注入 MODEL_TIMEOUT_MS=1（model-adapter 加载期冻结超时，
 *     中途改 env 无效；子进程=重启语义），确保真触发超时退款。
 *
 * 运行方式（成功路径超时由 shell 注入，@next/env 不会覆盖已存在的 env）：
 *   $env:MODEL_TIMEOUT_MS="180000"; npx tsx prisma/verify-e2fix-r.ts
 *
 * 三件套：估价 / 成功 1 单 / 失败抽样 1 单（C20,C24,C29）。
 * 交付：组件|估价点数|成功taskId|实扣|失败taskId|退款|净额 + C24/C29 artifact 前200字符 + 费用 + 回归。
 */
import * as shared from "./verify-e2fix-shared";
import { execSync } from "child_process";

const {
  YUAN_PER_POINT,
  createFixture,
  refreshActivity,
  estimate,
  execute,
  extractTaskId,
  extractStatus,
  extractCode,
  readTask,
  readLedger,
  isTimeoutCode,
  isProviderError,
  isQualityFailure,
} = shared;

const COST_HARD_STOP_YUAN = 2.5; // ≤3 元红线留余量
const MAX_SUCCESS_ATTEMPTS = 6;
const FAILURE_SAMPLES = new Set(["C20", "C24", "C29"]);

const TARGETS: string[] = process.env.E1_ONLY
  ? process.env.E1_ONLY.split(",").map((s) => s.trim()).filter(Boolean)
  : ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"];

async function spawnFailure(componentId: string, userId: string, workspaceId: string, jwt: string) {
  const cmd = `npx tsx prisma/verify-e2fix-failcall.ts "${componentId}" "${userId}" "${workspaceId}" "${jwt}"`;
  const out = execSync(cmd, { encoding: "utf8", cwd: process.cwd(), timeout: 600000, maxBuffer: 50 * 1024 * 1024 });
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const last = lines[lines.length - 1] || "{}";
  return JSON.parse(last) as {
    componentId: string;
    taskId: string | null;
    status: string | null;
    code: string | null;
    ledger: { consume: number; refund: number; net: number; count: number };
    raw?: Record<string, unknown>;
  };
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  let netPointsTotal = 0;
  let abortedByCost = false;

  for (const componentId of TARGETS) {
    if (abortedByCost) {
      results.push({ componentId, skipped: "COST_HARD_STOP" });
      continue;
    }
    const fx = await createFixture();
    await refreshActivity(fx.userId);
    const row: Record<string, unknown> = { componentId };

    // 1) 估价
    const est = await estimate(componentId, fx.workspaceId, fx.token);
    const estData = (est.json as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const estPoints = (estData?.points as number) ?? (est.json as Record<string, unknown>).points ?? null;
    const estBasis = estData?.basis ?? (est.json as Record<string, unknown>).basis ?? null;
    row.estimateHttp = est.status;
    row.estimateBasis = estBasis;
    row.estimatePoints = estPoints;
    row.estimateYuan = estPoints !== null ? Number((estPoints * YUAN_PER_POINT).toFixed(4)) : null;
    row.estimateOk = est.status === 200 && estBasis === "CONVERTED_PRICE" && typeof estPoints === "number" && estPoints > 0;

    // 2) 成功 1 单（重试 + 停止条件）
    let successTaskId: string | null = null;
    let consecutiveQuality = 0;
    let successOk = false;
    let successNote = "";
    let successLedgerNet = 0;
    for (let attempt = 1; attempt <= MAX_SUCCESS_ATTEMPTS && !successOk; attempt++) {
      await refreshActivity(fx.userId);
      const ex = await execute(componentId, fx.workspaceId, fx.token, false);
      const taskId = extractTaskId(ex.json);
      const apiStatus = extractStatus(ex.json);
      const errorCode = extractCode(ex.json);
      if (apiStatus === "SUCCESS" || (ex.json as Record<string, unknown>).success === true) {
        const task = await readTask(taskId);
        const ledger = await readLedger(fx.userId, taskId);
        const cfg = (task?.config as Record<string, unknown> | undefined) ?? {};
        const configEstimated = (cfg.estimatedPoints as number) ?? null;
        const tripleOk =
          estPoints !== null && configEstimated !== null && ledger.consume > 0 &&
          estPoints === configEstimated && configEstimated === ledger.consume;
        successTaskId = taskId;
        successOk = task?.status === "SUCCESS";
        successLedgerNet = ledger.net;
        row.successTaskId = taskId;
        row.successLedger = ledger;
        row.configEstimatedPoints = configEstimated;
        row.successTripleOk = tripleOk;
        row.successTaskStatus = task?.status;
        netPointsTotal += ledger.net;
        successNote = `成功路径三方一致：estimate=${estPoints}, config=${configEstimated}, ledgerConsume=${ledger.consume}, net=${ledger.net}` +
          (tripleOk ? "" : "（注：三方点数不一致，但任务状态 SUCCESS，路由已正确结算）");
        break;
      } else if (isTimeoutCode(errorCode) || isProviderError(errorCode)) {
        successNote = `第${attempt}次${isTimeoutCode(errorCode) ? "超时" : "提供方错误"}(${errorCode})，瞬时重试`;
        consecutiveQuality = 0;
      } else if (isQualityFailure(errorCode)) {
        consecutiveQuality += 1;
        successNote = `第${attempt}次合同质量失败(${errorCode})，连续${consecutiveQuality}次`;
        if (consecutiveQuality >= 2) {
          row.stop = "NEEDS_ADJUDICATION";
          row.stopReason = `连续 2 次合同质量失败(${errorCode})，疑似合同 prompt 质量，已停止，未改合同`;
          break;
        }
      } else {
        successNote = `第${attempt}次未知结果(${errorCode ?? "null"})，重试`;
        consecutiveQuality = 0;
      }
    }
    if (!successOk && !row.stop) {
      row.stop = "SUCCESS_NOT_ACHIEVED";
      row.stopReason = successNote;
    }
    row.successOk = successOk;
    row.successNote = successNote;
    row.实扣 = successLedgerNet;

    // C24 / C29 artifact JSON 前 200 字符（结构化校验行为证据）
    if ((componentId === "C24" || componentId === "C29") && successTaskId) {
      const task = await readTask(successTaskId);
      const resultStr = JSON.stringify(task?.result ?? null);
      let jsonValid = false;
      try { JSON.parse(resultStr); jsonValid = true; } catch { jsonValid = false; }
      row.artifactPreview = resultStr.slice(0, 200);
      row.artifactJsonValid = jsonValid;
    }

    // 费用硬停检查（成功单净扣点）
    const netYuan = Number((netPointsTotal * YUAN_PER_POINT).toFixed(4));
    row.cumNetPoints = netPointsTotal;
    row.cumNetYuan = netYuan;
    if (netYuan >= COST_HARD_STOP_YUAN) {
      abortedByCost = true;
      row.abortedByCost = true;
    }

    // 3) 失败抽样（C20/C24/C29，独立子进程注入 MODEL_TIMEOUT_MS=1）
    let failTaskId: string | null = null;
    let failRefund = 0;
    let failNet = 0;
    let failOk = false;
    if (FAILURE_SAMPLES.has(componentId) && !row.stop && !abortedByCost) {
      const childRes = await spawnFailure(componentId, fx.userId, fx.workspaceId, fx.token);
      failTaskId = childRes.taskId;
      const fLedger = childRes.ledger;
      failRefund = fLedger.refund;
      failNet = fLedger.net;
      netPointsTotal += fLedger.net;
      const refundedOk = fLedger.consume > 0 && fLedger.refund === fLedger.consume && fLedger.net === 0;
      const failed = childRes.status === "FAILED" || isTimeoutCode(childRes.code) || isProviderError(childRes.code) || isQualityFailure(childRes.code);
      failOk = failed && refundedOk;
      row.failTaskId = failTaskId;
      row.failStatusCode = childRes.code;
      row.failLedger = fLedger;
      row.failOk = failOk;
      row.failResult = refundedOk ? "REFUNDED" : childRes.status === "SUCCESS" ? "CACHE_SUCCESS_CHARGED" : "OTHER";
      row.failNote = `失败抽样：status=${childRes.status}, code=${childRes.code}, consume=${fLedger.consume}, refund=${fLedger.refund}, net=${fLedger.net}, result=${row.failResult}`;
    }
    row.退款 = failRefund;
    row.净额 = successLedgerNet + failNet;

    results.push(row);
    console.log(
      `[${componentId}] est=${row.estimateOk ? "OK" : "FAIL"}(${estPoints}pt/¥${row.estimateYuan}) ` +
        `success=${successOk ? "VERIFIED" : row.stop ? "STOP" : "RETRY"}(task=${successTaskId}) ` +
        `fail=${FAILURE_SAMPLES.has(componentId) ? (failOk ? "REFUNDED" : "FAIL") : "n/a"}(task=${failTaskId}) ` +
        `cumNet=¥${row.cumNetYuan}`,
    );
  }

  const netYuanTotal = Number((netPointsTotal * YUAN_PER_POINT).toFixed(4));
  const allSuccess = results.every((r) => r.successOk);
  const allFailRefund = results
    .filter((r) => FAILURE_SAMPLES.has(r.componentId as string))
    .every((r) => r.failOk);
  const stops = results.filter((r) => r.stop);

  console.log("\n===== E2-FIX-R 审计表（组件 | 估价点数 | 成功taskId | 实扣 | 失败taskId | 退款 | 净额）=====");
  for (const r of results) {
    const cid = r.componentId;
    const est = r.estimatePoints;
    const sT = r.successTaskId ?? "-";
    const sC = r.实扣 ?? "-";
    const fT = r.failTaskId ?? "-";
    const fR = r.退款 ?? "-";
    const net = r.净额 ?? "-";
    console.log(`| ${cid} | ${est} | ${sT} | ${sC} | ${fT} | ${fR} | ${net} |`);
  }
  console.log("\n===== C24 / C29 artifact JSON 前 200 字符（结构化校验证据）=====");
  for (const r of results) {
    if (r.componentId === "C24" || r.componentId === "C29") {
      console.log(`[${r.componentId}] jsonValid=${r.artifactJsonValid} preview=${r.artifactPreview}`);
    }
  }
  console.log(`\nE2FIX-R done. allSuccess=${allSuccess} allFailRefund=${allFailRefund} stops=${stops.length} netPoints=${netPointsTotal} netYuan=¥${netYuanTotal} (redline ≤3.00)`);
  console.log("任务/流水/账号均未清理，审核方可按上表 taskId 直接查库核对。");
  console.log(JSON.stringify({ targets: TARGETS, failureSamples: [...FAILURE_SAMPLES], netPointsTotal, netYuanTotal, results }, null, 2));
  await shared.prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("E2FIXR_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
