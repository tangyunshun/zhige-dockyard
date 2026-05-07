/**
 * RBAC 初始化脚本
 * 用于在创建工作空间时初始化默认的岗位和权限数据
 */

import prisma from "./prisma";
import { COMPONENTS } from "@/constants/components";
import { POST_PERMISSION_TEMPLATES } from "@/constants/roles";

export async function initializeRBACData(workspaceId: string, createdBy: string) {
  try {
    console.log(`正在为工作空间 ${workspaceId} 初始化 RBAC 数据...`);

    // 1. 创建默认岗位
    const defaultPosts = [
      {
        name: "系统管理员",
        description: "拥有所有权限，负责系统管理和维护",
        color: "#3182ce",
        isDefault: true,
        isSystem: true,
        template: null as Record<string, boolean> | null,
      },
      {
        name: "销售专家",
        description: "负责客户管理、销售流程管理和客户关系维护",
        color: "#10b981",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.SALES_EXPERT,
      },
      {
        name: "质量管理员",
        description: "负责质量检查、质量管理和质量报告生成",
        color: "#f59e0b",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.QA_MANAGER,
      },
      {
        name: "技术负责人",
        description: "负责技术决策、代码审查和技术团队管理",
        color: "#8b5cf6",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.TECH_LEAD,
      },
      {
        name: "产品经理",
        description: "负责产品规划、需求分析和产品生命周期管理",
        color: "#ec4899",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.PRODUCT_MANAGER,
      },
      {
        name: "运维工程师",
        description: "负责系统部署、监控和维护 CI/CD 流程",
        color: "#06b6d4",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.DEVOPS_ENGINEER,
      },
      {
        name: "安全专家",
        description: "负责安全审计、安全策略制定和漏洞管理",
        color: "#ef4444",
        isDefault: true,
        isSystem: true,
        template: POST_PERMISSION_TEMPLATES.SECURITY_EXPERT,
      },
    ];

    // 2. 批量创建岗位
    const createdPosts = await Promise.all(
      defaultPosts.map(async (post) => {
        const createdPost = await prisma.workspacepost.create({
          data: {
            workspaceId,
            name: post.name,
            description: post.description,
            color: post.color,
            isDefault: post.isDefault,
            isSystem: post.isSystem,
            createdBy,
          },
        });

        console.log(`已创建岗位：${post.name} (${createdPost.id})`);

        // 3. 为每个岗位创建默认权限
        if (post.template) {
          const permissions = Object.entries(post.template)
            .filter(([_, value]) => value === true)
            .map(([componentId]) => ({
              postId: createdPost.id,
              componentId,
              canView: true,
              canEdit: false,
              canDelete: false,
              canExecute: true,
            }));

          if (permissions.length > 0) {
            await prisma.componentpermission.createMany({
              data: permissions,
            });
            console.log(`已为岗位 ${post.name} 创建 ${permissions.length} 个权限`);
          }
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
