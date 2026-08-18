import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const where: any = {
      isPublished: true,
    };

    if (category) {
      where.category = category;
    }

    const documents = await prisma.systemdocument.findMany({
      where,
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" }
      ]
    });

    return NextResponse.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error("Get public documents list error:", error);
    return NextResponse.json({ error: "获取公开文档列表失败" }, { status: 500 });
  }
}
