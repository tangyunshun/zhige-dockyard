import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const wsPersonal = "ws-personal-1787924572254-wu6kio";
    const wsEnterprise = "ws-enterprise-1787927954618-9arzol";

    const quotas = await prisma.workspacequota.findMany({
      where: {
        workspaceId: { in: [wsPersonal, wsEnterprise] }
      },
      include: {
        membershiplevel: true
      }
    });

    const members = await prisma.workspacemember.findMany({
      where: {
        workspaceId: wsEnterprise
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    const safeJson = JSON.parse(
      JSON.stringify(
        {
          success: true,
          quotas,
          enterpriseMembers: members,
        },
        (key, value) => (typeof value === "bigint" ? value.toString() : value)
      )
    );

    return NextResponse.json(safeJson);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 200 });
  }
}
