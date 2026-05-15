import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      userAccount,
      appealReason,
      appealEvidence,
      contactInfo,
    } = await request.json();

    // 验证必填字段
    if (!userAccount || !appealReason) {
      return NextResponse.json(
        { message: "缺少必填字段" },
        { status: 400 },
      );
    }

    if (appealReason.length < 10) {
      return NextResponse.json(
        { message: "申诉理由至少需要 10 个字符" },
        { status: 400 },
      );
    }

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: userAccount }, { phone: userAccount }, { name: userAccount }],
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 },
      );
    }

    // 检查是否有待处理的申诉
    const existingAppeal = await prisma.accountappeal.findFirst({
      where: {
        userId: user.id,
        status: "pending",
      },
    });

    if (existingAppeal) {
      return NextResponse.json(
        { message: "您有正在处理中的申诉，请勿重复提交" },
        { status: 400 },
      );
    }

    // 创建申诉记录
    const appealId = `appeal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await prisma.accountappeal.create({
      data: {
        id: appealId,
        userId: user.id,
        userAccount,
        userName: user.name,
        userPhone: user.phone,
        userEmail: user.email,
        banReason: "账号封禁",
        appealReason,
        appealEvidence: appealEvidence || null,
        contactInfo: contactInfo || null,
        status: "pending",
      },
    });

    return NextResponse.json({
      success: true,
      message: "申诉提交成功，请耐心等待审核",
      appealId,
    });
  } catch (error) {
    console.error("Submit appeal error:", error);
    return NextResponse.json(
      { message: "服务器错误" },
      { status: 500 },
    );
  }
}
