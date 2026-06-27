import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 1. GET: 获取工作空间下的所有成员列表
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

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

    return NextResponse.json({
      success: true,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user?.name || "极客成员",
        email: m.user?.email || "未绑定邮箱",
        avatar: m.user?.avatar || null,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error("Get workspace members error:", error);
    return NextResponse.json({ error: "获取成员列表失败" }, { status: 500 });
  }
}

// 2. PATCH: 变更空间内某个成员的角色 (仅 OWNER 有权)
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const body = await request.json();
    const { workspaceId, targetUserId, newRole } = body;

    if (!workspaceId || !targetUserId || !newRole) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 校验请求者必须是该空间的 OWNER
    const currentMembership = await prisma.workspacemember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!currentMembership || currentMembership.role !== "OWNER") {
      return NextResponse.json({ error: "只有空间所有者有权修改角色" }, { status: 403 });
    }

    // 更新角色
    const updatedMember = await prisma.workspacemember.update({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId,
        },
      },
      data: {
        role: newRole,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      member: updatedMember,
    });
  } catch (error) {
    console.error("Update workspace member role error:", error);
    return NextResponse.json({ error: "更新成员角色失败" }, { status: 500 });
  }
}

// 3. DELETE: 将某个成员移出工作空间
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

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

    return NextResponse.json({
      success: true,
      message: "成员已被移出该空间",
    });
  } catch (error) {
    console.error("Delete workspace member error:", error);
    return NextResponse.json({ error: "移出成员失败" }, { status: 500 });
  }
}
