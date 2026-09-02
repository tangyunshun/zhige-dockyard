import { prisma } from "../src/lib/prisma";
async function main() {
  const t1 = await prisma.user.findFirst({ where: { OR: [{ name: "test-01" }, { email: "test-01" }] } });
  const t2 = await prisma.user.findFirst({ where: { OR: [{ name: "test-02" }, { email: "test-02" }] } });
  console.log("t1", t1?.id, "t2", t2?.id);
  if (!t1 || !t2) return;
  const ws1 = await prisma.workspacemember.findMany({ where: { userId: t1.id, role: { in: ["OWNER", "ADMIN"] } }, include: { workspace: true } });
  const ws2 = await prisma.workspacemember.findMany({ where: { userId: t2.id }, include: { workspace: true } });
  const ids1 = new Set(ws1.map((m) => m.workspaceId));
  const shared = ws2.filter((m) => ids1.has(m.workspaceId));
  console.log("SHARED", JSON.stringify(shared.map((m) => ({ ws: m.workspaceId, role: m.role }))));
  for (const m of shared) {
    const docs = await prisma.document.findMany({ where: { workspaceId: m.workspaceId, uploaderId: t2.id, status: "active", visibility: "PUBLIC" } });
    console.log("DOCS", m.workspaceId, JSON.stringify(docs.map((d) => ({ id: d.id, title: d.title, status: d.status }))));
  }
}
main().finally(() => prisma.$disconnect());
