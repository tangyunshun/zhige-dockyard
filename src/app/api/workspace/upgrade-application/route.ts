import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 提交企业版升级申请
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const {
      companyName,
      contactName,
      contactPhone,
      workspaceId,
    } = await req.json();

    // 验证必填项
    if (!companyName || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: "请填写所有必填项" },
        { status: 400 }
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(contactPhone)) {
      return NextResponse.json(
        { error: "请输入有效的手机号" },
        { status: 400 }
      );
    }

    // 验证工作空间
    if (!workspaceId) {
      return NextResponse.json(
        { error: "请提供工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权操作此工作空间
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        role: {
          in: ["OWNER", "ADMIN"],
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "无权操作此工作空间" },
        { status: 403 }
      );
    }

    // 检查是否已有待处理的申请
    const existingApplication = await prisma.upgradeApplication.findFirst({
      where: {
        userId,
        workspaceId,
        status: "PENDING",
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        { error: "您已有待处理的升级申请，请耐心等待" },
        { status: 400 }
      );
    }

    // 创建升级申请
    const application = await prisma.upgradeApplication.create({
      data: {
        userId,
        workspaceId,
        companyName,
        contactName,
        contactPhone,
        status: "PENDING",
        submittedAt: new Date(),
      },
    });

    // TODO: 发送邮件通知管理员
    // await sendEmailNotification({
    //   to: "admin@zhige.com",
    //   subject: "新的企业版升级申请",
    //   data: {
    //     companyName,
    //     contactName,
    //     contactPhone,
    //     applicationId: application.id,
    //   },
    // });

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      message: "升级申请已提交，工作人员将尽快联系您",
    });
  } catch (error) {
    console.error("提交升级申请失败:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 获取用户的升级申请状态
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "请提供工作空间 ID" },
        { status: 400 }
      );
    }

    const applications = await prisma.upgradeApplication.findMany({
      where: { userId, workspaceId },
      orderBy: { submittedAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ applications });
  } catch (error) {
    console.error("获取升级申请失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}
