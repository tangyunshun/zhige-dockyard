import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const {
      appealId,
      status,
      adminId,
      adminName,
      adminComment,
    } = await request.json();

    // 验证必填字段
    if (!appealId || !status || !adminId) {
      return NextResponse.json(
        { message: "缺少必填字段" },
        { status: 400 },
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { message: "无效的审核状态" },
        { status: 400 },
      );
    }

    // 查找申诉记录
    const appeal = await prisma.accountappeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal) {
      return NextResponse.json(
        { message: "申诉记录不存在" },
        { status: 404 },
      );
    }

    if (appeal.status !== "pending") {
      return NextResponse.json(
        { message: "该申诉已被处理" },
        { status: 400 },
      );
    }

    // 更新申诉记录
    await prisma.accountappeal.update({
      where: { id: appealId },
      data: {
        status,
        adminId,
        adminName,
        adminComment: adminComment || null,
        processedAt: new Date(),
      },
    });

    // 如果申诉通过，恢复用户账号
    if (status === "approved") {
      await prisma.user.update({
        where: { id: appeal.userId },
        data: {
          status: "active",
          loginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: status === "approved" ? "申诉已通过，账号已恢复" : "申诉已被拒绝",
    });
  } catch (error) {
    console.error("Process appeal error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 },
    );
  }
}
