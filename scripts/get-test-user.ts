import { prisma } from "../src/lib/prisma";

async function main() {
  const ws = await prisma.workspace.findFirst({
    select: { id: true, name: true, ownerId: true }
  });
  const user = ws?.ownerId ? await prisma.user.findUnique({
    where: { id: ws.ownerId },
    select: { id: true, name: true, email: true, role: true }
  }) : null;
  console.log("WORKSPACE:", JSON.stringify(ws));
  console.log("USER:", JSON.stringify(user));
}

main().finally(() => prisma.$disconnect());
