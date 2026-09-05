import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: "test-01" } },
          { email: { contains: "test-01" } },
          { name: { contains: "test01" } },
          { email: { contains: "test01" } },
        ],
      },
      select: { id: true, name: true, email: true, role: true, membershipLevel: true },
    });

    const result = [];
    for (const u of users) {
      const workspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: u.id },
            { workspacemember: { some: { userId: u.id } } },
          ],
        },
        include: {
          workspacequota: true,
          workspacemember: {
            where: { userId: u.id },
          },
        },
      });

      const bills = await prisma.billingrecord.findMany({ where: { userId: u.id } });
      const tasks = await prisma.componenttask.findMany({ where: { userId: u.id } });
      let taskCost = 0;
      tasks.forEach((t) => {
        const cfg = t.config as any;
        if (cfg?.tokenCost) taskCost += Number(cfg.tokenCost);
      });

      result.push({
        user: u,
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          type: ws.type,
          ownerId: ws.ownerId,
          isOwner: ws.ownerId === u.id,
          role: ws.workspacemember[0]?.role,
          memberLimit: ws.workspacemember[0]?.monthlyTokenLimit
            ? Number(ws.workspacemember[0].monthlyTokenLimit)
            : null,
          memberUsed: Number(ws.workspacemember[0]?.monthlyTokenUsed || 0),
          quota: ws.workspacequota
            ? {
                tokenBalance: Number(ws.workspacequota.tokenBalance),
                storageUsed: Number(ws.workspacequota.storageUsed),
                storageLimit: Number(ws.workspacequota.storageLimit),
              }
            : null,
        })),
        bills,
        taskCost,
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
