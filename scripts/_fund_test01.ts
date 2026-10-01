/**
 * 仅为真实黄金链路测试给 test-01 企业空间注入测试点数（可逆、可清理）。
 * 不触碰任何真实业务账户；仅 workspacemember.tokenBalance 与 workspacequota.tokenBalance。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const TEST_WS = "ws-enterprise-1787927954618-9arzol";
const FUND = BigInt(1000000);
async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));
  const u = await prisma.user.findFirst({ where: { email: { contains: "Test01@163.com" } }, select: { id: true } });
  if (!u) { console.error("NO TEST USER"); process.exit(2); }
  const before = await prisma.workspacemember.findUnique({ where: { userId_workspaceId: { userId: u.id, workspaceId: TEST_WS } }, select: { tokenBalance: true } });
  await prisma.workspacemember.update({ where: { userId_workspaceId: { userId: u.id, workspaceId: TEST_WS } }, data: { tokenBalance: FUND } });
  const quota = await prisma.workspacequota.findFirst({ where: { workspaceId: TEST_WS }, select: { id: true } });
  if (quota) {
    await prisma.workspacequota.update({ where: { id: quota.id }, data: { tokenBalance: FUND } });
  } else {
    await prisma.workspacequota.create({ data: { id: `wq_test01_${TEST_WS}`, workspaceId: TEST_WS, membershipLevelId: "FREE", tokenBalance: FUND, updatedAt: new Date() } });
  }
  // OWNER 扣点走 pointgrant 分桶汇总；为企业空间共享池补一条充足分桶（可逆测试写）
  const pgId = `pg_test01_${TEST_WS}`;
  await prisma.pointgrant.upsert({
    where: { id: pgId },
    update: { remaining: FUND, points: FUND, status: "ACTIVE", expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) },
    create: {
      id: pgId,
      scope: "WORKSPACE",
      workspaceId: TEST_WS,
      userId: u.id,
      points: FUND,
      remaining: FUND,
      sourceType: "MANUAL",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      status: "ACTIVE",
      operatorId: "cmugq95w200018v57lop5qtm9",
      title: "测试充值-企业共享池",
    },
  });
  const after = await prisma.workspacemember.findUnique({ where: { userId_workspaceId: { userId: u.id, workspaceId: TEST_WS } }, select: { tokenBalance: true } });
  const q = await prisma.workspacequota.findFirst({ where: { workspaceId: TEST_WS }, select: { tokenBalance: true } });
  console.log(JSON.stringify({ testUserId: u.id, workspaceId: TEST_WS, beforeMember: before?.tokenBalance?.toString() ?? null, afterMember: after?.tokenBalance?.toString(), afterQuota: q?.tokenBalance?.toString() }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e)); prisma.$disconnect(); process.exit(2); });
