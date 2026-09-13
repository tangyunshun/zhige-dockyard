import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { addNotification } from "@/lib/notifications-store";
import { requirePlatformPermission } from "@/lib/security";

export async function PATCH(request: NextRequest) {
  try {
    // 严格校验工作空间状态更新权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "workspace:status_update");
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    // 支持同时从 URL searchParams 或 JSON body 获取参数
    let workspaceId: string | null = null;
    let status: string | null = null;
    let reason: string | null = null;
    let duration: string | null = null;

    const { searchParams } = new URL(request.url);
    workspaceId = searchParams.get("workspaceId");
    status = searchParams.get("status");
    reason = searchParams.get("reason");
    duration = searchParams.get("duration");

    if (request.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await request.json();
        if (body.workspaceId) workspaceId = body.workspaceId;
        if (body.status) status = body.status;
        if (body.reason) reason = body.reason;
        if (body.duration) duration = body.duration;
      } catch {
        // 忽略无效 json
      }
    }

    if (!workspaceId || !status) {
      return NextResponse.json({ error: "缺少工作空间ID或目标状态" }, { status: 400 });
    }

    if (!["ACTIVE", "DISABLED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 安全保护校验：若试图停用工作空间，必须检查该空间是否由管理员所有
    if (status === "DISABLED") {
      const owner = await prisma.user.findUnique({
        where: { id: workspace.ownerId },
        select: { id: true, role: true, name: true },
      });

      if (
        (owner && (owner.role === "SUPER_ADMIN" || owner.role === "ADMIN")) ||
        workspace.ownerId === userId
      ) {
        return NextResponse.json(
          { error: "超级管理员与系统管理员的工作空间受系统安全保护，不可停用" },
          { status: 403 },
        );
      }

      // 前置合规依赖检测：空间内若存在协同成员或装配组件，必须阻断停用
      const otherMemberCount = await prisma.workspacemember.count({
        where: {
          workspaceId,
          userId: { not: workspace.ownerId },
        },
      });

      const usages = await prisma.componentusage.findMany({
        where: { workspaceId },
        select: { metadata: true },
      });
      let boundComponentCount = 0;
      usages.forEach((u: any) => {
        if (!u.metadata) return;
        try {
          const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
          if (meta && meta.enabled === true) boundComponentCount++;
        } catch {}
      });

      if (otherMemberCount > 0 || boundComponentCount > 0) {
        const errors: string[] = [];
        if (otherMemberCount > 0) errors.push(`${otherMemberCount} 位协同成员`);
        if (boundComponentCount > 0) errors.push(`${boundComponentCount} 个装配组件`);
        return NextResponse.json(
          {
            error: `停用管控已被阻断：检测到该空间仍存在 ${errors.join("及")}。为保障数据资产与成员权益，请先移出成员并卸载组件后再执行停用。`,
          },
          { status: 400 },
        );
      }
    }

    const isDisabling = status === "DISABLED";
    const currentQuota = (workspace.quota as any) || {};

    let disabledUntilDate: Date | null = null;
    let durationText = "永久停用";
    let durationDays = -1;

    if (isDisabling) {
      const dur = duration || "7d";
      if (dur === "1d") {
        durationDays = 1;
      } else if (dur === "3d") {
        durationDays = 3;
      } else if (dur === "7d") {
        durationDays = 7;
      } else if (dur === "30d" || dur === "1m") {
        durationDays = 30;
      } else if (dur === "365d" || dur === "1y") {
        durationDays = 365;
      } else if (dur === "permanent") {
        durationDays = -1;
      } else {
        const parsed = parseInt(dur);
        durationDays = !isNaN(parsed) && parsed > 0 ? parsed : -1;
      }

      if (durationDays > 0) {
        disabledUntilDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
        durationText = `${durationDays} 天（至 ${disabledUntilDate.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}）`;
      } else {
        durationText = "永久停用";
      }

      // 更新空间为停用状态，持久化停用截止期、停用原因和申诉状态
      const newQuota = {
        ...currentQuota,
        disabledUntil: disabledUntilDate ? disabledUntilDate.toISOString() : null,
        disabledReason: reason?.trim() || "违反平台运营与合规规范",
        disabledDuration: duration || (durationDays > 0 ? `${durationDays}d` : "permanent"),
        disabledDurationDays: durationDays,
        disabledAt: new Date().toISOString(),
        appealStatus: currentQuota.appealStatus === "approved" ? "none" : (currentQuota.appealStatus || "none"),
      };

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          status: "DISABLED",
          quota: newQuota,
        },
      });
    } else {
      // 恢复启用：清除停用截止期与停用原因元数据
      const {
        disabledUntil,
        disabledReason,
        disabledDuration,
        disabledDurationDays,
        disabledAt,
        ...restQuota
      } = currentQuota;

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          status: "ACTIVE",
          quota: {
            ...restQuota,
            appealStatus: "none",
          },
        },
      });
    }

    // 触发站内消息通知闭环：通知空间所有者与全体在编成员
    try {
      const members = await prisma.workspacemember.findMany({
        where: { workspaceId: workspace.id },
        select: { userId: true },
      });

      const recipientIds = Array.from(
        new Set([workspace.ownerId, ...members.map((m) => m.userId)].filter(Boolean))
      );

      const notifyTitle = isDisabling
        ? `【系统安全管控】工作空间「${workspace.name}」已被管理员停用`
        : `【服务恢复通知】工作空间「${workspace.name}」已解除管控并恢复启用`;

      const notifyContent = isDisabling
        ? `尊敬的用户，您所在的企业工作空间「${workspace.name}」已被系统管理员实施停用管控。管控原因：${
            reason?.trim() || "违反平台运营与合规规范"
          }。管控期限：${durationText}。在停用期间，该空间内所有组件算力调用与数据写入操作已冻结。空间所有者可前往中控台发起申诉。`
        : `尊敬的用户，您所在的企业工作空间「${workspace.name}」已被管理员解除管控并恢复正常运行，所有算力配额与组件服务已重新开放。`;

      await Promise.allSettled(
        recipientIds.map((targetUid) =>
          addNotification(targetUid, notifyTitle, notifyContent, "system", "/workspace-hub")
        )
      );
    } catch (notifyErr) {
      console.error("空间状态变更后发送通知失败:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      message: `工作空间已${status === "ACTIVE" ? "恢复启用" : "停用管控"}`,
      disabledUntil: disabledUntilDate ? disabledUntilDate.toISOString() : null,
      durationText,
    });
  } catch (error) {
    console.error("Toggle workspace status error:", error);
    return NextResponse.json(
      {
        error: "切换工作空间状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
