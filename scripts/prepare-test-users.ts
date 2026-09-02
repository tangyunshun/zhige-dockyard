import { prisma } from "../src/lib/prisma";

// 测试前刷新 test-01 / test-02 的会话有效期，避免 validateUser 因空闲超时(IDLE_TIMEOUT)/
// 绝对过期(SESSION_EXPIRED)/强制下线(FORCED_LOGOUT)而拒绝合法 token。
// 必须在 dev server 停止时单独运行（单 Prisma 进程，避免与 dev server 竞争 SQLite）。
async function main() {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const now = new Date();
  for (const name of ["test-01", "test-02"]) {
    const u = await prisma.user.findFirst({ where: { OR: [{ name }, { email: name }] } });
    if (!u) {
      console.log("missing", name);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        lastActivityAt: now,
        sessionExpiresAt: future,
        lastForcedLogoutAt: null,
        status: "active",
      },
    });
    console.log("prepared", name, u.id);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
