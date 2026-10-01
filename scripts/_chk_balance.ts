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
  const u = await prisma.user.findFirst({ where: { email: { contains: "Test01@163.com" } }, select: { id: true } });
  if (!u) { console.log("NO TEST USER"); await prisma.$disconnect(); return; }
  const members = await prisma.workspacemember.findMany({ where: { userId: u.id }, select: { workspaceId: true, tokenBalance: true } });
  for (const m of members) {
    const q = await prisma.workspacequota.findFirst({ where: { workspaceId: m.workspaceId }, select: { tokenBalance: true, membershipLevelId: true } });
    console.log(JSON.stringify({ workspaceId: m.workspaceId, memberTokenBalance: m.tokenBalance.toString(), quotaTokenBalance: q?.tokenBalance?.toString() ?? null, quotaLevel: q?.membershipLevelId ?? null }, null, 2));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e)); prisma.$disconnect(); process.exit(2); });
