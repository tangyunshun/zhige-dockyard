import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 岗位成员管理 API
 * POST: 分配成员到岗位
 * DELETE: 从岗位移除成员
 */

// POST: 分配成员到岗位
export async function POST(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { postId } = await params;
    const { userIds, workspaceId } = await request.json();

    // 验证必填字段
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "缺少用户 ID 列表" },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 检查岗位是否存在
    const post = await prisma.workspacepost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json(
        { error: "岗位不存在" },
        { status: 404 }
      );
    }

    // 检查岗位是否属于该工作空间
    if (post.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "岗位不属于该工作空间" },
        { status: 400 }
      );
    }

    // 批量分配成员
    const createData = userIds.map((userId) => ({
      id: crypto.randomUUID(),
      postId,
      userId,
      workspaceId,
    }));

    await prisma.postmember.createMany({
      data: createData,
      skipDuplicates: true,
    });

    console.log(
      `[分配成员] 管理员 ${adminId} 将 ${userIds.length} 个用户分配到岗位 ${postId}`
    );

    return NextResponse.json({
      success: true,
      message: `已成功分配 ${userIds.length} 个成员`,
    });
  } catch (error) {
    console.error("Assign members error:", error);
    return NextResponse.json(
      { error: "分配成员失败" },
      { status: 500 }
    );
  }
}

// DELETE: 从岗位移除成员
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { postId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "缺少用户 ID" },
        { status: 400 }
      );
    }

    // 检查岗位是否存在
    const post = await prisma.workspacepost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json(
        { error: "岗位不存在" },
        { status: 404 }
      );
    }

    // 删除成员
    await prisma.postmember.deleteMany({
      where: {
        postId,
        userId,
      },
    });

    console.log(
      `[移除成员] 管理员 ${adminId} 从岗位 ${postId} 移除了用户 ${userId}`
    );

    return NextResponse.json({
      success: true,
      message: "成员已移除",
    });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "移除成员失败" },
      { status: 500 }
    );
  }
}
