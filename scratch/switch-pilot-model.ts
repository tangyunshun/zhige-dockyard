/** 【授权写库】试点模型切换（3 行配置修正）：
 *  1. gpt-5.5 部署重新启用（key 有效，价格已登记 VERIFIED+markup）；
 *  2. 平台默认切回 gpt-5.5；
 *  3. deepseek-flash 禁用（官方 key 缺失，401；待配置 DEEPSEEK_API_KEY 后恢复）。
 *  定价口径说明：试点按 gpt-5.5 基准执行；deepseek 价格登记保留不删。 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
const GPT = "4689a0a7-f269-4fe6-ac8b-1373e6942b38";
const DS = "78fb45bc-08e4-4658-a7cf-a22441595dc6";
async function main() {
  await prisma.modeldeployment.update({ where: { id: GPT }, data: { enabled: true } });
  await prisma.modeldeployment.update({ where: { id: DS }, data: { enabled: false } });
  await prisma.systemconfig.update({ where: { key: "PLATFORM_DEFAULT_DEPLOYMENT_ID" }, data: { value: GPT } });
  const g = await prisma.modeldeployment.findUnique({ where: { id: GPT }, select: { modelId: true, enabled: true } });
  const d = await prisma.modeldeployment.findUnique({ where: { id: DS }, select: { modelId: true, enabled: true } });
  const def = await prisma.systemconfig.findUnique({ where: { key: "PLATFORM_DEFAULT_DEPLOYMENT_ID" } });
  console.log(JSON.stringify({ gpt55: g, deepseek: d, platformDefault: def?.value }));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
