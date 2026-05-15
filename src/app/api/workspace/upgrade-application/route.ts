import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 升级申请接口
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const {
      companyName,
      contactName,
      contactPhone,
      workspaceId,
    } = await req.json();

    // 验证必填字段
    if (!companyName || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: "请填写所有必填字段" },
        { status: 400 }
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(contactPhone)) {
      return NextResponse.json(
        { error: "请输入有效的手机号码" },
        { status: 400 }
      );
    }

    // 验证工作空间 ID
    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权限管理该工作空间
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
        { error: "您无权管理该工作空间" },
        { status: 403 }
      );
    }

    // 检查是否已有待处理的升级申请
    const existingApplication = await prisma.upgradeApplication.findFirst({
      where: {
        workspaceId,
        status: "PENDING",
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        { error: "该工作空间已有待处理的升级申请" },
        { status: 400 }
      );
    }

    // 创建升级申请
    const application = await prisma.upgradeApplication.create({
      data: {
        workspaceId,
        userId,
        companyName,
        contactName,
        contactPhone,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      message: "升级申请已提交",
      data: application,
    });
  } catch (error) {
    console.error("Upgrade application error:", error);
    return NextResponse.json(
      { error: "提交升级申请失败" },
      { status: 500 }
    );
  }
}

// 获取升级申请列表
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {
      userId,
    };

    if (status) {
      where.status = status;
    }

    const applications = await prisma.upgradeApplication.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error("Get upgrade applications error:", error);
    return NextResponse.json(
      { error: "获取升级申请列表失败" },
      { status: 500 }
    );
  }
}
