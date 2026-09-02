import { prisma } from "../src/lib/prisma";
const WS_ID = "a4ce0e19-58e1-4e67-bdc7-43217b406269";
const T2 = "cmtee69280000prvn3ohjlxoy";
async function main() {
  const ws = await prisma.workspace.findUnique({ where: { id: WS_ID } });
  console.log("workspace exists:", !!ws, ws?.name || "");
  const mem = await prisma.workspacemember.findFirst({ where: { workspaceId: WS_ID, userId: T2 } });
  console.log("t2 membership role:", mem?.role || "NONE");
  const docs = await prisma.document.findMany({
    where: { workspaceId: WS_ID, status: { not: "REMOVED" } },
    select: { id: true, title: true, visibility: true, uploaderId: true, status: true },
  });
  console.log("active docs:", docs.length);
  docs.forEach((d) => console.log("  -", d.id, "|", d.title, "| vis=" + d.visibility, "| uploader=" + (d.uploaderId || "NULL"), "| status=" + d.status));
}
main().finally(() => prisma.$disconnect());
