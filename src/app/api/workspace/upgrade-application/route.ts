import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import { ADMIN_ROLE_VALUES } from "@/lib/role-utils";

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
      description,
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

    // 需求说明：此前版本会直接丢弃该字段，现按约定长度落库
    const trimmedDescription =
      typeof description === "string" ? description.trim().slice(0, 2000) : null;

    // workspaceId 可空：尚未创建空间 / 无管理权限空间的用户也允许提交定制咨询
    if (workspaceId) {
      // 验证用户是否有权限管理该工作空间
      const membership = await prisma.workspacemember.findFirst({
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
      const existingApplication = await prisma.upgradeapplication.findFirst({
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
    } else {
      // 未关联空间的咨询：避免同一用户重复堆积待处理申请
      const existingLooseApplication = await prisma.upgradeapplication.findFirst({
        where: {
          userId,
          workspaceId: null,
          status: "PENDING",
        },
      });

      if (existingLooseApplication) {
        return NextResponse.json(
          { error: "您已有待处理的咨询申请，请耐心等待客户经理联系" },
          { status: 400 }
        );
      }
    }

    // 创建咨询申请（description 一并落库）
    const application = await prisma.upgradeapplication.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: workspaceId || null,
        userId,
        companyName,
        contactName,
        contactPhone,
        description: trimmedDescription,
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    // 双方站内通知：①提交人收到回执 ②全部平台管理员收到待办提醒
    // （通知失败不影响提交结果，仅记录日志）
    try {
      const { addNotification } = await import("@/lib/notifications-store");
      const companyNameSafe = String(companyName).trim().slice(0, 30);
      await addNotification(
        userId,
        "定制方案咨询已提交",
        `我们已收到您提交的定制版方案咨询（企业：${companyNameSafe}）。客户经理将在 1-2 个工作日内与您联系，处理进展将通过消息中心通知您。`,
        "system",
        "/pricing"
      );

      const admins = await prisma.user.findMany({
        where: { role: { in: [...ADMIN_ROLE_VALUES] }, status: "active" },
        select: { id: true },
      });
      for (const admin of admins) {
        await addNotification(
          admin.id,
          "收到新的定制方案咨询",
          `企业「${companyNameSafe}」提交了定制版方案咨询（联系人：${String(contactName).trim().slice(0, 20)} / ${String(contactPhone).trim()}），请前往「定制咨询处理」页跟进。`,
          "system",
          "/admin/upgrade-applications"
        );
      }
    } catch (notifyError) {
      console.error("发送定制咨询通知失败:", notifyError);
    }

    return NextResponse.json({
      success: true,
      message: "咨询申请已提交",
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

    const applications = await prisma.upgradeapplication.findMany({
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
