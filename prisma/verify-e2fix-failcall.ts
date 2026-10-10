/**
 * E2-FIX-R 失败抽样子进程（独立进程 = 重启语义注入 MODEL_TIMEOUT_MS=1）。
 *
 * 必须在「动态 import 共享模块之前」设置 MODEL_TIMEOUT_MS=1，
 * 因为 model-adapter 在模块加载期冻结超时常量。
 * 本进程只跑 1 单超时抽样（不清理），把结果以单行 JSON 打到 stdout 供主验证器解析。
 *
 * 用法（由主验证器派发）：
 *   npx tsx prisma/verify-e2fix-failcall.ts <componentId> <userId> <workspaceId> <jwt>
 */
process.env.MODEL_TIMEOUT_MS = "1"; // 必须在动态 import 之前

async function run() {
  const shared = await import("./verify-e2fix-shared");
  const [componentId, userId, workspaceId, jwt] = process.argv.slice(2);
  if (!componentId || !userId || !workspaceId || !jwt) {
    process.stdout.write(JSON.stringify({ error: "missing args" }));
    process.exit(2);
    return;
  }
  await shared.refreshActivity(userId);
  const ex = await shared.execute(componentId, workspaceId, jwt, true);
  const taskId = shared.extractTaskId(ex.json);
  const status = shared.extractStatus(ex.json);
  const code = shared.extractCode(ex.json);
  const ledger = await shared.readLedger(userId, taskId);
  process.stdout.write(
    JSON.stringify({ componentId, taskId, status, code, ledger, raw: ex.json }),
  );
  process.exit(0);
}

run().catch((e) => {
  process.stdout.write(JSON.stringify({ error: (e as Error)?.message || String(e) }));
  process.exit(2);
});
