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
async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));
  const superId = "cmugq95w200018v57lop5qtm9";
  const sup = await prisma.user.findUnique({ where: { id: superId }, select: { id: true, role: true, status: true, email: true, name: true } });
  const testUsers = await prisma.user.findMany({
    where: { OR: [{ email: { contains: "test-01" } }, { name: "test-01" }] },
    select: { id: true, role: true, status: true, email: true, name: true },
  });
  const testDetails: unknown[] = [];
  for (const u of testUsers) {
    const members = await prisma.workspacemember.findMany({
      where: { userId: u.id },
      select: { workspaceId: true, role: true, tokenBalance: true },
    });
    const ws = members.length
      ? await prisma.workspace.findMany({ where: { id: { in: members.map((m) => m.workspaceId) } }, select: { id: true, name: true, status: true, type: true } })
      : [];
    testDetails.push({ user: u, members, workspaces: ws });
  }
  console.log(JSON.stringify({ superAdmin: sup, testUsersFound: testUsers.length, testDetails }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e)); prisma.$disconnect(); process.exit(2); });
