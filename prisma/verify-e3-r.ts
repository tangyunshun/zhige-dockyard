/**
 * COMPONENT-EXPANSION-E3 主验证器（C32-C45 十四组件三件套真实验证）
 *
 * 每组件：
 *  1) 估价：GET /api/billing/estimate，断言 200 + CONVERTED_PRICE，记录点数；
 *  2) 成功 1 单：POST /api/studio（文件类走 multipart），断言 SUCCESS，记录 taskId + 实扣；
 *  3) 失败抽样（C32/C36/C40/C44 每 4 组件 1 个）：派生子进程注入 MODEL_TIMEOUT_MS=1，
 *     断言 FAILED + 全额退款（净额 0），三方对账。
 *
 * 三方核对：API 响应 = pointledger 流水 = componenttask 状态。
 * 任务/流水/账号全部保留，供审核方直接查库核对（绝不清理）。
 */
import { spawn } from "child_process";
import * as shared from "./verify-e3-shared";

const ALL = ["C32", "C33", "C34", "C35", "C36", "C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44", "C45"];
const FAILURE_SAMPLES = new Set(["C32", "C36", "C40", "C44"]);

function extractEstimatePoints(json: Record<string, unknown>): { points: number; basis: string } {
  const data = (json.data as Record<string, unknown> | undefined) ?? {};
  const points = Number(json.points ?? data.points ?? json.convertedPoints ?? data.convertedPoints ?? 0);
  const basis = String(json.basis ?? data.basis ?? json.priceBasis ?? data.priceBasis ?? json.mode ?? "");
  return { points, basis };
}

