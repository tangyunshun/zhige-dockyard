import { prisma } from "../src/lib/prisma";

async function main() {
  const ws = await prisma.workspace.findFirst({
    where: {
      OR: [
        { id: "it_st_ws_f7e43466-21de-428b-b2ca-04bdb2d8895f" },
        { name: "it-studio" }
      ]
    }
  });

  const owner = ws?.ownerId ? await prisma.user.findUnique({ where: { id: ws.ownerId }, select: { id: true, email: true, name: true } }) : null;
  console.log("Workspace found:", ws?.id, ws?.name, "Owner:", owner);

  // 找一个完成的 task，和一个未完成的 task
  const taskSuccess = await prisma.componenttask.findFirst({
    where: {
      status: "SUCCESS"
    },
    select: { id: true, type: true, status: true }
  });

  const taskOther = await prisma.componenttask.findFirst({
    where: {
      status: { not: "SUCCESS" }
    },
    select: { id: true, type: true, status: true }
  });

  console.log("Task SUCCESS:", taskSuccess?.id, taskSuccess?.type);
  console.log("Task OTHER:", taskOther?.id, taskOther?.type);
}

main().catch(console.error).finally(() => prisma.$disconnect());
