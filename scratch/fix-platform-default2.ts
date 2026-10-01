/** 【修正】删除误建的小写键 + 查/改真实键 PLATFORM_DEFAULT_DEPLOYMENT_ID */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
const WRONG_KEY = "platform_default_deployment";
const RIGHT_KEY = "PLATFORM_DEFAULT_DEPLOYMENT_ID";
const NEW_ID = "78fb45bc-08e4-4658-a7cf-a22441595dc6"; // deepseek-flash
async function main() {
  const wrong = await prisma.systemconfig.findUnique({ where: { key: WRONG_KEY } });
  if (wrong) { await prisma.systemconfig.delete({ where: { key: WRONG_KEY } }); console.log("已删除误建键:", WRONG_KEY); }
  const before = await prisma.systemconfig.findUnique({ where: { key: RIGHT_KEY } });
  console.log("真实键 before:", before?.value ?? "(absent)");
  if (before?.value === NEW_ID) { console.log("已是目标值，无需修改"); return; }
  if (before) {
    await prisma.systemconfig.update({ where: { key: RIGHT_KEY }, data: { value: NEW_ID } });
  } else {
    await prisma.systemconfig.create({ data: { key: RIGHT_KEY, value: NEW_ID } });
  }
  const after = await prisma.systemconfig.findUnique({ where: { key: RIGHT_KEY } });
  console.log("真实键 after:", after?.value);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
