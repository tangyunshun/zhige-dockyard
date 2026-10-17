import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { addNotification } from "@/lib/notifications-store";

export async function POST(request: NextRequest) {
  try {
    // 严格校验批量工作空间状态更新权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "workspace:status_update");
    if (!authCheck.authorized) {
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }
    // 当前操作人 ID：用于「管理员自己的空间受系统保护、不可被批量管控」判定
    const userId = authCheck.user!.id;

    const body = await request.json().catch(() => ({}));
    const { workspaceIds, status, reason, duration } = body;

    if (
      !workspaceIds ||
      !Array.isArray(workspaceIds) ||
      workspaceIds.length === 0
    ) {
      return NextResponse.json(
        { error: "缺少工作空间 ID 列表" },
        { status: 400 },
      );
    }

    if (!status || !["ACTIVE", "DISABLED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    const targetStatus = status as "ACTIVE" | "DISABLED";
    const isDisabling = targetStatus === "DISABLED";
    const statusLabel = isDisabling ? "停用" : "启用";

    // 1. 读取目标空间真实数据（含所有者，用于受保护校验）
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true, type: true, status: true, ownerId: true, quota: true },
    });
    const ownerIds = Array.from(new Set(workspaces.map((w) => w.ownerId).filter(Boolean)));
    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, role: true },
        })
      : [];
    const ownerRoleMap = new Map(owners.map((o) => [o.id, (o.role || "").toUpperCase()]));
    const PROTECTED_ROLES = ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "PLATFORM_ADMIN", "PLATFORMADMIN"];

    const skipped: { id: string; name: string; reason: string }[] = [];

    // 2. 不存在的空间
    const existingIds = new Set(workspaces.map((w) => w.id));
    for (const id of workspaceIds) {
      if (!existingIds.has(id)) {
        skipped.push({ id, name: id, reason: "工作空间不存在或已被删除" });
      }
    }

    // 3. 逐条判定可操作性：个人空间与企业空间均可批量管控，仅排除受保护空间与状态无变化的空间
    const operable = workspaces.filter((w) => {
      if (PROTECTED_ROLES.includes(ownerRoleMap.get(w.ownerId) || "") || w.ownerId === userId) {
        skipped.push({ id: w.id, name: w.name, reason: "管理员空间受系统安全保护，不可管控" });
        return false;
      }
      if (w.status === targetStatus) {
        skipped.push({ id: w.id, name: w.name, reason: `该空间已是${statusLabel}状态` });
        return false;
      }
      return true;
    });

    // 4. 停用前置合规检测：空间内若存在协同成员或装配组件，必须阻断停用（与单条 toggle-status 口径一致）
    if (isDisabling && operable.length > 0) {
      const ids = operable.map((w) => w.id);
      const [memberRows, usageRows] = await Promise.all([
        prisma.workspacemember.findMany({
          where: { workspaceId: { in: ids } },
          select: { workspaceId: true, userId: true },
        }),
        prisma.componentusage.findMany({
          where: { workspaceId: { in: ids } },
          select: { workspaceId: true, metadata: true },
        }),
      ]);

      const stillOperable: typeof operable = [];
      for (const w of operable) {
        const otherMembers = memberRows.filter(
          (m) => m.workspaceId === w.id && m.userId !== w.ownerId,
        ).length;
        let boundComponents = 0;
        for (const u of usageRows) {
          if (u.workspaceId !== w.id) continue;
          let enabled = true;
          if (u.metadata) {
            try {
              const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
              if (meta && meta.enabled === false) enabled = false;
            } catch {}
          }
          if (enabled) boundComponents++;
        }
        if (otherMembers > 0 || boundComponents > 0) {
          const parts: string[] = [];
          if (otherMembers > 0) parts.push(`${otherMembers} 位协同成员`);
          if (boundComponents > 0) parts.push(`${boundComponents} 个装配组件`);
          skipped.push({
            id: w.id,
            name: w.name,
            reason: `停用管控被阻断：检测到${parts.join("及")}，请先移出成员并卸载组件后再执行停用`,
          });
          continue;
        }
        stillOperable.push(w);
      }
      // 用通过合规检测的空间替换 operable
      operable.length = 0;
      operable.push(...stillOperable);
    }

    // 5. 逐个空间执行批量更新（写入 quota 元数据 + 站内通知），保证与单条禁用完全一致
    const processedIds: string[] = [];
    const notifyPromises: Promise<unknown>[] = [];

    for (const w of operable) {
      const currentQuota = (w.quota as any) || {};

      if (isDisabling) {
        // 时长解析（与单条 toggle-status 一致；批量接口未传则默认永久停用）
        const dur = duration || "permanent";
        let durationDays = -1;
        if (dur === "1d") durationDays = 1;
        else if (dur === "3d") durationDays = 3;
        else if (dur === "7d") durationDays = 7;
        else if (dur === "30d" || dur === "1m") durationDays = 30;
        else if (dur === "365d" || dur === "1y") durationDays = 365;
        else if (dur === "permanent") durationDays = -1;
        else {
          const parsed = parseInt(dur);
          durationDays = !isNaN(parsed) && parsed > 0 ? parsed : -1;
        }

        let disabledUntilDate: Date | null = null;
        let durationText = "永久停用";
        if (durationDays > 0) {
          disabledUntilDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
          durationText = `${durationDays} 天（至 ${disabledUntilDate.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}）`;
        }

        const newQuota = {
          ...currentQuota,
          disabledUntil: disabledUntilDate ? disabledUntilDate.toISOString() : null,
          disabledReason: reason?.trim() || "批量管控：违反平台运营与合规规范",
          disabledDuration: dur || (durationDays > 0 ? `${durationDays}d` : "permanent"),
          disabledDurationDays: durationDays,
          disabledAt: new Date().toISOString(),
          appealStatus: currentQuota.appealStatus === "approved" ? "none" : (currentQuota.appealStatus || "none"),
        };

        await prisma.workspace.update({
          where: { id: w.id },
          data: { status: "DISABLED", quota: newQuota },
        });
      } else {
        const {
          disabledUntil,
          disabledReason,
          disabledDuration,
          disabledDurationDays,
          disabledAt,
          ...restQuota
        } = currentQuota;

        await prisma.workspace.update({
          where: { id: w.id },
          data: {
            status: "ACTIVE",
            quota: { ...restQuota, appealStatus: "none" },
          },
        });
      }

      processedIds.push(w.id);

      // 触发站内消息通知闭环：通知空间所有者与全体在编成员
      const members = await prisma.workspacemember.findMany({
        where: { workspaceId: w.id },
        select: { userId: true },
      });
      const recipientIds = Array.from(
        new Set([w.ownerId, ...members.map((m) => m.userId)].filter(Boolean)),
      );
      const notifyTitle = isDisabling
        ? `【系统安全管控】工作空间「${w.name}」已被管理员批量停用`
        : `【服务恢复通知】工作空间「${w.name}」已解除管控并恢复启用`;
      const notifyContent = isDisabling
        ? `尊敬的用户，您所在的企业工作空间「${w.name}」已被系统管理员批量实施停用管控。管控原因：${
            reason?.trim() || "违反平台运营与合规规范"
          }。在停用期间，该空间内所有组件算力调用与数据写入操作已冻结。空间所有者可前往中控台发起申诉。`
        : `尊敬的用户，您所在的企业工作空间「${w.name}」已被管理员解除管控并恢复正常运行，所有算力配额与组件服务已重新开放。`;
      for (const targetUid of recipientIds) {
        notifyPromises.push(
          addNotification(targetUid, notifyTitle, notifyContent, "system", "/workspace-hub"),
        );
      }
    }

    await Promise.allSettled(notifyPromises);

    // 统一审计：记录本次批量管控操作（高危可审计）
    void writeAuditLog(
      userId,
      "workspace:batch_toggle",
      {
        targetStatus,
        processedCount: processedIds.length,
        processedIds,
        skippedCount: skipped.length,
        skipped: skipped.map((s) => ({ id: s.id, reason: s.reason })),
      },
      null,
      null,
      request,
    );

    return NextResponse.json({
      success: true,
      processedCount: processedIds.length,
      skippedCount: skipped.length,
      skipped,
      message: `已批量${statusLabel} ${processedIds.length} 个工作空间${
        skipped.length ? `， ${skipped.length} 个已跳过` : ""
      }`,
    });
  } catch (error) {
    console.error("Batch toggle workspaces error:", error);
    return NextResponse.json(
      {
        error: "批量切换工作空间状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
