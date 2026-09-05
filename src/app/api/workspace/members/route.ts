import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import crypto from "crypto";

// 1. GET: 获取工作空间下的所有成员列表
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 校验请求用户是否是该空间的成员
    const currentMembership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!currentMembership) {
      return NextResponse.json({ error: "无权访问此空间成员列表" }, { status: 403 });
    }

    // 查询该空间下的所有成员，并关联查询用户信息
    const members = await prisma.workspacemember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    // 1.2 物理清理该空间下过期时间超过一月（30天）的废弃邀请码
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await prisma.workspaceinvitation.deleteMany({
      where: {
        workspaceId,
        expiresAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    // 1.3 查询该空间下的所有邀请码记录（包括过期/未过期的全量数据以供中枢与控制台统一）
    let activeInvitations: any[] = [];
    if (currentMembership.role === "OWNER" || currentMembership.role === "ADMIN") {
      const invitations = await prisma.workspaceinvitation.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
      });

      // 查询该空间的加入成员操作日志以计算加入人数
      const joinLogs = await prisma.operationlog.findMany({
        where: {
          workspaceId,
          action: "JOIN_WORKSPACE",
        },
      });

      const codeCounts: Record<string, number> = {};
      joinLogs.forEach((log) => {
        const details = log.details as any;
        if (details && typeof details === "object" && details.invitationCode) {
          const code = details.invitationCode;
          codeCounts[code] = (codeCounts[code] || 0) + 1;
        }
      });

      activeInvitations = invitations.map((inv) => ({
        id: inv.id,
        code: inv.code,
        email: inv.email || null,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        role: inv.role,
        status: inv.status,
        joinedCount: codeCounts[inv.code] || 0,
      }));
    }

    // 查询该空间下的扩展岗位变更日志，以实现多账号协同服务端全局共享
    const roleLogs = await prisma.operationlog.findMany({
      where: {
        workspaceId,
        action: "UPDATE_MEMBER_ROLE",
      },
      orderBy: { createdAt: "asc" },
    });

    const extendedRoleMap: Record<string, string[]> = {};
    roleLogs.forEach((log) => {
      const details = log.details as any;
      if (details && typeof details === "object" && details.targetUserId) {
        if (Array.isArray(details.roles) && details.roles.length > 0) {
          extendedRoleMap[details.targetUserId] = details.roles;
        } else if (typeof details.newRole === "string" && details.newRole.trim()) {
          extendedRoleMap[details.targetUserId] = details.newRole
            .split(",")
            .map((r: string) => r.trim())
            .filter(Boolean);
        }
      }
    });

    return NextResponse.json({
      success: true,
      members: members.map((m) => {
        const assignedRoles = extendedRoleMap[m.userId] && extendedRoleMap[m.userId].length > 0
          ? extendedRoleMap[m.userId]
          : [m.role];
        return {
          userId: m.userId,
          name: m.user?.name || "极客成员",
          email: m.user?.email || "未绑定邮箱",
          avatar: m.user?.avatar || null,
          role: assignedRoles[0] || m.role,
          roles: assignedRoles,
          joinedAt: m.joinedAt,
        };
      }),
      activeInvitations,
    });
  } catch (error) {
    console.error("Get workspace members error:", error);
    return NextResponse.json({ error: "获取成员列表失败" }, { status: 500 });
  }
}

