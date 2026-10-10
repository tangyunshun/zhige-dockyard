/**
 * E4 重试：仅对首跑成功单失败的组件补做成功单（上游 502 瞬时抖动 + C48/C53 已修 schema）。
 * 范围：C47/C48/C52/C53/C54/C55/C57/C58/C59/C60（首跑成功单失败者）。
 * 每组件最多 3 次尝试（MODEL_UPSTREAM_ERROR/502 或 OUTPUT 校验失败则重试），新建隔离账号，保留记录。
 */
import * as shared from "./verify-e4-shared";

const RETRY_IDS = ["C57", "C58", "C59", "C60"];
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runOne(componentId: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(20000); // 间隔降低上游限流压力
    const { userId, workspaceId, token } = await shared.createFixture();
    await shared.refreshActivity(userId);
    const succ = await shared.execute(componentId, workspaceId, token, false);
    const taskId = shared.extractTaskId(succ.json);
    const status = shared.extractStatus(succ.json);
    const code = shared.extractCode(succ.json);
    const task = await shared.readTask(taskId);
    const ledger = await shared.readLedger(userId, taskId);
    const art = task ? shared.extractArtifactPreview(task as { result?: unknown }) : { preview: "", jsonValid: false };
    if (status === "SUCCESS" && ledger.consume > 0 && ledger.net === ledger.consume) {
      return { componentId, attempt, ok: true, taskId, status, ledger, jsonValid: art.jsonValid, preview: art.preview, userId };
    }
    // 失败：记录错误码，进入下一次尝试
    if (attempt === MAX_ATTEMPTS) {
      return { componentId, attempt, ok: false, taskId, status, code, ledger, jsonValid: art.jsonValid, preview: art.preview, userId };
    }
  }
  return { componentId, ok: false, note: "exhausted" };
}

async function main() {
  const out: Array<Record<string, unknown>> = [];
  for (const id of RETRY_IDS) {
    const r = await runOne(id);
    out.push(r);
    console.log(
      `[${id}] retry=${r.ok ? "OK" : "FAIL"}(attempt=${r.attempt}) code=${r.code ?? "-"} task=${r.taskId} consume=${(r.ledger as { consume: number })?.consume ?? 0} jsonValid=${r.jsonValid}`,
    );
    await sleep(15000);
  }
  const failed = out.filter((r) => !r.ok).map((r) => r.componentId);
  console.log(`E4_RETRY done. okCount=${out.filter((r) => r.ok).length} failed=${JSON.stringify(failed)}`);
  console.log("\n" + JSON.stringify(out, null, 2));
  await shared.prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("E4_RETRY_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
