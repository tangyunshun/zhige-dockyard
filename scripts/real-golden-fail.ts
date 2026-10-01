/**
 * CORE-3 真实黄金链路【失败】验收（§六.4）
 *
 * 全真实 HTTP。失败由服务端环境变量 MODEL_TIMEOUT_MS 强制真实模型超时产生（可控的真实模型失败），
 * 禁止使用 mock 失败、禁止伪造错误码、禁止 import POST / 自签 JWT / 硬编码用户空间。
 *
 * 运行（需先以极小超时启动服务以触发真实模型超时）：
 *   MODEL_TIMEOUT_MS=1 npm run start
 *   TEST_ACCOUNT=... TEST_PWD=... WORKSPACE_ID=... npx tsx scripts/real-golden-fail.ts
 *
 * 验收点：FAILED、成果物为空、CONSUME 与 REFUND/recovery 对应、taskId 可追踪、task_detail 非成功态。
 */
import { prisma } from "../src/lib/prisma";
import {
  BASE, COMPS, requireEnv, realLogin, simulate, taskDetail, dbFacts, newRunId, writeManifest,
} from "./real-http-lib";

const MATERIAL: Record<string, string> = {
  C01: "招标文件节选：本项目要求投标方具备信息系统集成资质，需提交技术方案、偏离表与风险说明。",
  C02: "方案安全合规体检材料：本方案采用云端部署，涉及个人信息收集与跨境传输。",
  C07: "会议纪要：讨论订单中心重构，需支持拆单、退款与对账。",
};

async function main() {
  requireEnv();
  const runId = newRunId("golden-fail");
  const token = await realLogin();
  console.log(`[${runId}] 真实登录成功（token 不回显）`);

  const results: any[] = [];
  for (const comp of COMPS) {
    console.log(`\n=== ${comp} 失败链路 ===`);
    const sim = await simulate(token, comp, MATERIAL[comp] || "验收输入材料", `${comp.toLowerCase()}-fail.txt`);
    const taskId = sim.json?.taskId || sim.json?.data?.taskId || null;
    console.log(`simulate HTTP=${sim.status} code=${sim.json?.code || "OK"} taskId=${taskId}`);
    if (!taskId) {
      results.push({ componentId: comp, taskId: null, api: { simulateStatus: sim.status, simulateBody: sim.json }, pass: false, reason: "失败链路也必须返回 taskId（§二.3）" });
      continue;
    }

    const det = await taskDetail(token, taskId);
    const db = await dbFacts(taskId);
    const accountingOk =
      (db.consume.length > 0 && (db.refund.length > 0 || db.recovery.length > 0)) ||
      (db.consume.length === 0 && db.recovery.length === 0); // 未扣点则无退款事实

    const entry = {
      testRunId: runId,
      componentId: comp,
      taskId,
      contractVersion: db.contractVersion ?? null,
      executionMode: db.executionMode ?? null,
      status: db.status ?? null,
      errorCode: db.errorCode ?? null,
      consume: db.consume,
      refund: db.refund,
      recovery: db.recovery,
      estimatedPoints: db.estimatedPoints ?? null,
      actualPoints: db.actualPoints ?? null,
      billingMode: db.billingMode ?? null,
      api: {
        simulateStatus: sim.status,
        simulateCode: sim.json?.code ?? null,
        taskDetailStatus: det.status,
        refundStatus: sim.json?.refundStatus ?? null,
      },
      db: { status: db.status, artifactCount: db.artifactCount, hasArtifact: db.hasArtifact },
      // 失败验收：FAILED + 成果物为空 + 账务可关联 + taskId 可追踪 + 详情非成功
      pass:
        db.status === "FAILED" &&
        db.artifactCount === 0 &&
        db.hasArtifact === false &&
        !!db.errorCode &&
        accountingOk &&
        det.status === 200,
    };
    console.log(`DB status=${entry.status} errorCode=${entry.errorCode} artifacts=${entry.db.artifactCount} consume=${JSON.stringify(entry.consume)} refund=${JSON.stringify(entry.refund)} recovery=${JSON.stringify(entry.recovery)} pass=${entry.pass}`);
    results.push(entry);
  }

  const manifest = {
    runId,
    kind: "FAILED",
    base: BASE,
    generatedAt: new Date().toISOString(),
    inducedBy: `MODEL_TIMEOUT_MS=${process.env.MODEL_TIMEOUT_MS || "(由服务端进程设置)"}`,
    results,
    allPassed: results.every((r) => r.pass),
  };
  const p = await writeManifest(`golden-fail-${runId}.json`, manifest);
  console.log(`\nmanifest: ${p}`);
  console.log(`ALL_PASSED=${manifest.allPassed}`);
  if (!manifest.allPassed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("GOLDEN_FAIL_ERR", e?.message || e); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
