import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 通知受众群组管理接口
 *
 * 设计要点：
 * 1. 系统角色群组（type=system）：角色清单完全来自 user.role 的动态聚合，
 *    不再硬编码固定的三档角色；首次访问会自动为每个真实存在的角色建档。
 * 2. 自定义群组（type=custom）：管理员自由创建，人群完全来自 include 名单。
 * 3. 两类群组都支持成员级增删：
 *      最终推送人群 = (系统群组基础人群 − exclude 名单) ∪ include 名单
 */

// 系统角色群组建档时的默认展示文案（仅默认值，管理员可在后台改名/改描述）
const ROLE_LABELS: Record<string, string> = {
  admin: "管理运营团队",
  creator: "创作者与开发组",
  user: "普通注册会员",
};

const ROLE_DESCS: Record<string, string> = {
  admin: "超级管理员与平台管理员",
  creator: "开发者、创作者及项目经理",
  user: "全站普通社区用户与终端客户",
};

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

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    // 1. 动态聚合出平台内真实存在的全部用户角色
    const roleRows = await prisma.user.groupBy({
      by: ["role"],
      _count: { role: true },
    });
    const roles = roleRows.map((r) => r.role).filter(Boolean);

    // 2. 为每个真实存在的角色自动建立/复用一条系统群组档案
    for (const role of roles) {
      const existing = await prisma.notificationgroup.findFirst({
        where: { type: "system", roleKey: role },
        select: { id: true },
      });
      if (!existing) {
        await prisma.notificationgroup.create({
          data: {
            name: ROLE_LABELS[role] || role,
            type: "system",
            roleKey: role,
            description: ROLE_DESCS[role] || `系统角色（${role}）`,
          },
        });
      }
    }

    // 3. 取出全部群组与其增删名单
    const groups = await prisma.notificationgroup.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    const groupIds = groups.map((g) => g.id);
    const members = groupIds.length
      ? await prisma.notificationgroupmember.findMany({
          where: { groupId: { in: groupIds } },
        })
      : [];

    // 4. 精确计算每个群组的最终覆盖人数
    const result = [];
    for (const g of groups) {
      const gm = members.filter((m) => m.groupId === g.id);
      const excludeIds = gm.filter((m) => m.action === "exclude").map((m) => m.userId);
      const includeIds = gm.filter((m) => m.action === "include").map((m) => m.userId);

      let baseCount = 0;
      let finalCount = 0;

      if (g.type === "system" && g.roleKey) {
        baseCount = await prisma.user.count({
          where: { role: g.roleKey, status: "active" },
        });
        // 基础人群剔除 exclude 后的余量
        const baseAfterExclude = await prisma.user.count({
          where: {
            role: g.roleKey,
            status: "active",
            ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
          },
        });
        // include 名单中原本不属于该角色、需额外追加的人数
        const extraIncluded = includeIds.length
          ? await prisma.user.count({
              where: {
                status: "active",
                id: { in: includeIds },
                role: { not: g.roleKey },
              },
            })
          : 0;
        finalCount = baseAfterExclude + extraIncluded;
      } else {
        finalCount = includeIds.length
          ? await prisma.user.count({
              where: {
                status: "active",
                id: { in: includeIds },
                ...(excludeIds.length ? { NOT: { id: { in: excludeIds } } } : {}),
              },
            })
          : 0;
      }

      result.push({
        id: g.id,
        name: g.name,
        type: g.type,
        roleKey: g.roleKey,
        description: g.description,
        baseCount,
        includeCount: includeIds.length,
        excludeCount: excludeIds.length,
        finalCount,
      });
    }

    return NextResponse.json({ success: true, groups: result, roles });
  } catch (error) {
    console.error("Get notification groups error:", error);
    return NextResponse.json({ error: "获取通知群组列表失败" }, { status: 500 });
  }
}

// 创建自定义群组
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const body = await request.json();
    const name = (body.name || "").trim();
    const description = (body.description || "").trim();

    if (!name) {
      return NextResponse.json({ error: "群组名称不能为空" }, { status: 400 });
    }

    const group = await prisma.notificationgroup.create({
      data: {
        name,
        type: "custom",
        description: description || null,
        createdBy: guard.admin!.id,
      },
    });

    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error("Create notification group error:", error);
    return NextResponse.json({ error: "创建自定义群组失败" }, { status: 500 });
  }
}

/**
 * 更新群组：支持改名/改描述，以及成员级增删
 * body: { groupId, name?, description?, addUserIds?, removeUserIds?, memberAction? }
 *   memberAction: "include"（追加进群组） | "exclude"（从群组剔除），默认 include
 */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const body = await request.json();
    const { groupId, name, description, addUserIds, removeUserIds, memberAction = "include" } = body;

    if (!groupId) {
      return NextResponse.json({ error: "缺少群组 ID" }, { status: 400 });
    }

    const group = await prisma.notificationgroup.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "群组不存在" }, { status: 404 });
    }

    // 更新基础信息
    if (name !== undefined || description !== undefined) {
      await prisma.notificationgroup.update({
        where: { id: groupId },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description.trim() || null } : {}),
        },
      });
    }

    // 移除成员名单项
    if (Array.isArray(removeUserIds) && removeUserIds.length) {
      await prisma.notificationgroupmember.deleteMany({
        where: { groupId, userId: { in: removeUserIds } },
      });
    }

    // 追加成员名单项（已存在的先清理，避免 (groupId,userId) 唯一键冲突导致状态无法切换）
    if (Array.isArray(addUserIds) && addUserIds.length) {
      await prisma.notificationgroupmember.deleteMany({
        where: { groupId, userId: { in: addUserIds } },
      });
      await prisma.notificationgroupmember.createMany({
        data: addUserIds.map((uid: string) => ({
          groupId,
          userId: uid,
          action: memberAction,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update notification group error:", error);
    return NextResponse.json({ error: "更新群组失败" }, { status: 500 });
  }
}

// 删除群组（仅自定义群组可删，系统角色群组随角色存在）
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const groupId = new URL(request.url).searchParams.get("id");
    if (!groupId) {
      return NextResponse.json({ error: "缺少群组 ID" }, { status: 400 });
    }

    const group = await prisma.notificationgroup.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "群组不存在" }, { status: 404 });
    }
    if (group.type === "system") {
      return NextResponse.json({ error: "系统角色群组不可删除" }, { status: 400 });
    }

    await prisma.notificationgroup.delete({ where: { id: groupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete notification group error:", error);
    return NextResponse.json({ error: "删除群组失败" }, { status: 500 });
  }
}
