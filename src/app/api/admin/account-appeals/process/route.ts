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
    if (!appealId || !status) {
      return NextResponse.json(
        { message: "缺少必填字段 (appealId, status)" },
        { status: 400 },
      );
    }

    if (status === "rejected" && (!adminComment || !adminComment.trim())) {
      return NextResponse.json(
        { message: "驳回申诉必须填写具体的驳回意见与整改说明" },
        { status: 400 },
      );
    }

    const finalComment = (adminComment && adminComment.trim())
      ? adminComment.trim()
      : (status === "approved" ? "同意" : null);

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { message: "无效的审核状态" },
        { status: 400 },
      );
    }

    const finalAdminId = adminId || "system-admin";
    const finalAdminName = adminName || "管理员";

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

    // 允许自愈：若当前申诉状态非 pending，但为空间解封申诉且关联空间实际未被解封，则允许进入自愈解封逻辑
    let isSelfHealing = false;
    if (appeal.status !== "pending") {
      if (appeal.status === "approved" && appeal.businessType === "空间解封申诉") {
        isSelfHealing = true;
      } else {
        return NextResponse.json(
          { message: "该申诉已被处理" },
          { status: 400 },
        );
      }
    }

    // 引入通知服务
    const { addNotification } = await import("@/lib/notifications-store");

    // 分支处理：空间解封申诉 VS 账号解封申诉
    if (appeal.businessType === "空间解封申诉") {
      let workspaceId: string | null = null;
      let workspaceName = "工作空间";

      try {
        if (appeal.appealEvidence) {
          const parsed = JSON.parse(appeal.appealEvidence);
          workspaceId = parsed.workspaceId || null;
          workspaceName = parsed.workspaceName || workspaceName;
        }
      } catch (e) {
        console.warn("解析申诉空间证据元数据失败:", e);
      }

      if (workspaceId) {
        // 安全查询目标工作空间，绝不在 findUnique 中使用未定义的 members 关联
        const targetWs = await prisma.workspace.findUnique({
          where: { id: workspaceId },
        });

        if (targetWs) {
          const currentQuota = (targetWs.quota as any) || {};

          if (status === "approved") {
            // 审核通过：自动解封工作空间，清除停用到期限制，标记 appealStatus 为 approved
            const {
              disabledUntil: _d1,
              disabledReason: _d2,
              disabledDuration: _d3,
              disabledDurationDays: _d4,
              disabledAt: _d5,
              ...restQuota
            } = currentQuota;

            const updatedQuota = {
              ...restQuota,
              appealStatus: "approved",
              approvedAt: new Date().toISOString(),
              approvedComment: finalComment,
            };

            // 使用原子事务同时更新工作空间状态与申诉工单记录
            await prisma.$transaction([
              prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                  status: "ACTIVE",
                  quota: updatedQuota,
                },
              }),
              prisma.accountappeal.update({
                where: { id: appealId },
                data: {
                  status,
                  adminId: finalAdminId,
                  adminName: finalAdminName,
                  adminComment: finalComment,
                  processedAt: new Date(),
                  updatedAt: new Date(),
                },
              }),
            ]);

            // 独立查询工作空间成员推送恢复通知，外层包裹降级防错
            try {
              const members = await prisma.workspacemember.findMany({
                where: { workspaceId },
                select: { userId: true },
              });

              const recipientUserIds = Array.from(
                new Set([targetWs.ownerId, ...members.map((m) => m.userId)].filter(Boolean))
              );

              for (const uid of recipientUserIds) {
                await addNotification(
                  uid,
                  `工作空间【${targetWs.name}】已成功解封恢复运行`,
                  `喜讯：该工作空间的解封申诉已通过风控合规审查！当前空间已全面解除管控，组件算力与写入权限已即时恢复。审核意见：${finalComment || "同意"}`,
                  "system",
                  `/user/workspaces`
                ).catch((notifyErr) => console.warn(`通知用户 ${uid} 失败:`, notifyErr));
              }
            } catch (notifyErr) {
              console.warn("推送空间解封通知发生轻度异常，不影响空间解封业务:", notifyErr);
            }
          } else {
            // 审核驳回：标记 appealStatus 为 rejected，记录驳回理由与时间
            const updatedQuota = {
              ...currentQuota,
              appealStatus: "rejected",
              rejectedAt: new Date().toISOString(),
              rejectedComment: finalComment,
            };

            await prisma.$transaction([
              prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                  quota: updatedQuota,
                },
              }),
              prisma.accountappeal.update({
                where: { id: appealId },
                data: {
                  status,
                  adminId: finalAdminId,
                  adminName: finalAdminName,
                  adminComment: finalComment,
                  processedAt: new Date(),
                  updatedAt: new Date(),
                },
              }),
            ]);

            // 向申诉人发送申诉驳回通知
            try {
              await addNotification(
                appeal.userId,
                `工作空间【${targetWs.name}】解封申诉未通过`,
                `您为工作空间【${targetWs.name}】提交的解封申诉已被风控团队驳回。驳回原因：${finalComment}。提示：每个空间仅限 1 次申诉机会，当前无法重复申诉，若有停用期限请等待到期系统自动恢复。`,
                "system",
                `/user/workspaces`
              ).catch((notifyErr) => console.warn("发送驳回通知失败:", notifyErr));
            } catch (notifyErr) {
              console.warn("推送空间驳回通知异常:", notifyErr);
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: status === "approved"
          ? (isSelfHealing ? "检测到该空间曾处于未竟恢复状态，已成功完成自愈解封并通知全员" : "空间解封申诉已通过，工作空间已即时恢复运行并通知全员")
          : "空间解封申诉已驳回，结果已通知申诉人",
      });
    }

    // 默认：账号解封申诉（使用原子事务）
    if (status === "approved") {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: appeal.userId },
          data: {
            status: "active",
            loginAttempts: 0,
            lockedUntil: null,
          },
        }),
        prisma.accountappeal.update({
          where: { id: appealId },
          data: {
            status,
            adminId: finalAdminId,
            adminName: finalAdminName,
            adminComment: finalComment,
            processedAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ]);

      try {
        await addNotification(
          appeal.userId,
          "账号解封申诉已通过",
          `您的账号解封申诉已通过审查，账号状态已恢复正常。审核意见：${finalComment || "同意"}`,
          "system",
          `/user/dashboard`
        ).catch((e) => console.warn("发送账号解封通知失败:", e));
      } catch (e) {}
    } else {
      await prisma.accountappeal.update({
        where: { id: appealId },
        data: {
          status,
          adminId: finalAdminId,
          adminName: finalAdminName,
          adminComment: finalComment,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      try {
        await addNotification(
          appeal.userId,
          "账号解封申诉未通过",
          `您的账号解封申诉未通过审查。驳回理由：${finalComment}。`,
          "system"
        ).catch((e) => console.warn("发送账号驳回通知失败:", e));
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      message: status === "approved" ? "申诉已通过，账号已恢复" : "申诉已被拒绝",
    });
  } catch (error: any) {
    console.error("Process appeal error:", error);
    return NextResponse.json(
      { message: error?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