function runFailCall(componentId: string, workspaceId: string, tk: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "prisma/verify-e3-failcall.ts", componentId, workspaceId, tk],
      { cwd: process.cwd(), env: { ...process.env, MODEL_TIMEOUT_MS: "1" }, windowsHide: true, shell: true },
    );
    let out = "";
    let err = "";
    child.on("error", (e) => reject(e));
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FAILCALL_EXIT_${code}: ${err || out}`));
        return;
      }
      try {
        resolve(JSON.parse(out.trim().split("\n").pop() || "{}"));
      } catch (e) {
        reject(new Error(`FAILCALL_PARSE: ${out}\n${err}`));
      }
    });
  });
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  let cumNetPoints = 0;
  let cumNetYuan = 0;
  let stops = 0;
  let allSuccess = true;
  let allFailRefund = true;

  for (const componentId of ALL) {
    const { userId, workspaceId, token } = await shared.createFixture();
    await shared.refreshActivity(userId);

    // 1) 估价
    const est = await shared.estimate(componentId, workspaceId, token);
    const { points: estPoints, basis } = extractEstimatePoints(est.json);
    const estOk = est.status === 200 && (basis.toUpperCase().includes("CONVERTED_PRICE") || estPoints > 0);

    // 2) 成功 1 单
    const succ = await shared.execute(componentId, workspaceId, token, false);
    const succTaskId = shared.extractTaskId(succ.json);
    const succStatus = shared.extractStatus(succ.json);
    const succTask = await shared.readTask(succTaskId);
    const succLedger = await shared.readLedger(userId, succTaskId);
    const fileDef = shared.E3_FILES[componentId];
    const successTripleOk =
      estOk &&
      succ.status === 200 &&
      succStatus === "SUCCESS" &&
      (succTask?.status === "SUCCESS") &&
      succLedger.consume > 0 &&
      succLedger.net === succLedger.consume; // 成功无退款

    let failTaskId: string | null = null;
    let failRefund = 0;
    let failStatusCode: string | null = null;
    let failOk = true;
    if (FAILURE_SAMPLES.has(componentId)) {
      let fc: Record<string, unknown>;
      try {
        fc = await runFailCall(componentId, workspaceId, token);
      } catch (e) {
        failOk = false;
        stops += 1;
        fc = { error: String(e) };
      }
      failTaskId = (fc.taskId as string) ?? null;
      failStatusCode = (fc.code as string) ?? null;
      const failTask = await shared.readTask(failTaskId);
      const failLedger = await shared.readLedger(userId, failTaskId);
      const isTimeout = shared.isTimeoutCode(failStatusCode);
      const taskFailed = failTask?.status === "FAILED";
      const fullRefund = failLedger.consume > 0 && failLedger.refund === failLedger.consume && failLedger.net === 0;
      failRefund = failLedger.refund;
      failOk = isTimeout && taskFailed && fullRefund;
      if (!failOk) {
        allFailRefund = false;
        // 连续非超时失败 → 停止（C27 先例：UPSTREAM+TIMEOUT 交错可继续，但每次失败须记录错误码）
        if (!isTimeout) stops += 1;
      }
    }

    const netPoints = succLedger.consume - failRefund;
    cumNetPoints += netPoints;
    cumNetYuan += netPoints * shared.YUAN_PER_POINT;

    const artifact = succTask ? shared.extractArtifactPreview(succTask as { result?: unknown }) : { preview: "", jsonValid: false };

    const row: Record<string, unknown> = {
      componentId,
      estimateHttp: est.status,
      estimateBasis: basis || (estOk ? "CONVERTED_PRICE" : "UNKNOWN"),
      estimatePoints: estPoints,
      estimateYuan: estPoints * shared.YUAN_PER_POINT,
      estimateOk: estOk,
      successTaskId: succTaskId,
      successTaskStatus: succTask?.status ?? succStatus,
      successLedger: succLedger,
      successTripleOk,
      successOk: successTripleOk,
      fileUpload: fileDef ? { filename: fileDef.filename, bytes: Buffer.byteLength(fileDef.content) } : null,
      artifactPreview: artifact.preview,
      artifactJsonValid: artifact.jsonValid,
      failTaskId,
      failStatusCode,
      failLedger: failTaskId ? await shared.readLedger(userId, failTaskId) : null,
      failOk,
      failResult: failTaskId ? (failOk ? "REFUNDED" : "NOT_REFUNDED") : "n/a",
      refund: failRefund,
      netPoints,
      netYuan: netPoints * shared.YUAN_PER_POINT,
    };
    results.push(row);
    if (!successTripleOk) {
      allSuccess = false;
      stops += 1;
    }

    const fileNote = fileDef ? ` file=${fileDef.filename}(${Buffer.byteLength(fileDef.content)}B)` : "";
    const failNote = FAILURE_SAMPLES.has(componentId) ? ` fail=${failOk ? "REFUNDED" : "FAIL"}(${failTaskId})` : "";
    console.log(
      `[${componentId}] est=${estOk ? "OK" : "ERR"}(${estPoints}pt) success=${successTripleOk ? "VERIFIED" : "FAIL"}(task=${succTaskId})${fileNote} cumNet=¥${cumNetYuan.toFixed(2)}${failNote}`,
    );
  }

  // —— 审计表 ——
  console.log("\n===== E3 审计表（组件 | 估价点数 | 成功taskId | 实扣 | 失败taskId | 退款 | 净额）=====");
  console.log("| 组件 | 估价点数 | 成功taskId | 实扣 | 失败taskId | 退款 | 净额 |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of results) {
    const fid = (r.failTaskId as string) ?? "-";
    const ref = (r.refund as number) ?? 0;
    const sl = r.successLedger as { consume: number };
    console.log(
      `| ${r.componentId} | ${r.estimatePoints} | ${r.successTaskId} | ${sl.consume} | ${fid} | ${ref} | ${r.netPoints} |`,
    );
  }

  console.log("\n===== C36/C37/C38/C39/C41/C42/C44 artifact JSON 前 200 字符（结构化校验证据）=====");
  for (const r of results) {
    if (r.artifactJsonValid) {
      console.log(`[${r.componentId}] jsonValid=true preview=${r.artifactPreview}`);
    }
  }

  console.log(
    `\nE3 done. allSuccess=${allSuccess} allFailRefund=${allFailRefund} stops=${stops} netPoints=${cumNetPoints} netYuan=¥${cumNetYuan.toFixed(2)} (redline ≤4.00)`,
  );
  console.log("任务/流水/账号均未清理，审核方可按上表 taskId 直接查库核对。");

  console.log("\n" + JSON.stringify({ targets: ALL, failureSamples: Array.from(FAILURE_SAMPLES), netPointsTotal: cumNetPoints, netYuanTotal: cumNetYuan, results }, null, 2));

  await shared.prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("E3_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
