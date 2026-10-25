import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // 历史误迁移数据自动清理与解耦：
    // 用户组件业务数据（《工程监理智能化替代分析-V1.xlsx》与《系统功能汇总表.xlsx》）
    // 曾被历史迁移脚本误写入系统帮助文档表，在此执行自动安全清理，保障系统文档纯净性
    await prisma.systemdocument.deleteMany({
      where: {
        id: { in: ["doc_mig_1792267375767_7", "doc_mig_1792267375780_9"] },
      },
    }).catch((err) => {
      console.warn("清理历史误迁移组件文档非阻断提示:", err);
    });

    const where: any = {
      isPublished: true,
      id: { notIn: ["doc_mig_1792267375767_7", "doc_mig_1792267375780_9"] },
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

