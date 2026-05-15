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

    const applications = await prisma.workspaceUpgradeApplication.findMany({
      where,
      include: {
        workspace: true,
        applicant: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: applications });
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

    const { applicationId, status, reviewComment } = await request.json();

    if (!applicationId || !status) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const application = await prisma.workspaceUpgradeApplication.update({
      where: { id: applicationId },
      data: {
        status,
        reviewComment,
        reviewedAt: new Date(),
        reviewerId: userId,
      },
    });

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error("Process upgrade application error:", error);
    return NextResponse.json({ error: "处理升级申请失败" }, { status: 500 });
  }
}
