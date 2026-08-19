import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, getAdminPermissions, saveAdminPermissions, writeAuditLog } from "@/lib/security";

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// GET: 获取管理员列表或某个特定管理员的权限 (仅 SuperAdmin 可用)
export async function GET(request: NextRequest) {
  try {
    // 强校验：仅超级管理员有权进入权限配置 API
    const authResult = await requirePlatformPermission(request, "system:settings");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminRole = authResult.user!.role;
    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "越权警告：只有超级管理员允许配置管理员权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // 1. 如果传入了 userId，返回该特定管理员的权限包
    if (userId) {
      const permissions = getAdminPermissions(userId);
      return NextResponse.json({ success: true, data: permissions });
    }

    // 2. 否则，获取所有平台普通管理员和超级管理员，以供列表展示
    let admins = await prisma.user.findMany({
      where: {
        role: {
          in: ["admin", "PLATFORM_ADMIN", "super_admin", "SUPER_ADMIN", "superadmin"]
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });


    const formattedAdmins = admins.map(admin => ({
      ...admin,
      permissions: getAdminPermissions(admin.id),
      isSuper: getCleanRole(admin.role) === "SUPER_ADMIN"
    }));

    return NextResponse.json({ success: true, data: formattedAdmins });
  } catch (error) {
    console.error("Get admin permissions error:", error);
    return NextResponse.json(
      { error: "获取管理员权限包失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// POST: 保存/修改特定普通管理员的权限包 (仅 SuperAdmin 可用)
export async function POST(request: NextRequest) {
  try {
    // 强校验：仅超级管理员有权保存管理员权限
    const authResult = await requirePlatformPermission(request, "system:settings");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const operatorId = authResult.user!.id;
    const adminRole = authResult.user!.role;
    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "越权警告：只有超级管理员允许配置管理员权限" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId, permissions } = body;

    if (!targetUserId || !Array.isArray(permissions)) {
      return NextResponse.json({ error: "缺少必要的 targetUserId 或 permissions 参数" }, { status: 400 });
    }

    // 获取目标管理员信息
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: "目标用户不存在" }, { status: 404 });
    }

    // 安全锁：超级管理员权限为最高系统内置，不允许通过此接口进行削权或修改
    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json({ error: "安全保护：系统超级管理员拥有全量特权，不允许修改其分配策略" }, { status: 403 });
    }

    // 执行保存
    const success = saveAdminPermissions(targetUserId, permissions);
    if (!success) {
      return NextResponse.json({ error: "保存权限包持久化配置文件失败" }, { status: 500 });
    }

    // 记录高危操作审计日志
    await writeAuditLog(operatorId, "system:settings", {
      action: "CONFIGURE_ADMIN_PERMISSIONS",
      targetUserId,
      targetUserName: targetUser.name,
      grantedPermissions: permissions
    }, null, null, request);

    return NextResponse.json({
      success: true,
      message: `管理员 ${targetUser.name} 的权限包已成功更新并落库！`
    });
  } catch (error) {
    console.error("Save admin permissions error:", error);
    return NextResponse.json(
      { error: "保存管理员权限失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
