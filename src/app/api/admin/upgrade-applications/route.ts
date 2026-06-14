import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const applications = await prisma.upgradeapplication.findMany({
      where,
      include: {
        workspace: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { applications, total: applications.length, page: 1, totalPages: 1 } });
  } catch (error) {
    console.error("Get upgrade applications error:", error);
    return NextResponse.json({ error: "获取升级申请失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const { id, applicationId, status } = body;
    const targetId = applicationId || id;

    if (!targetId || !status) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const app = await prisma.upgradeapplication.findUnique({
      where: { id: targetId },
    });

    if (!app) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    const application = await prisma.upgradeapplication.update({
      where: { id: targetId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    if (status === "APPROVED") {
      await prisma.workspace.update({
        where: { id: app.workspaceId },
        data: {
          type: "ENTERPRISE",
          plan: "ENTERPRISE",
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error("Process upgrade application error:", error);
    return NextResponse.json({ error: "处理升级申请失败" }, { status: 500 });
  }
}
