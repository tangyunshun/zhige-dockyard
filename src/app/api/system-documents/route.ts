import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    if (!category) {
      return NextResponse.json(
        { error: "缺少分类参数" },
        { status: 400 }
      );
    }

    const document = await prisma.systemdocument.findFirst({
      where: {
        category,
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!document) {
      return NextResponse.json(
        { error: "未找到文档" },
        { status: 404 }
      );
    }

    // 增加浏览量
    await prisma.systemdocument.update({
      where: { id: document.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error("Get system document error:", error);
    return NextResponse.json(
      { error: "获取文档失败" },
      { status: 500 }
    );
  }
}
