import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 群组成员明细接口：供管理端「成员管理」弹窗展示与增删
 * GET /api/admin/notification-groups/members?groupId=xxx
 * 返回：
 *   members  —— 当前最终会收到推送的成员（source: base=角色基础人群 / include=额外追加）
 *   excluded —— 被单独剔除的成员（可撤销剔除）
 */

async function requireAdmin(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !isAdminRole(user.role)) {
    return { error: NextResponse.json({ error: "权限不足" }, { status: 403 }) };
  }
  return { admin: user };
}

const MAX_MEMBERS = 200;

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
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

    return NextResponse.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        type: group.type,
        roleKey: group.roleKey,
        description: group.description,
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
