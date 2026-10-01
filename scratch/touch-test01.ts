/** 【审核测试行为】刷新专用测试账号 test01 的活跃时间以通过空闲校验（仅此 1 行，非阶段 A 写库） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  await prisma.user.update({ where: { id: "cmtd04l660000y2miz6av52qn" }, data: { lastActivityAt: new Date() } });
  console.log("test01 lastActivityAt refreshed");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
