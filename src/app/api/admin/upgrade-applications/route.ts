import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const applications = await prisma.upgradeapplication.findMany({
      where,
      include: {
        workspace: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { applications, total: applications.length, page: 1, totalPages: 1 } });
  } catch (error) {
    console.error("Get upgrade applications error:", error);
    return NextResponse.json({ error: "获取升级申请失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const { id, applicationId, status, adminRemark } = body;
    const targetId = applicationId || id;

    // 咨询处理状态：待处理 / 处理中 / 已完成 / 已驳回
    const allowedStatuses = ["PENDING", "PROCESSING", "COMPLETED", "REJECTED"];
    if (!targetId || !status) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "无效的处理状态" }, { status: 400 });
    }
    if (status === "REJECTED" && (!adminRemark || !String(adminRemark).trim())) {
      return NextResponse.json({ error: "驳回时必须填写处理说明" }, { status: 400 });
    }

    const app = await prisma.upgradeapplication.findUnique({
      where: { id: targetId },
    });

    if (!app) {
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    const application = await prisma.upgradeapplication.update({
      where: { id: targetId },
      data: {
        status,
        adminRemark:
          adminRemark && String(adminRemark).trim()
            ? String(adminRemark).trim().slice(0, 1000)
            : null,
        handledBy: userId,
        updatedAt: new Date(),
      },
    });

    // 站内通知提交用户：仅状态实际变化时发送，避免重复打扰（通知失败不影响处理结果）
    if (app.status !== status) {
      try {
        const { addNotification } = await import("@/lib/notifications-store");
        const handlerName = user.name || "平台运营团队";
        const remarkText =
          adminRemark && String(adminRemark).trim() ? `处理说明：${String(adminRemark).trim().slice(0, 200)}` : "";
        const notifyByStatus: Record<string, { title: string; content: string }> = {
          PROCESSING: {
            title: "您的定制方案咨询已开始处理",
            content: `您提交的定制版方案咨询（企业：${app.companyName}）已由客户经理 ${handlerName} 开始处理，请保持联系电话畅通。`,
          },
          COMPLETED: {
            title: "您的定制方案咨询已处理完成",
            content: `您提交的定制版方案咨询（企业：${app.companyName}）已完成处理。${remarkText} 如有后续需求，欢迎再次咨询。`,
          },
          REJECTED: {
            title: "您的定制方案咨询未通过",
            content: `您提交的定制版方案咨询（企业：${app.companyName}）未通过。${remarkText} 如有疑问，可通过定价页重新提交咨询与我们联系。`,
          },
        };
        const notify = notifyByStatus[status];
        if (notify) {
          await addNotification(app.userId, notify.title, notify.content, "system", "/pricing");
        }
      } catch (notifyError) {
        console.error("发送定制咨询处理通知失败:", notifyError);
      }
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error("Process upgrade application error:", error);
    return NextResponse.json({ error: "处理升级申请失败" }, { status: 500 });
  }
}
