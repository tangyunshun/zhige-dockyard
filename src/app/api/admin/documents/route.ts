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

    const skip = (page - 1) * limit;

    // 这里使用 componenttask 来模拟文档，实际应该用 Document 表
    // 因为当前 schema 中没有 Document 表，我们先用 componenttask 的特定 type 来代表文档
    const [documents, total] = await Promise.all([
      prisma.componenttask.findMany({
        where: {
          type: "document", // 假设 type 为 document 的记录代表文档
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.componenttask.count({
        where: {
          type: "document",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json(
      { error: "获取文档列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
