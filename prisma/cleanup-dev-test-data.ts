/**
 * 清理「7天内免登录」等开发过程中插入的测试/调试账号与空间。
 * 仅匹配明确测试特征（与只读扫描脚本一致）：test-user-* / user-arb- / test-member-* /
 * temp-member-* / admin_repo_test_ / u_wsui_e2e / u_c0*_ / @zhige.test / @test.local /
 * @example.com 等，绝不触碰真实业务数据。默认只读预演，--apply 才落库。
 *
 * 用法：npx tsx prisma/cleanup-dev-test-data.ts [--apply]
 */
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

const USER_ID_PREFIXES = [
  "test-user-", "user-arb-", "test-member-", "temp-member-", "regular-user-", "user-iso-",
  "admin_repo_test_", "u_wsui_e2e", "u_c07_", "u_c07f_", "u_inp_", "u_upe_", "u_c0105_", "u_c05m_", "u_c05u_",
];
// 仅匹配明显为假的调试域名，避免误伤真实用户（example.com 等真实可注册域名不纳入）
const USER_EMAIL_LIKE = ["zhige.test", "test.local"];
const WS_ID_PREFIXES = [
  "test-ws-", "ws_wsui_e2e", "ws_c07_", "ws_c07f_", "ws_inp_", "ws_upe_", "ws_c0105_", "ws_c05_",
];

async function collect() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...USER_ID_PREFIXES.map((p) => ({ id: { startsWith: p } })),
        ...USER_EMAIL_LIKE.map((e) => ({ email: { contains: e } })),
      ],
    },
    select: { id: true, email: true },
  });
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [...WS_ID_PREFIXES.map((p) => ({ id: { startsWith: p } }))],
    },
    select: { id: true, name: true },
  });
  return { userIds: users.map((u) => u.id), workspaceIds: workspaces.map((w) => w.id) };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { userIds, workspaceIds } = await collect();

  console.log(`命中用户 ${userIds.length} 个、空间 ${workspaceIds.length} 个`);
  if (userIds.length === 0 && workspaceIds.length === 0) {
    console.log("无匹配数据，结束。");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log("DRY_RUN：未删除任何数据。加 --apply 执行。");
    console.log("用户全量：", userIds);
    console.log("空间全量：", workspaceIds);
    await prisma.$disconnect();
    return;
  }

  // 空间子表
  await prisma.componentusage.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspacemember.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspacequota.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.document.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });

  // 用户子表
  await prisma.componenttask.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.componentusage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pointledger.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pointgrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refundrecovery.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userwallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.operationlog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`已删除 ${userIds.length} 个用户、${workspaceIds.length} 个空间及其子表数据。`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CLEANUP_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
