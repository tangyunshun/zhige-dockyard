const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ select: { id: true, email: true, name: true, role: true } });
  console.log("=== USERS ===");
  users.forEach(u => console.log(u.id, "|", u.email, "|", u.name, "|", u.role));
  const ws = await p.workspace.findMany({ select: { id: true, name: true, type: true, ownerId: true } });
  console.log("=== WORKSPACES ===");
  ws.forEach(w => console.log(w.id, "|", w.name, "|", w.type, "| owner:", w.ownerId));
  const members = await p.workspacemember.findMany({ select: { userId: true, workspaceId: true, role: true } });
  console.log("=== MEMBERS ===");
  members.forEach(m => console.log(m.workspaceId, "|", m.userId, "|", m.role));
  await p.$disconnect();
})();
