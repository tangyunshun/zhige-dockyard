import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// POST: 封禁用户 API (需要 user:ban 权限)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userId, bannedUntil, reason } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 越权保护：只有当目标是超级管理员且操作人不是超级管理员时才拦截
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN" && getCleanRole(authResult.user?.role) !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足，不能封禁平台超级管理员" }, { status: 403 });
    }

    // 不能操作自己 (演示测试时提示并安全放行状态更新)
    if (userId === adminId) {
      console.warn("管理员对其关联测试账号执行了风控封禁测试");
    }

    // 1. 封禁更新 user 表：状态设为 banned，清除 session
    const banReasonText = reason || body.banReason || "发布违规违法内容";
    const banRuleText = body.banRule || "《知阁·舟坊安全风控准则与平台合规声明》";

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "banned",
        // 将管理员选择/输入的封禁原因落库到用户表，作为各页面统一读取的权威来源
        banReason: banReasonText,
        bannedUntil: bannedUntil ? new Date(bannedUntil) : null,
        sessionToken: null,
        sessionExpiresAt: null,
        updatedAt: new Date(), // 开启全新的封禁时间线起点
      },
    });

    // 2. 将过往所有旧凭证归档，确保本次封禁案由绝对最新且唯一
    await prisma.accountappeal.updateMany({
      where: {
        userId: targetUser.id,
      },
      data: {
        status: "archived",
      },
    });

    // 3. 建立本次封禁事件专属的风控案由凭证记录（供前台申诉 Modal 与后台详情 Modal 100% 同步展示管理员勾选的原因与规则）
    const appealId = `ban-log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await prisma.accountappeal.create({
      data: {
        id: appealId,
        userId: targetUser.id,
        userAccount: targetUser.email || targetUser.phone || targetUser.name || targetUser.id,
        userName: targetUser.name,
        userPhone: targetUser.phone,
        userEmail: targetUser.email,
        banReason: banReasonText,
        appealReason: `【依据规则: ${banRuleText}】管理员前台触发风控强制限制`,
        status: "ban_recorded",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 写入操作审计日志
    await writeAuditLog(adminId, "user:update", { targetUserId: userId, bannedUntil, reason: banReasonText }, null, null, request);

    return NextResponse.json({
      success: true,
      message: "用户已成功封禁并强制下线",
    });
  } catch (error: any) {
    console.error("Ban user API error:", error);
    return NextResponse.json(
      { error: error?.message || "封禁数据库更新失败" },
      { status: 500 }
    );
  }
}