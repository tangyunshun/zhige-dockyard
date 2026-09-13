import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { hashPassword } from "@/lib/auth";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = (role || "").toUpperCase().trim();
  if (
    r === "SUPER_ADMIN" ||
    r === "SUPERADMIN" ||
    r === "SUPER_ADMIN_ROLE" ||
    r === "SUPER"
  ) {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// 生成 12 位无歧义字符的临时密码（去除易混淆的 0/O/1/l/I）
function genTempPassword(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// POST: 管理员代用户重置登录密码（需要 user:security_reset 权限）
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:security_reset");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 越权保护：不能重置超级管理员密码
    if (getCleanRole(target.role) === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "权限不足，不能重置平台超级管理员密码" },
        { status: 403 },
      );
    }

    const temp = genTempPassword();
    const hashed = await hashPassword(temp);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, passwordChangedAt: new Date() },
    });

    // 写入操作审计日志，与全局安全闭环吻合
    await writeAuditLog(
      adminId,
      "user:reset_password",
      { targetUserId: userId },
      null,
      null,
      request,
    );

    return NextResponse.json({
      success: true,
      tempPassword: temp,
      message: "密码已重置，请通过安全渠道将临时密码告知用户，并提醒其尽快修改",
    });
  } catch (error) {
    console.error("Reset password API error:", error);
    return NextResponse.json(
      { error: "重置密码失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
