/**
 * 组件进度只读审计（CLI）
 *
 * 与管理员接口同源（src/lib/component-progress-audit.ts），纯只读：
 * 不写入数据库、不发布/激活/删除合同、不返回任何密钥值。
 *
 * 用法：npx tsx prisma/audit-component-progress.ts [--window-days 7]
 */
async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--window-days");
  const windowDays = idx >= 0 ? Number(args[idx + 1]) : 7;
  if (!Number.isInteger(windowDays) || windowDays <= 0 || windowDays > 365) {
    console.error("AUDIT_FAIL INVALID_WINDOW_DAYS: --window-days 必须为 1~365 的整数");
    process.exit(2);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { buildComponentProgressAudit } = await import("../src/lib/component-progress-audit");

  const audit = await buildComponentProgressAudit({ windowDays });
  console.log(JSON.stringify({ ...audit, wroteDatabase: false }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("AUDIT_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
