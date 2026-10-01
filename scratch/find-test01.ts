/** 【只读】找 test01 专用测试账号与其空间 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: "test01" } }, { name: { contains: "test01" } }] },
    select: { id: true, email: true, name: true, status: true, lastActivityAt: true, sessionExpiresAt: true },
    take: 3,
  });
  for (const u of users) {
    const ws = await prisma.workspacemember.findFirst({ where: { userId: u.id }, select: { workspaceId: true, workspace: { select: { name: true, type: true } } } });
    console.log(JSON.stringify({ ...u, lastActivityAt: u.lastActivityAt, ws: ws ? { id: ws.workspaceId, name: ws.workspace.name, type: ws.workspace.type } : null }));
  }
}
main().catch((e) => { console.error(e.message); }).finally(() => prisma.$disconnect());
