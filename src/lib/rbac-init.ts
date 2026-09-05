/**
 * RBAC 初始化
 * 用于在创建工作空间时初始化默认岗位与权限数据。
 * 基石岗位一律从 platformstandardpost 数据表读取（isWorkspaceDefault=true），
 * 代码中不写死任何岗位名称/描述/图标等数据。
 */

import { prisma } from "./prisma";
import crypto from "crypto";

export async function initializeRBACData(workspaceId: string, createdBy: string) {
  try {
    console.log(`正在为工作空间 ${workspaceId} 初始化 RBAC 数据...`);

    // 1. 从数据库读取基石岗位（仅预置 3 大：空间所有者[系统锁定] / 空间管理员 / 空间审计员）
    //    其余岗位由用户在「添加岗位(系统库)」中按需引入，不默认罗列。
    const allComponents = await prisma.componentcatalog.findMany({
      where: { isPublished: true },
      select: { id: true },
    });

    const foundationPosts = await prisma.platformstandardpost.findMany({
      where: { isWorkspaceDefault: true, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    // 2. 批量创建岗位
    const createdPosts = await Promise.all(
      foundationPosts.map(async (post) => {
        const createdPost = await prisma.workspacepost.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId,
            name: post.name,
            description: post.description || "",
            color: post.color,
            icon: post.icon || "UserRound",
            isDefault: true,
            isSystem: post.isSystemReserved,
            createdBy,
            updatedAt: new Date(),
          },
        });

        console.log(`已创建岗位：${post.name} (${createdPost.id})`);

        // 3. 仅系统保留岗位（空间所有者）默认授予全量组件特权
        if (post.isSystemReserved && allComponents.length > 0) {
          const permissions = allComponents.map((c) => ({
            id: crypto.randomUUID(),
            postId: createdPost.id,
            componentId: c.id,
            canView: true,
            canEdit: false,
            canDelete: false,
            canExecute: true,
            updatedAt: new Date(),
          }));

          await prisma.componentpermission.createMany({
            data: permissions,
          });
          console.log(`已为岗位 ${post.name} 创建 ${permissions.length} 个权限`);
        }

        return createdPost;
      })
    );

    console.log(`RBAC 初始化完成，共创建 ${createdPosts.length} 个岗位`);

    return {
      success: true,
      posts: createdPosts,
    };
  } catch (error) {
    console.error("RBAC 初始化失败:", error);
    throw error;
  }
}
