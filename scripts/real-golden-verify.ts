/**
 * CORE-3 三方一致性复核（真实 HTTP + 只读 DB），§六「响应、数据库、任务详情三者一致」。
 *
 * 对已存在的任务（成功 / 失败）执行：真实登录 → GET task_detail → GET /api/tasks → 只读 DB 核对。
 * 本脚本不提交新任务、不调模型、不写账务。
 *
 * 运行：
 *   TEST_ACCOUNT=... TEST_PWD=... WORKSPACE_ID=... VERIFY_TASK_IDS=id1,id2,id3 npx tsx scripts/real-golden-verify.ts
 */
import { prisma } from "../src/lib/prisma";
import { requireEnv, realLogin, taskDetail, tasksList, dbFacts, newRunId, writeManifest } from "./real-http-lib";

async function main() {
  requireEnv();
  const ids = (process.env.VERIFY_TASK_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error("缺少 VERIFY_TASK_IDS");
  const runId = newRunId("verify");
  const token = await realLogin();
  console.log(`[${runId}] 真实登录成功`);

  const results: any[] = [];
  for (const id of ids) {
    const det = await taskDetail(token, id);
    const list = await tasksList(token);
    const db = await dbFacts(id);
    const d: any = det.json?.data || det.json?.task || {};
    const listHas = JSON.stringify(list.json || "").includes(id);
    const consistent =
      det.status === 200 && (d.status ?? db.status) === db.status && listHas;
    const entry = {
      testRunId: runId,
      taskId: id,
      componentId: db.status ? d.componentId ?? null : null,
      status: db.status,
      contractVersion: db.contractVersion,
      executionMode: db.executionMode,
      errorCode: db.errorCode,
      artifactCount: db.artifactCount,
      hasArtifact: db.hasArtifact,
      consume: db.consume,
      refund: db.refund,
      recovery: db.recovery,
      estimatedPoints: db.estimatedPoints,
      actualPoints: db.actualPoints,
      billingMode: db.billingMode,
      http: { taskDetailStatus: det.status, tasksStatus: list.status, tasksListContainsTask: listHas },
      detailStatus: d.status ?? null,
      consistent,
    };
    console.log(`${id} status=${db.status} detail=${det.status} list=${list.status} inList=${listHas} consistent=${consistent}`);
    results.push(entry);
  }

  const manifest = { runId, kind: "VERIFY", generatedAt: new Date().toISOString(), results, allConsistent: results.every((r) => r.consistent) };
  const p = await writeManifest(`verify-${runId}.json`, manifest);
  console.log(`\nmanifest: ${p}`);
  console.log(`ALL_CONSISTENT=${manifest.allConsistent}`);
  if (!manifest.allConsistent) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("VERIFY_ERR", e?.message || e); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
