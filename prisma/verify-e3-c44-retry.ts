/**
 * E3 重试：仅 C44 成功单（首跑因模型上游 502 瞬时抖动失败，非合同质量问题，按 C27 先例重试）。
 * 新建隔离账号，记录 taskId + 状态 + 流水 + artifact。不清理。
 */
import * as shared from "./verify-e3-shared";

async function main() {
  const { userId, workspaceId, token } = await shared.createFixture();
  await shared.refreshActivity(userId);
  const est = await shared.estimate("C44", workspaceId, token);
  const data = (est.json.data as Record<string, unknown> | undefined) ?? {};
  const estPoints = Number(est.json.points ?? data.points ?? 0);
  const succ = await shared.execute("C44", workspaceId, token, false);
  const taskId = shared.extractTaskId(succ.json);
  const task = await shared.readTask(taskId);
  const ledger = await shared.readLedger(userId, taskId);
  const art = task ? shared.extractArtifactPreview(task as { result?: unknown }) : { preview: "", jsonValid: false };
  console.log(
    JSON.stringify(
      {
        componentId: "C44",
        estimateHttp: est.status,
        estimatePoints: estPoints,
        successTaskId: taskId,
        successTaskStatus: task?.status ?? shared.extractStatus(succ.json),
        successLedger: ledger,
        httpStatus: succ.status,
        artifactJsonValid: art.jsonValid,
        artifactPreview: art.preview,
        userId,
      },
      null,
      2,
    ),
  );
  await shared.prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("C44_RETRY_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
