import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { success: false, error: "请先登录后再提交申诉" },
        { status: 401 }
      );
    }

    const { workspaceId, appealReason, contactInfo, appealEvidence, attachments } = await request.json();

    if (!workspaceId || !appealReason || !appealReason.trim()) {
      return NextResponse.json(
        { success: false, error: "工作空间 ID 和申诉理由不能为空" },
        { status: 400 }
      );
    }

    const trimmedReason = appealReason.trim();
    if (trimmedReason.length < 5) {
      return NextResponse.json(
        { success: false, error: "申诉理由过短，最少需要输入 5 个字" },
        { status: 400 }
      );
    }
    if (trimmedReason.length > 100) {
      return NextResponse.json(
        { success: false, error: "申诉理由超出限制，最多允许输入 100 个字" },
        { status: 400 }
      );
    }

    // 查找目标工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        status: true,
        quota: true,
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: "未找到指定的工作空间" },
        { status: 404 }
      );
    }

    // 权限校验：必须是该空间的负责人（所有者）或超级管理员
    const isOwner = workspace.ownerId === auth.user.id;
    const isAdmin = auth.user.role === "SUPER_ADMIN" || auth.user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "只有工作空间所有者拥有提交解封申诉的权限" },
        { status: 403 }
      );
    }

    if (workspace.status !== "DISABLED") {
      return NextResponse.json(
        { success: false, error: "该工作空间当前处于正常运行状态，无需发起解封申诉" },
        { status: 400 }
      );
    }

    const currentQuota = (workspace.quota as any) || {};
    const appealCount = currentQuota.appealCount || 0;
    const appealStatus = currentQuota.appealStatus || "none";

    // 严格限制：每个空间仅限 1 次申诉机会！
    if (appealCount >= 1 || appealStatus === "pending") {
      return NextResponse.json(
        {
          success: false,
          error: "该工作空间申诉机会已用尽（每个空间严格限申诉 1 次）。若已被驳回，请等待管控期限到期后系统自动解封。",
        },
        { status: 400 }
      );
    }

    const appealId = `appeal-ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // 处理证明材料与附件：选填项，最多允许 3 个材料（图片、Word、Excel等均可）
    const rawEvidence = attachments || appealEvidence;
    let sanitizedEvidence: any = null;
    if (Array.isArray(rawEvidence)) {
      sanitizedEvidence = rawEvidence.slice(0, 3).map((item: any) => ({
        id: item.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: String(item.name || "材料附件").substring(0, 100),
        size: typeof item.size === "number" ? item.size : 0,
        type: String(item.type || "application/octet-stream"),
        // 严格安全截断：防止超长 base64 撑爆 MySQL TEXT 字段（最大 64KB）
        url: typeof item.url === "string" 
          ? (item.url.startsWith("data:image/") ? item.url.substring(0, 15000) : item.url.substring(0, 2000))
          : "",
      }));
    } else if (typeof rawEvidence === "string" && rawEvidence.trim()) {
      sanitizedEvidence = rawEvidence.trim().substring(0, 5000);
    }

    const workspaceMeta = {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      disabledUntil: currentQuota.disabledUntil || null,
      disabledDuration: currentQuota.disabledDuration || "permanent",
      disabledReason: currentQuota.disabledReason || "违反平台运营与合规规范",
      extraEvidence: sanitizedEvidence,
    };

    // 写入统一的风控工单中心表 accountappeal，标记业务类型为「空间解封申诉」
    await prisma.accountappeal.create({
      data: {
        id: appealId,
        userId: auth.user.id,
        userAccount: auth.user.name || auth.user.email || "用户",
        userName: auth.user.name,
        userPhone: null,
        userEmail: auth.user.email,
        banReason: currentQuota.disabledReason || "工作空间触发安全合规管控被停用",
        appealReason: appealReason.trim(),
        appealEvidence: JSON.stringify(workspaceMeta),
        contactInfo: contactInfo ? contactInfo.trim() : (auth.user.email || null),
        businessType: "空间解封申诉",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 增量更新工作空间的 quota JSON
    const updatedQuota = {
      ...currentQuota,
      appealStatus: "pending",
      appealCount: appealCount + 1,
      lastAppealAt: new Date().toISOString(),
      lastAppealId: appealId,
    };

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        quota: updatedQuota,
      },
    });

    // 发送用户端受理通知
    await addNotification(
      auth.user.id,
      "工作空间解封申诉已受理",
      `您针对工作空间【${workspace.name}】提交的解封申诉已成功进入风控与审核中心（工单号: ${appealId}）。管理员将在 1-3 个工作日内完成审查，请留意审核结果。`,
      "system",
      `/user/workspaces`
    );

    // 向系统管理员广播待办通知
    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "active" },
      select: { id: true },
      take: 5,
    });

    for (const admin of admins) {
      if (admin.id !== auth.user.id) {
        await addNotification(
          admin.id,
          "收到新的工作空间解封申诉",
          `用户【${auth.user.name}】为被管控空间【${workspace.name}】提交了解封申诉，请前往「风控与审核」中心处理。`,
          "system",
          `/admin/account-appeals`
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "解封申诉提交成功，工单已进入风控审核流程，请耐心等待审查结果",
      appealId,
    });
  } catch (error) {
    console.error("提交工作空间申诉失败:", error);
    return NextResponse.json(
      { success: false, error: "系统繁忙，提交申诉失败，请稍后重试" },
      { status: 500 }
    );
  }
}
