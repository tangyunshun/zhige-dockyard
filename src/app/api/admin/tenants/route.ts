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

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              user: true,
              componenttask: true,
            },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tenants,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get tenants error:", error);
    return NextResponse.json(
      { error: "获取租户列表失败", details: error instanceof Error ? error.message : error },
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

    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (!["active", "inactive"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    await prisma.tenant.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: "租户状态已更新",
    });
  } catch (error) {
    console.error("Update tenant error:", error);
    return NextResponse.json(
      { error: "更新租户失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
