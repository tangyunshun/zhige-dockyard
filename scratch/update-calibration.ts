/** 【授权写库】用批次2试点实测 usage 更新校准表（机制本意：真实数据驱动）：
 *  C01 in=4788（三单实测恒定 4788）out=均值2499；C07 in=4693 out=2697（样本1）；C02 无新样本不动。 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const row = await prisma.systemconfig.findUnique({ where: { key: "billing_usage_calibration" } });
  const cur = JSON.parse(row!.value!);
  console.log("before:", JSON.stringify(cur));
  cur.C01 = { in: 4788, out: Math.round((2082 + 2553 + 2864) / 3) };
  cur.C07 = { in: 4693, out: 2697 };
  await prisma.systemconfig.update({ where: { key: "billing_usage_calibration" }, data: { value: JSON.stringify(cur) } });
  console.log("after:", JSON.stringify(cur));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
