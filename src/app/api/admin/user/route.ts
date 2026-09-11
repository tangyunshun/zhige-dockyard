import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { executeAdminUserDeletion } from "@/lib/admin-user-deletion";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// GET: 获取单个用户详情 (需要 user:read)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    // 关键统计查询：用 Promise.allSettled 替代 Promise.all
    // —— 即使某个查询（如 componenttask / apikey / loginhistory）在 dev 服务器的 Prisma Client 上抛异常，
    // 也不会拖垮整个接口返回 500，其他成功的查询结果照样能用
    const settled = await Promise.allSettled([
      prisma.user.findUnique({ where: { id: targetUserId } }),
      prisma.workspacemember.count({ where: { userId: targetUserId } }),
      prisma.apikey.count({ where: { userId: targetUserId } }),
      prisma.componenttask.count({ where: { userId: targetUserId } }),
      prisma.loginhistory.count({ where: { userId: targetUserId } }),
    ]);

    const targetUser = settled[0].status === "fulfilled" ? settled[0].value : null;
    const workspaceCount = settled[1].status === "fulfilled" ? settled[1].value : 0;
    const apikeyCount = settled[2].status === "fulfilled" ? settled[2].value : 0;
    const componentCount = settled[3].status === "fulfilled" ? settled[3].value : 0;
    const loginHistoryCount = settled[4].status === "fulfilled" ? settled[4].value : 0;

    // 记录失败的查询（哪个模型/字段不被 dev 服务器的 Prisma Client 识别），便于排查
    const queryLabels = ["user.findUnique", "workspacemember.count", "apikey.count", "componenttask.count", "loginhistory.count"];
    settled.forEach((r, idx) => {
      if (r.status === "rejected") {
        console.error(
          `[Get user] Query "${queryLabels[idx]}" failed:`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      }
    });

    // 用户所属的工作空间（含企业空间）—— 给前端"所属企业/团队"展示用
    // 单独 try/catch：dev 服务器可能加载了旧版 Prisma Client，对 include + 关联字段 select 不支持，
    // 一旦失败不影响主接口的 5 个统计卡片，只让 workspace 字段回退为"未关联"
    let workspaceMemberships: Array<{
      workspaceId: string;
      name: string;
      type: string;
      status: string;
      role: string;
      tokenBalance: number;
    }> = [];
    try {
      // 两步走 + JS 组装：完全避开 Prisma 关联 include / select，
      // 只用最基础的 where / take / in 查询，保证在任何版本 Client 上都能跑
      const memberships = await prisma.workspacemember.findMany({
        where: { userId: targetUserId },
        take: 20,
      });
      const wsIds = memberships.map((m) => m.workspaceId);
      // 不写 select，返回 workspace 全部字段：
      // 与原始代码 include: { workspace: true } 的查询形状一致（这是 dev 服务器上已验证可行的形状），
      // 避免旧 Client 不认某个 select 字段导致查询失败
      const workspaces = wsIds.length
        ? await prisma.workspace.findMany({
            where: { id: { in: wsIds } },
          })
        : [];
      const wsMap = new Map(workspaces.map((w) => [w.id, w]));
      // 查这些工作空间各自的算力余额，用于区分「个人空间 / 企业空间」分别有多少算力点
      const quotas = wsIds.length
        ? await prisma.workspacequota.findMany({
            where: { workspaceId: { in: wsIds } },
          })
        : [];
      const quotaMap = new Map(quotas.map((q) => [q.workspaceId, q]));
      workspaceMemberships = memberships.map((m) => {
        const ws = wsMap.get(m.workspaceId);
        const quota = quotaMap.get(m.workspaceId);
        return {
          workspaceId: m.workspaceId,
          name: ws?.name ?? "未知工作空间",
          type: ws?.type ?? "PERSONAL",
          status: ws?.status ?? "ACTIVE",
          role: m.role,
          tokenBalance: quota ? Number(quota.tokenBalance) : 0,
        };
      });
      console.log(
        `[Get user] workspaceMemberships for user ${targetUserId}: found ${workspaceMemberships.length}`,
      );
    } catch (wsErr) {
      console.error(
        "[Get user] workspaceMemberships query failed (non-fatal):",
        wsErr instanceof Error ? wsErr.message : wsErr,
      );
    }

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    let effectiveLastLoginAt = targetUser.lastLoginAt;
    if (!effectiveLastLoginAt && (targetUser.sessionToken || targetUser.sessionExpiresAt)) {
      effectiveLastLoginAt = targetUser.sessionExpiresAt
        ? new Date(new Date(targetUser.sessionExpiresAt).getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date();
      prisma.user.update({
        where: { id: targetUser.id },
        data: { lastLoginAt: effectiveLastLoginAt },
      }).catch(() => {});
    }

    // 连表查询最新的封禁案由凭证记录
    // 同样单独 try/catch：accountappeal 是较新的表，旧 Prisma Client 可能不含该模型，
    // 一旦抛出会直接被外层 catch 捕获导致整个接口 500，这里隔离掉
    let latestAppealMeta: { banReason?: string | null } | null = null;
    try {
      latestAppealMeta = await prisma.accountappeal.findFirst({
        where: { userId: targetUser.id },
        orderBy: { createdAt: "desc" },
      });
    } catch (apErr) {
      console.warn(
        "[Get user] accountappeal query failed (non-fatal):",
        apErr instanceof Error ? apErr.message : apErr,
      );
    }

    const banReasonText = targetUser.banReason || latestAppealMeta?.banReason || "系统检测到账号存在违规行为，已被限制使用";

    // 用户可用算力点：与 /api/user/profile 保持完全一致的口径
    // ——取该用户「个人空间」的 workspacequota.tokenBalance（只读实际余额，不赠送/兜底）。
    // 用两次简单查询（findFirst + findUnique）代替 include + select，
    // 避免旧版 Prisma Client 不支持关联查询导致失败。
    let tokenBalance = 0;
    try {
      const personalWs = await prisma.workspace.findFirst({
        where: { ownerId: targetUserId, type: "PERSONAL" },
      });
      if (personalWs) {
        const quota = await prisma.workspacequota.findUnique({
          where: { workspaceId: personalWs.id },
        });
        if (quota) {
          tokenBalance = Number(quota.tokenBalance);
        }
      }
      console.log(
        `[Get user] tokenBalance for user ${targetUserId}: ${tokenBalance}`,
      );
    } catch (ptErr) {
      console.warn(
        "[Get user] tokenBalance query failed (non-fatal):",
        ptErr instanceof Error ? ptErr.message : ptErr,
      );
    }

    // 算力点三类归属拆分（管理员视角）：个人空间 / 企业空间 / 全局钱包
    //   - 个人空间：type=PERSONAL 的工作空间配额（注册即开通，仅本人可消费）
    //   - 企业空间：type=ENTERPRISE 的工作空间共享池（企业充值/人工入账，该企业成员可消费）
    //   - 全局钱包：pointgrant 中 scope=WALLET 的发放批次剩余量之和（在线充值/退款所得，跨空间通用）
    let pointsPersonal = 0;
    let pointsEnterprise = 0;
    for (const m of workspaceMemberships) {
      if (m.type === "ENTERPRISE") pointsEnterprise += m.tokenBalance;
      else pointsPersonal += m.tokenBalance;
    }

    let pointsWallet = 0;
    try {
      const walletGrants = await prisma.pointgrant.findMany({
        where: { userId: targetUserId, scope: "WALLET", status: "ACTIVE" },
      });
      const nowTs = Date.now();
      pointsWallet = walletGrants
        .filter((g) => !g.expiresAt || new Date(g.expiresAt).getTime() > nowTs)
        .reduce((sum, g) => sum + Number(g.remaining || 0), 0);
    } catch (wErr) {
      console.warn(
        "[Get user] wallet points query failed (non-fatal):",
        wErr instanceof Error ? wErr.message : wErr,
      );
    }

    // 第四类：作为企业成员被分配的"协同分配额度"
    // —— 与 /api/user/workspace-hub/dashboard 中 memberAllocatedTokens 口径完全一致，
    //    用户在工作空间首页"资源额度"看到的可用余额就含这部分，管理员详情也要展示才能对得上
    let pointsMemberAllocated = 0;
    try {
      const memberRows = await prisma.workspacemember.findMany({
        where: { userId: targetUserId },
      });
      const wsIds = memberRows.map((m) => m.workspaceId);
      const wsList = wsIds.length
        ? await prisma.workspace.findMany({ where: { id: { in: wsIds } } })
        : [];
      const wsMap = new Map(wsList.map((w) => [w.id, w]));
      memberRows.forEach((m) => {
        const ws = wsMap.get(m.workspaceId);
        // 仅算「非 Owner 的企业成员」被分配的额度剩余
        if (ws && ws.type === "ENTERPRISE" && ws.ownerId !== targetUserId) {
          const limit = m.monthlyTokenLimit ? Number(m.monthlyTokenLimit) : 0;
          const used = Number(m.monthlyTokenUsed || 0);
          if (limit > used) pointsMemberAllocated += limit - used;
        }
      });
    } catch (maErr) {
      console.warn(
        "[Get user] member allocated points query failed (non-fatal):",
        maErr instanceof Error ? maErr.message : maErr,
      );
    }

    const pointsBreakdown = {
      personal: pointsPersonal,
      enterprise: pointsEnterprise,
      memberAllocated: pointsMemberAllocated,
      wallet: pointsWallet,
    };

    return NextResponse.json({
      success: true,
      data: {
        ...targetUser,
        banReason: banReasonText,
        tokenBalance,
        lastLoginAt: effectiveLastLoginAt,
        // 用户所属的工作空间列表（含企业空间）—— 用于"所属企业/团队"展示
        // 注意：企业概念在 schema 里同时存在于 tenant 表和 workspace(type=ENTERPRISE)，
        // 这里以 workspace 为权威来源（多数业务逻辑走 workspace）
        // 已在上面的 try/catch 中组装为扁平对象 { workspaceId, name, type, status, role, tokenBalance }，
        // 直接返回即可（不要再做 map，否则会读 undefined 的嵌套 workspace 属性而抛错）
        workspaceMemberships,
        // 三类算力点拆分：个人空间 / 企业空间 / 全局钱包
        pointsBreakdown,
        stats: {
          workspaceCount,
          apikeyCount,
          componentCount,
          loginHistoryCount,
        },
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "获取用户信息失败" },
      { status: 500 }
    );
  }
}

// PATCH: 更新用户信息/角色/状态 (需要 user:update, 修改角色仅限 SuperAdmin)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, status, role, bannedUntil, banReason } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    // 1. 基本编辑鉴权
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;
    const adminRole = authResult.user!.role;

    // 获取目标用户
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 超管越权保护：不能操作超级管理员
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能对超级管理员执行编辑或限制操作" }, { status: 403 });
    }

    // 不能操作自己 (针对非角色变更的 status 调整安全放行)
    if (userId === adminId && role !== undefined && role !== targetUser.role) {
      return NextResponse.json({ error: "不能修改自己的账户角色" }, { status: 403 });
    }

    // 2. 角色修改限制：修改用户平台角色仅 SuperAdmin 允许
    if (role !== undefined && role !== targetUser.role) {
      if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "越权警告：只有超级管理员允许变更用户的平台角色" }, { status: 403 });
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (status !== undefined) {
      if (!["active", "inactive", "banned", "deleted"].includes(status)) {
        return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
      }
      updateData.status = status;
      if (status === "banned") {
        // 如果是封禁状态，更新解封时间与即时强制下线时间戳
        updateData.bannedUntil = bannedUntil ? new Date(bannedUntil) : null;
        updateData.lastForcedLogoutAt = new Date();
        // 将管理员选择/输入的封禁原因落库到用户表（权威来源）
        if (banReason) {
          updateData.banReason = banReason;
        }
      } else if (status === "active") {
        // 解封时清空封禁原因
        updateData.banReason = null;
      }
    }
    if (role !== undefined) {
      if (role === "admin") {
        if (targetUser.role === "admin") {
          return NextResponse.json({ error: "任命失败：该用户当前已是运营管理员，请勿重复任命。" }, { status: 400 });
        }
        // 限制：系统中只能存在唯一一个普通的运营管理员 (PlatformAdmin)
        const existingAdmin = await prisma.user.findFirst({
          where: {
            role: "admin",
            id: { not: userId }
          }
        });
        if (existingAdmin) {
          return NextResponse.json({ error: "任命失败：系统当前已存在一位运营管理员，请先撤销其管理员身份。" }, { status: 400 });
        }
      }
      // 归一化写入数据库 (支持 admin / user)
      updateData.role = role === "admin" ? "admin" : role === "super_admin" ? "super_admin" : "user";
    }

    // 更新用户状态与角色
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // 记录高危操作审计日志并持久化
    await writeAuditLog(adminId, "user:update", { targetUserId: userId, updates: updateData }, null, null, request);

    console.log(
      `[更新用户状态/角色] 管理员 ${adminId} 对用户 ${userId} 执行了更新。数据为:`,
      updateData
    );

    return NextResponse.json({
      success: true,
      message: "用户信息已成功更新",
      data: updatedUser
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return NextResponse.json(
      { error: "更新状态失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除用户（归属优先的安全删除，默认软删除，绝不简单物理删除）
// 需要 user:delete 权限。物理删除（被遗忘权）由独立定时任务在 30 天冷静期后执行。
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:delete");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    if (targetUserId === adminId) {
      return NextResponse.json({ error: "不能删除自己" }, { status: 403 });
    }

    // 删除选项：情况 A 的移交 / 归档
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const transferToUserId =
      typeof body.transferToUserId === "string" && body.transferToUserId
        ? body.transferToUserId
        : undefined;
    const archivePersonalData = body.archivePersonalData === true;
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    let result;
    try {
      result = await executeAdminUserDeletion(targetUserId, {
        adminId,
        transferToUserId,
        archivePersonalData,
        reason,
      });
    } catch (execError) {
      const msg = execError instanceof Error ? execError.message : "删除失败";
      await writeAuditLog(
        adminId,
        "user:delete_blocked",
        { targetUserId, reason: msg },
        null,
        null,
        request
      );
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // 记录审计
    await writeAuditLog(
      adminId,
      "user:delete",
      {
        targetUserId,
        case: result.case,
        softDeleted: result.softDeleted,
        transferredWorkspaces: result.transferredWorkspaces,
        archivedWorkspaces: result.archivedWorkspaces,
        reason: reason || null,
      },
      null,
      null,
      request
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "删除用户失败" },
      { status: 500 }
    );
  }
}
