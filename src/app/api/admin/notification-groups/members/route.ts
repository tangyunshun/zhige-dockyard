import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

/**
 * 群组成员明细接口：供管理端「成员管理」弹窗展示与增删
 * GET /api/admin/notification-groups/members?groupId=xxx
 * 返回：
 *   members  —— 当前最终会收到推送的成员（source: base=角色基础人群 / include=额外追加）
 *   excluded —— 被单独剔除的成员（可撤销剔除）
 */

async function requireAdmin(request: NextRequest, permissionKey: string = "announcement:read") {
  const authCheck = await requirePlatformPermission(request, permissionKey);
  if (!authCheck.authorized || !authCheck.user) {
    return { error: authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 }) };
  }
  return { admin: authCheck.user };
}

const MAX_MEMBERS = 200;

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request, "announcement:read");
    if (guard.error) return guard.error;

    const groupId = new URL(request.url).searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "缺少群组 ID" }, { status: 400 });
    }

    const group = await prisma.notificationgroup.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "群组不存在" }, { status: 404 });
    }

    const gm = await prisma.notificationgroupmember.findMany({ where: { groupId } });
    const excludeIds = gm.filter((m) => m.action === "exclude").map((m) => m.userId);
    const includeIds = gm.filter((m) => m.action === "include").map((m) => m.userId);

    let members: Array<{ id: string; name: string | null; email: string | null; role: string; source: string }> = [];
    let total = 0;

    if (group.type === "system" && group.roleKey) {
      // 角色基础人群（剔除 exclude 名单后）
      const baseUsers = await prisma.user.findMany({
        where: {
          role: group.roleKey,
          status: "active",
          ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { createdAt: "desc" },
        take: MAX_MEMBERS,
      });
      total = await prisma.user.count({
        where: {
          role: group.roleKey,
          status: "active",
          ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
        },
      });

      // 额外追加进来的成员（原本不属于该角色）
      const extraUsers = includeIds.length
        ? await prisma.user.findMany({
            where: { status: "active", id: { in: includeIds }, role: { not: group.roleKey } },
            select: { id: true, name: true, email: true, role: true },
          })
        : [];

      members = [
        ...baseUsers.map((u) => ({ ...u, source: "base" })),
        ...extraUsers.map((u) => ({ ...u, source: "include" })),
      ];
      total += extraUsers.length;
    } else {
      // 自定义群组：人群 = include 名单 − exclude 名单
      const incUsers = includeIds.length
        ? await prisma.user.findMany({
            where: {
              status: "active",
              id: { in: includeIds },
              ...(excludeIds.length ? { NOT: { id: { in: excludeIds } } } : {}),
            },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { createdAt: "desc" },
            take: MAX_MEMBERS,
          })
        : [];
      members = incUsers.map((u) => ({ ...u, source: "include" }));
      total = incUsers.length;
    }

    // 被单独剔除的成员明细（用于界面撤销剔除）
    const excluded = excludeIds.length
      ? await prisma.user.findMany({
          where: { id: { in: excludeIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];

    const roleNameMap: Record<string, string> = {
      "super-admin": "超级管理员团队",
      superadmin: "超级管理员团队",
      super_admin: "超级管理员团队",
      SUPER_ADMIN: "超级管理员团队",
      admin: "平台管理员组",
      ADMIN: "平台管理员组",
      creator: "创作者与开发组",
      CREATOR: "创作者与开发组",
      user: "普通注册用户群",
      USER: "普通注册用户群",
    };

    const isSystem = group.type === "system" && group.roleKey;
    const displayName = isSystem ? (roleNameMap[group.roleKey!] || `${group.roleKey} 角色组`) : group.name;
    const displayDesc = isSystem
      ? (group.description && !group.description.includes(group.roleKey!)
          ? group.description
          : `系统内置角色群体（${displayName}）`)
      : group.description || "自定义受众群组";

    return NextResponse.json({
      success: true,
      group: {
        id: group.id,
        name: displayName,
        type: group.type,
        roleKey: group.roleKey,
        description: displayDesc,
      },
      members,
      excluded,
      total,
    });
  } catch (error) {
    console.error("Get notification group members error:", error);
    return NextResponse.json({ error: "获取群组成员失败" }, { status: 500 });
  }
}
