import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 岗位详情 API
 * PATCH: 更新岗位信息
 * DELETE: 删除岗位
 */

// PATCH: 更新岗位
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
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
    const { name, description, color } = await request.json();

    // 验证必填字段
    if (!name) {
      return NextResponse.json(
        { error: "岗位名称不能为空" },
        { status: 400 }
      );
    }

    // 检查岗位是否存在
    const existingPost = await prisma.workspacepost.findUnique({
      where: { id: postId },
    });

    if (!existingPost) {
      return NextResponse.json(
        { error: "岗位不存在" },
        { status: 404 }
      );
    }

    // 不能修改系统岗位
    if (existingPost.isSystem) {
      return NextResponse.json(
        { error: "系统岗位不可修改" },
        { status: 403 }
      );
    }

    // 更新岗位
    const updatedPost = await prisma.workspacepost.update({
      where: { id: postId },
      data: {
        name,
        description: description || existingPost.description,
        color: color || existingPost.color,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[更新岗位] 管理员 ${adminId} 更新了岗位 ${postId}`
    );

    return NextResponse.json({
      success: true,
      post: {
        id: updatedPost.id,
        name: updatedPost.name,
        description: updatedPost.description,
        color: updatedPost.color,
      },
      message: "岗位已更新",
    });
  } catch (error) {
    console.error("Update post error:", error);
    return NextResponse.json(
      { error: "更新岗位失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除岗位
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

    // 不能删除系统岗位
    if (post.isSystem) {
      return NextResponse.json(
        { error: "系统岗位不可删除" },
        { status: 403 }
      );
    }

    // 检查岗位是否有成员
    const memberCount = await prisma.postmember.count({
      where: { postId },
    });

    if (memberCount > 0) {
      return NextResponse.json(
        { error: "岗位有成员，无法删除。请先移除所有成员。" },
        { status: 400 }
      );
    }

    // 删除岗位（关联的权限记录会级联删除）
    await prisma.workspacepost.delete({
      where: { id: postId },
    });

    console.log(
      `[删除岗位] 管理员 ${adminId} 删除了岗位 ${postId}`
    );

    return NextResponse.json({
      success: true,
      message: "岗位已删除",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json(
      { error: "删除岗位失败" },
      { status: 500 }
    );
  }
}
