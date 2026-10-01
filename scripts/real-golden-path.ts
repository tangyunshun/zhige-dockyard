/**
 * CORE-3 真实黄金链路【成功】验收（§六.1~.3）
 *
 * 全真实 HTTP：真实登录 → 真实工作空间 → 真实模型执行 → SUCCESS → CONSUME → 成果物
 *            → /api/tasks → task_detail → 只读 DB 三方核对。
 * 禁用：import POST、构造 NextRequest、自签 JWT、改写 session、硬编码用户/空间。
 *
 * 运行：
 *   TEST_ACCOUNT=... TEST_PWD=... WORKSPACE_ID=... npx tsx scripts/real-golden-path.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  BASE, COMPS, requireEnv, realLogin, simulate, taskDetail, tasksList, dbFacts, newRunId, writeManifest,
} from "./real-http-lib";

const MATERIAL: Record<string, string> = {
  C01: "招标文件节选：本项目要求投标方具备信息系统集成资质，需提交技术方案、偏离表与风险说明，工期 90 天，预算 120 万元。",
  C02: "方案安全合规体检材料：本方案采用云端部署，涉及个人信息收集与跨境传输，已配置访问控制但未做数据分级。",
  C07: "会议纪要：讨论订单中心重构，需支持拆单、退款与对账，目标降低人工客服工单 30%，涉及订单、支付、结算三个模块。",
};

async function main() {
  requireEnv();
  const runId = newRunId("golden-success");
  const token = await realLogin();
  console.log(`[${runId}] 真实登录成功（token 不回显）`);

  const results: any[] = [];
  for (const comp of COMPS) {
    console.log(`\n=== ${comp} 成功链路 ===`);
    const sim = await simulate(token, comp, MATERIAL[comp] || "验收输入材料", `${comp.toLowerCase()}-input.txt`);
    const taskId = sim.json?.taskId || sim.json?.data?.taskId || null;
    console.log(`simulate HTTP=${sim.status} code=${sim.json?.code || "OK"} taskId=${taskId}`);
    if (!taskId) {
      results.push({ componentId: comp, taskId: null, api: { simulateStatus: sim.status, simulateBody: sim.json }, pass: false, reason: "未返回 taskId" });
      continue;
    }

    const det = await taskDetail(token, taskId);
    const d = det.json?.data || det.json?.task || {};
    const db = await dbFacts(taskId);
    const list = await tasksList(token);
    const listHas = JSON.stringify(list.json || "").includes(taskId);

    // 目录预估 Token（只读）
    const cat = await prisma.componentcatalog.findUnique({
      where: { id: comp },
      select: { estimatedModelTokens: true },
    });

    const usage = d.execution?.usage || d.usage || {};
    const entry = {
      testRunId: runId,
      componentId: comp,
      taskId,
      contractVersion: db.contractVersion ?? d.contractVersion ?? null,
      executionMode: db.executionMode ?? d.executionMode ?? null,
      status: db.status ?? d.status ?? null,
      errorCode: db.errorCode ?? null,
      consume: db.consume,
      refund: db.refund,
      recovery: db.recovery,
      estimatedModelTokens: cat?.estimatedModelTokens ?? null,
      usageTotalTokens: usage.totalTokens ?? db.totalTokens ?? null,
      estimatedPoints: db.estimatedPoints ?? d.execution?.estimatedPoints ?? null,
      actualPoints: db.actualPoints ?? null,
      billingMode: db.billingMode ?? null,
      api: {
        simulateStatus: sim.status,
        taskDetailStatus: det.status,
        artifactCount: db.artifactCount,
        hasArtifact: db.hasArtifact,
        tasksListStatus: list.status,
        tasksListContainsTask: listHas,
      },
      db: { status: db.status, artifactCount: db.artifactCount, hasArtifact: db.hasArtifact },
      pass:
        sim.status === 200 &&
        db.status === "SUCCESS" &&
        db.artifactCount >= 1 &&
        db.consume.length > 0 &&
        listHas &&
        det.status === 200,
    };
    console.log(`DB status=${entry.status} artifacts=${entry.db.artifactCount} consume=${JSON.stringify(entry.consume)} tokens=${entry.usageTotalTokens} estPoints=${entry.estimatedPoints} pass=${entry.pass}`);
    results.push(entry);
  }

  const manifest = {
    runId,
    kind: "SUCCESS",
    base: BASE,
    generatedAt: new Date().toISOString(),
    settlementEnabled: false,
    results,
    allPassed: results.every((r) => r.pass),
  };
  const p = await writeManifest(`golden-success-${runId}.json`, manifest);
  console.log(`\nmanifest: ${p}`);
  console.log(`ALL_PASSED=${manifest.allPassed}`);
  if (!manifest.allPassed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("GOLDEN_PATH_ERR", e?.message || e); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
