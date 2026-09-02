import { prisma } from "../src/lib/prisma";
const T1 = "cmtd04l660000y2miz6av52qn";
const T2 = "cmtee69280000prvn3ohjlxoy";
async function main() {
  const wss = await prisma.workspace.findMany({ select: { id: true, name: true } });
  console.log("total workspaces:", wss.length);
  wss.forEach((w) => console.log("  -", w.id, "|", w.name));
  for (const uid of [T1, T2]) {
    const m = await prisma.workspacemember.findMany({ where: { userId: uid } });
    console.log(`user ${uid} memberships:`, m.length);
    m.forEach((x) => console.log("    - ws", x.workspaceId, "role", x.role));
  }
}
main().finally(() => prisma.$disconnect());
