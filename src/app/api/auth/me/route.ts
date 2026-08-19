import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { VALIDATE_ERROR_TO_SESSION_CODE } from "@/lib/session-constants";
import {
  maybeFinalizeDeletionIfDue,
  getDeletionCooldownDays,
} from "@/lib/account-deletion";

export async function GET(request: NextRequest) {
  try {
    // 统一走 validateUser，确保挤线、强制下线、空闲超时、封禁等校验一致生效，
    // 并把具体失效原因返回给前端用于精准提示。
    const auth = await validateUser(
      request.headers.get("Authorization"),
      request,
    );

    if (!auth.valid || !auth.user) {
      const reason = auth.error || "UNAUTHORIZED";
      const code = VALIDATE_ERROR_TO_SESSION_CODE[reason] || reason;
      const status =
        reason === "ACCOUNT_DISABLED" ||
        reason === "USER_NOT_FOUND" ||
        reason === "MAINTENANCE_MODE"
          ? 403
          : 401;
      return NextResponse.json({ error: reason, code }, { status });
    }

    const userId = auth.user.id;

    // 从数据库获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        status: true,
        deletionRequestedAt: true,
        membershipLevel: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    // 账号状态校验已统一由 validateUser 完成（含封禁/停用/注销），此处不再重复判定

    // D-02：冷静期已过则惰性执行最终注销，账号视为已不存在
    if (user.status === "deleting") {
      const deletionFinalized = await maybeFinalizeDeletionIfDue(userId);
      if (deletionFinalized) {
        console.log(`[Auth Me] 用户 ${userId} 注销冷静期已过，已执行最终注销`);
        return NextResponse.json(
          { error: "USER_NOT_FOUND", code: "USER_NOT_FOUND" },
          { status: 403 },
        );
      }
    }

    // 计算冷静期剩余天数（可配置，默认 7 天）
    // deletionRequestedAt 是冷静期结束日期（申请时间 + 冷静期天数）
    let deletionDaysRemaining = null;
    let deletionCooldownDays: number | null = null;
    if (user.status === "deleting" && user.deletionRequestedAt) {
      deletionCooldownDays = await getDeletionCooldownDays();
      const deletionEndDate = new Date(user.deletionRequestedAt).getTime();
      const now = Date.now();
      const remainingMs = deletionEndDate - now;
      deletionDaysRemaining = Math.max(
        0,
        Math.ceil(remainingMs / (1000 * 60 * 60 * 24)),
      );
      console.log(
        `[Auth Me] 冷静期计算: 结束日期=${new Date(deletionEndDate)}, 剩余=${deletionDaysRemaining}天`,
      );
    }

    const { getAdminPermissions } = require("@/lib/security");
    const permissions = getAdminPermissions(user.id);

    // 密码过期检测：企业安全策略要求每 90 天修改密码
    const PASSWORD_EXPIRY_DAYS = 90;
    let passwordExpired = false;
    if (user.passwordChangedAt) {
      const ageDays =
        (Date.now() - new Date(user.passwordChangedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      passwordExpired = ageDays > PASSWORD_EXPIRY_DAYS;
    }

    // 返回用户信息 - 简单可靠
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        membershipLevel: user.membershipLevel,
        deletionDaysRemaining,
        deletionCooldownDays,
      },
      passwordExpired,
      permissions,
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ error: "认证失败" }, { status: 401 });
  }
}
