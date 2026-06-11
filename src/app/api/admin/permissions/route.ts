﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 获取权限配置
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 获取所有岗位及其权限
    const posts = await prisma.workspacepost.findMany({
      where: { workspaceId },
      include: {
        componentpermission: true,
        postmember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    // 构建权限数据结构
    const permissions: Record<string, Record<string, boolean>> = {};
    const postsWithMembers: any[] = [];

    posts.forEach(post => {
      // 构建组件权限
      if (!permissions[post.id]) {
        permissions[post.id] = {};
      }
      
      post.componentpermission.forEach(perm => {
        permissions[post.id][perm.componentId] = perm.canView;
      });

      // 构建岗位成员信息
      postsWithMembers.push({
        id: post.id,
        name: post.name,
        color: post.color,
        description: post.description,
        isDefault: post.isDefault,
        isSystem: post.isSystem,
        members: post.postmember.map(pm => ({
          userId: pm.userId,
          userName: pm.user.name,
          userAvatar: pm.user.avatar,
          assignedAt: pm.assignedAt,
        })),
        componentPermissions: permissions[post.id],
      });
    });

    return NextResponse.json({
      success: true,
      permissions,
      posts: postsWithMembers,
    });
  } catch (error) {
    console.error("Get permissions error:", error);
    return NextResponse.json(
      { error: "获取权限配置失败" },
      { status: 500 }
    );
  }
}

// POST: 保存权限配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, permissions, posts } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 如果提供了岗位数据，先更新岗位
    if (posts) {
      for (const postData of posts) {
        const { id, name, description, color, isDefault, members } = postData;
        
        // 更新岗位信息
        await prisma.workspacepost.update({
          where: { id },
          data: {
            name,
            description,
            color,
            isDefault,
          },
        });

        // 更新岗位成员
        if (members && Array.isArray(members)) {
          // 删除原有成员
          await prisma.postmember.deleteMany({
            where: { postId: id },
          });

          // 添加新成员
          for (const member of members) {
            await prisma.postmember.create({
              data: {
                userId: member.userId,
                postId: id,
                workspaceId,
              },
            });
          }
        }
      }
    }

    // 批量更新组件权限
    if (permissions) {
      const updatePromises = Object.keys(permissions).flatMap((postId) => {
        const componentPermissions = permissions[postId];
        
        return Object.keys(componentPermissions).map(async (componentId) => {
          const canView = componentPermissions[componentId];
          
          // 使用 upsert 确保记录存在
          await prisma.componentpermission.upsert({
            where: {
              postId_componentId: {
                postId,
                componentId,
              },
            },
            update: {
              canView,
              canEdit: canView, // 简化逻辑：能查看就能编辑
              canDelete: false,
              canExecute: canView,
            },
            create: {
              postId,
              componentId,
              canView,
              canEdit: canView,
              canDelete: false,
              canExecute: canView,
            },
          });
        });
      });

      await Promise.all(updatePromises);
    }

    return NextResponse.json({
      success: true,
      message: "权限配置已保存",
    });
  } catch (error) {
    console.error("Save permissions error:", error);
    return NextResponse.json(
      { error: "保存权限配置失败" },
      { status: 500 }
    );
  }
}
