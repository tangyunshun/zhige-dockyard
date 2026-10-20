// 一次性迁移：把「平台默认免费模型」物化到所有空间的白名单（含此前没有策略行的空间）。
// 背景：有效模型口径改为「白名单 − 禁用」（白名单唯一真源）后，需把默认免费模型写进每个空间，
// 否则老空间/无策略行空间会丢失这些模型。复用 inheritFreeDefaultModelsForNewWorkspace（幂等：新建行或合并，跳过已禁用）。
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const p = resolve(process.cwd(), ".env");
    const txt = readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
loadEnv();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { loadFreeDefaultDeploymentIds, inheritFreeDefaultModelsForNewWorkspace } = await import(
    "../src/lib/platform-default-models"
  );
  const free = await loadFreeDefaultDeploymentIds();
  console.log(`平台默认免费模型：${free.length} 款`, free);
  if (free.length === 0) {
    console.log("无平台默认免费模型，无需同步。");
    return;
  }
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true, type: true } });
  console.log(`共 ${workspaces.length} 个空间，开始物化默认免费模型到各自白名单...`);
  let ok = 0;
  let fail = 0;
  for (const ws of workspaces) {
    try {
      await inheritFreeDefaultModelsForNewWorkspace(ws.id);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  空间 ${ws.id}（${ws.name}）失败:`, (e as Error)?.message);
    }
  }
  console.log(`完成：成功 ${ok} 个，失败 ${fail} 个。`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("同步失败:", e);
    process.exit(1);
  });