// 2. PATCH: 变更空间内某个成员的角色与多兼任岗位 (仅 OWNER 有权)
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, targetUserId, newRole, newRoles } = body;

    const rolesArray: string[] = Array.isArray(newRoles)
      ? newRoles
      : typeof newRole === "string"
      ? newRole.split(",").map((r: string) => r.trim()).filter(Boolean)
      : [];

    if (!workspaceId || !targetUserId || rolesArray.length === 0) {
      return NextResponse.json({ error: "缺少必要参数或未指定分配岗位" }, { status: 400 });
    }

    // 校验请求者必须是该空间的 OWNER 或 空间创建者
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true }
    });

    const currentMembership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    const isSpaceOwner = workspace?.ownerId === userId;
    const isOwnerRole = (currentMembership?.role || "").toUpperCase() === "OWNER";

    if (!isSpaceOwner && !isOwnerRole) {
      return NextResponse.json({ error: "只有空间所有者有权修改角色与岗位" }, { status: 403 });
    }

    // 安全映射：提取最高级别合法枚举 (OWNER | ADMIN | MEMBER)
    const validDbRole: "OWNER" | "ADMIN" | "MEMBER" =
      rolesArray.includes("OWNER") ? "OWNER" :
      rolesArray.includes("ADMIN") ? "ADMIN" : "MEMBER";

    // 更新角色（采用 upsert 容错，防止记录不存在时更新抛错）
    const updatedMember = await prisma.workspacemember.upsert({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId,
        },
      },
      update: {
        role: validDbRole,
      },
      create: {
        id: `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: targetUserId,
        workspaceId,
        role: validDbRole,
      },
    });

    // 写入扩展岗位操作日志（同时记录 roles 数组与 newRole 字符串，供全局共享）
    await prisma.operationlog.create({
      data: {
        id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        workspaceId,
        userId,
        action: "UPDATE_MEMBER_ROLE",
        resource: targetUserId,
        details: { targetUserId, newRole: rolesArray.join(","), roles: rolesArray },
      },
    }).catch((e) => console.error("Write member role log error:", e));

    // 同步维护 postmember 关联表，形成底层关系数据强一致闭环
    try {
      const workspacePosts = await prisma.workspacepost.findMany({
        where: { workspaceId },
        select: { id: true, name: true }
      });
      const validPostIds = new Set<string>();
      workspacePosts.forEach(wp => {
        if (rolesArray.includes(wp.id) || rolesArray.includes(wp.name)) {
          validPostIds.add(wp.id);
        }
      });
      if (validPostIds.size > 0) {
        await prisma.postmember.deleteMany({
          where: { workspaceId, userId: targetUserId }
        });
        await prisma.postmember.createMany({
          data: Array.from(validPostIds).map(postId => ({
            id: `pm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userId: targetUserId,
            postId,
            workspaceId,
          }))
        });
      }
    } catch (e) {
      console.warn("Sync postmember error:", e);
    }

    return NextResponse.json({
      success: true,
      member: {
        id: updatedMember.id,
        userId: updatedMember.userId,
        workspaceId: updatedMember.workspaceId,
        role: rolesArray[0] || validDbRole,
        roles: rolesArray,
        monthlyTokenLimit: updatedMember.monthlyTokenLimit !== null && updatedMember.monthlyTokenLimit !== undefined ? Number(updatedMember.monthlyTokenLimit) : null,
        monthlyTokenUsed: Number(updatedMember.monthlyTokenUsed || 0),
      },
    });
  } catch (error: any) {
    console.error("Update workspace member role error:", error);
    return NextResponse.json({ error: error?.message || "更新成员角色失败" }, { status: 500 });
  }
}

// 3. DELETE: 将某个成员移出工作空间
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const targetUserId = searchParams.get("targetUserId");

    if (!workspaceId || !targetUserId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 校验请求者的角色
    const currentMembership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!currentMembership || (currentMembership.role !== "OWNER" && currentMembership.role !== "ADMIN")) {
      return NextResponse.json({ error: "无权移出成员" }, { status: 403 });
    }

    // 查询目标成员的角色
    const targetMembership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId,
        },
      },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "该用户不是空间成员" }, { status: 404 });
    }

    // 所有者不能删除自己，管理员不能删除所有者，普通管理员不能删除另一个管理员
    if (targetMembership.role === "OWNER") {
      return NextResponse.json({ error: "不能移出空间所有者" }, { status: 403 });
    }

    if (currentMembership.role === "ADMIN" && targetMembership.role === "ADMIN") {
      return NextResponse.json({ error: "普通管理员无权移出其他管理员" }, { status: 403 });
    }

    // 物理移除该空间成员
    await prisma.workspacemember.delete({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId,
        },
      },
    });

    // 记录踢出审计日志
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId: userId,
        workspaceId,
        action: "WORKSPACE_KICK",
        resource: "workspace/member",
        details: JSON.stringify({ kickedUserId: targetUserId }),
      }
    });

    return NextResponse.json({
      success: true,
      message: "成员已被移出该空间",
    });
  } catch (error) {
    console.error("Delete workspace member error:", error);
    return NextResponse.json({ error: "移出成员失败" }, { status: 500 });
  }
}
