import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const allWorkspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, description: true },
    });

    const allWorkspacePosts = await prisma.workspacepost.findMany({
      include: {
        workspace: { select: { id: true, name: true } },
        _count: { select: { postmember: true } },
      },
    });

    const allPositions = await prisma.position.findMany({
      select: { id: true, name: true, code: true },
    });

    const allTenants = await prisma.tenant.findMany({
      select: { id: true, name: true },
    });

    const allWorkspaceMembers = await prisma.workspacemember.findMany({
      take: 20,
      select: {
        workspaceId: true,
        userId: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      workspaces: allWorkspaces,
      workspacePosts: allWorkspacePosts,
      positions: allPositions,
      tenants: allTenants,
      sampleMembers: allWorkspaceMembers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
