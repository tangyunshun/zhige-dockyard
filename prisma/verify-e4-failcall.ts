/**
 * E4 失败抽样子进程：在「动态 import 共享模块之前」注入 MODEL_TIMEOUT_MS=1，
 * 强制模型调用超时，验证失败路径触发 FAILED + 全额退款（净额 0）。
 *
 * 用法（由主验证器派生）：npx tsx prisma/verify-e4-failcall.ts <componentId> <workspaceId> <token>
 * 仅做一单失败执行，stdout 输出 JSON { componentId, httpStatus, taskId, taskStatus, code }。
 */
process.env.MODEL_TIMEOUT_MS = "1";

async function main() {
  const [, , componentId, workspaceId, tk] = process.argv;
  if (!componentId || !workspaceId || !tk) {
    console.error("FAILCALL_USAGE: componentId workspaceId token required");
    process.exit(2);
  }
  const shared = await import("./verify-e4-shared");
  const { status, json } = await shared.execute(componentId, workspaceId, tk, true);
  const taskId = shared.extractTaskId(json);
  const taskStatus = shared.extractStatus(json);
  const code = shared.extractCode(json);
  console.log(JSON.stringify({ componentId, httpStatus: status, taskId, taskStatus, code }));
  await shared.prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILCALL_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
