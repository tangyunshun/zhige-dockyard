import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [applications, total] = await Promise.all([
      prisma.upgradeApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: "desc" },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
              ownerId: true,
            },
          },
        },
      }),
      prisma.upgradeApplication.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        applications,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get upgrade applications error:", error);
    return NextResponse.json(
      { error: "获取升级申请失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id, status, reason } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    const application = await prisma.upgradeApplication.findUnique({
      where: { id },
      include: {
        workspace: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    // 更新申请状态
    await prisma.upgradeApplication.update({
      where: { id },
      data: { status },
    });

    // 如果审核通过，升级工作空间为企业空间
    if (status === "APPROVED") {
      await prisma.workspace.update({
        where: { id: application.workspaceId },
        data: { type: "ENTERPRISE" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "审核完成",
    });
  } catch (error) {
    console.error("Review upgrade application error:", error);
    return NextResponse.json(
      { error: "审核失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
