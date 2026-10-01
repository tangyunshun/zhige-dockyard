/** 【只读】策略数据（真实字段） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const policies = await prisma.workspace_model_policy.findMany({ select: { workspaceId: true, defaultDeploymentId: true } });
  console.log("policy 总数:", policies.length);
  for (const p of policies.slice(0, 8)) console.log(JSON.stringify({ ws: p.workspaceId.slice(0, 24), def: p.defaultDeploymentId }));
  const deps = await prisma.modeldeployment.findMany({ select: { id: true, modelId: true, enabled: true } });
  for (const d of deps) console.log("deployment:", d.id, d.modelId, "enabled=", d.enabled);
  const cfg = await prisma.systemconfig.findMany({ where: { key: { contains: "model" } }, select: { key: true, value: true } });
  for (const r of cfg) console.log("config:", r.key, "=", r.value?.slice(0, 60));
}
main().catch((e) => { console.error(e.message); }).finally(() => prisma.$disconnect());
