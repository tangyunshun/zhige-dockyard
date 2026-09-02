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
      businessType,
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

    // 以当前封禁周期为统计口径：pending + rejected 均占用申诉机会
    const currentBanStartTime = user.status === "banned" ? new Date(user.updatedAt) : new Date();
    const banThreshold = new Date(currentBanStartTime.getTime() - 2000);

    const rejectedCount = await prisma.accountappeal.count({
      where: {
        userId: user.id,
        status: "rejected",
        createdAt: { gte: banThreshold },
      },
    });

    const pendingCount = await prisma.accountappeal.count({
      where: {
        userId: user.id,
        status: "pending",
        createdAt: { gte: banThreshold },
      },
    });

    if (rejectedCount >= 3) {
      return NextResponse.json(
        { message: "您的 3 次解封申诉申请已全部被判定驳回，账号已被锁定并进入 30 天自动注销销户流程，无法继续提交申诉。" },
        { status: 400 },
      );
    }

    if (pendingCount > 0) {
      return NextResponse.json(
        { message: "您有正在处理中的申诉，请勿重复提交" },
        { status: 400 },
      );
    }

    if (rejectedCount + pendingCount >= 3) {
      return NextResponse.json(
        { message: "您当前的申诉机会已用完，请等待正在处理中的申诉审核结果" },
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
        banReason: user.banReason || "系统检测到账号存在违规行为，已被限制使用",
        appealReason,
        appealEvidence: appealEvidence || null,
        contactInfo: contactInfo || null,
        businessType: businessType || "账号解封申诉",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
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
