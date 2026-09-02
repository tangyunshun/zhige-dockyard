import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { appealId } = await request.json();

    if (!appealId) {
      return NextResponse.json({ error: "缺少申诉单 ID" }, { status: 400 });
    }

    const appeal = await prisma.accountappeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal) {
      return NextResponse.json({ error: "申诉记录不存在" }, { status: 404 });
    }

    if (appeal.status !== "pending") {
      return NextResponse.json(
        { error: "只能撤销处于审核中(pending)状态的申诉单" },
        { status: 400 }
      );
    }

    // 重构为更新状态为 canceled，保留历史轨迹供管理员审计追溯
    await prisma.accountappeal.update({
      where: { id: appealId },
      data: {
        status: "canceled",
        processedAt: new Date(),
        adminComment: "用户自行在前台撤销了本次申诉申请",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "申诉已成功撤销！",
    });
  } catch (error) {
    console.error("Cancel appeal error:", error);
    return NextResponse.json({ error: "撤销申诉失败" }, { status: 500 });
  }
}
