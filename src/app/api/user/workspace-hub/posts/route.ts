import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { hasPermission, PermissionAction, ResourceType, EnterpriseRole } from "@/constants/roles";

/**
 * 获取岗位列表
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const userRole = workspace.workspacemember[0]?.role || "MEMBER";
    
    // 验证权限
    if (!hasPermission(userRole as string, ResourceType.WORKSPACE, PermissionAction.VIEW)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 获取所有岗位
    let posts = await prisma.workspacepost.findMany({
      where: { workspaceId },
      include: {
        postmember: {
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
        },
        componentpermission: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 若当前企业空间刚刚创建或岗位库为空，按业务规范默认自动匹配初始化 3 大基石岗位
    if (posts.length === 0) {
      const allComponents = await prisma.componentcatalog.findMany({
        where: { isPublished: true },
        select: { id: true },
      });

      // 基石岗位从 platformstandardpost 数据表读取（isWorkspaceDefault=true，
      // 含系统保留的空间所有者），代码中不写死任何岗位数据
      const foundationPosts = await prisma.platformstandardpost.findMany({
        where: { isWorkspaceDefault: true, status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
      });

      for (const item of foundationPosts) {
        const createdPost = await prisma.workspacepost.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId,
            name: item.name,
            description: item.description || "",
            color: item.color,
            icon: item.icon || "UserRound",
            isDefault: true,
            isSystem: item.isSystemReserved,
            createdBy: userId,
            updatedAt: new Date(),
          },
        });

        // 系统保留岗位（空间所有者）默认赋予全量组件特权
        if (createdPost.isSystem && allComponents.length > 0) {
          const fullPerms = allComponents.map(c => ({
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
            data: fullPerms,
          });
        }
      }

      // 重新读取已初始化的数据库岗位
      posts = await prisma.workspacepost.findMany({
        where: { workspaceId },
        include: {
          postmember: {
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
          },
          componentpermission: true,
        },
        orderBy: { createdAt: "asc" },
      });
    }

    // 构建权限映射
    const permissions: Record<string, Record<string, any>> = {};
    
    posts.forEach(post => {
      permissions[post.id] = {};
      post.componentpermission.forEach(perm => {
        permissions[post.id][perm.componentId] = {
          canView: perm.canView,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
          canExecute: perm.canExecute,
        };
      });
    });

    // 业务硬性保底：空间所有者稳居第 1 位、空间管理员稳居第 2 位，其余岗位按各自顺序排列
    const ownerPost = posts.find(p => p.isSystem || p.name === "空间所有者");
    const adminPost = posts.find(p => p.id !== ownerPost?.id && (p.name === "空间管理员" || p.name.includes("管理员")));
    const otherPosts = posts.filter(p => p.id !== ownerPost?.id && p.id !== adminPost?.id);

    const sortedPosts = [
      ...(ownerPost ? [ownerPost] : []),
      ...(adminPost ? [adminPost] : []),
      ...otherPosts,
    ];

    return NextResponse.json({
      success: true,
      data: {
        posts: sortedPosts.map(post => ({
          id: post.id,
          workspaceId: post.workspaceId,
          name: post.name,
          description: post.description,
          color: post.color,
          icon: post.icon,
          isDefault: post.isDefault,
          isSystem: post.isSystem,
          createdBy: post.createdBy,
          members: post.postmember.map(pm => ({
            id: pm.id,
            userId: pm.userId,
            postId: pm.postId,
            workspaceId: pm.workspaceId,
            assignedAt: pm.assignedAt,
            user: pm.user,
          })),
          permissionCount: post.componentpermission.length,
        })),
        // 组件目录从数据库读取（component_catalog 表为唯一数据源）
        components: await prisma.componentcatalog.findMany({
          where: { isPublished: true },
          orderBy: { sortOrder: "asc" },
        }),
        permissions,
      },
    });
  } catch (error) {
    console.error("获取岗位列表错误:", error);
    return NextResponse.json(
      { error: "获取岗位列表失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * 创建岗位
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "未找到用户" }, { status: 401 });
    }

    const userId = authResult.user.id;

    const body = await request.json();
    const { workspaceId, name, code, description, color, icon, templatePermissions, syncToSystem, items } = body;

    const isBatch = Array.isArray(items) && items.length > 0;

    if (!workspaceId || (!name && !isBatch)) {
      return NextResponse.json({ error: "缺少工作空间 ID 或岗位名称" }, { status: 400 });
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const userRole = workspace.workspacemember[0]?.role || "MEMBER";
    
    // 验证权限
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 批量模式引入官方岗位
    if (isBatch) {
      const existingPosts = await prisma.workspacepost.findMany({
        where: { workspaceId },
        select: { name: true },
      });
      const existingNames = new Set(existingPosts.map((p) => p.name));
      const validItems = items.filter((it: any) => it && it.name && !existingNames.has(it.name));

      if (validItems.length === 0) {
        return NextResponse.json({ error: "所选岗位在当前空间均已存在，无需重复引入" }, { status: 400 });
      }

      const createdList = await prisma.$transaction(
        validItems.map((it: any) =>
          prisma.workspacepost.create({
            data: {
              id: crypto.randomUUID(),
              workspaceId,
              name: it.name,
              description: it.description || null,
              color: it.color || "#3182ce",
              icon: it.icon && /^[A-Z][A-Za-z0-9]*$/.test(it.icon) ? it.icon : "UserRound",
              createdBy: userId,
              updatedAt: new Date(),
            },
          })
        )
      );

      return NextResponse.json({
        success: true,
        data: {
          count: createdList.length,
          posts: createdList,
        },
        message: `成功引入 ${createdList.length} 个岗位`,
      });
    }

    // 检查岗位名称是否已存在（单岗位模式）
    const existingPost = await prisma.workspacepost.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name,
        },
      },
    });

    if (existingPost) {
      return NextResponse.json({ error: "岗位名称已存在" }, { status: 400 });
    }

    // 创建岗位
    const post = await prisma.workspacepost.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        description: description || null,
        color: color || "#3182ce",
        icon: icon && /^[A-Z][A-Za-z0-9]*$/.test(icon) ? icon : "UserRound",
        createdBy: userId,
        updatedAt: new Date(),
      },
    });

    // 若用户勾选同意同步至系统岗位集合，则提报至超级管理员后台审核池
    let submissionResult = null;
    if (syncToSystem) {
      const { submitWorkspacePostToPlatform } = await import("@/lib/workspace-post-submissions");
      submissionResult = await submitWorkspacePostToPlatform({
        workspacePostId: post.id,
        name: post.name,
        code: code || `POST_${Date.now()}`,
        description: description || "",
        color: color || "#3182ce",
        icon: post.icon || "UserRound",
        workspaceId: workspace.id,
        workspaceName: workspace.name || "未命名空间",
        submittedByUserId: userId,
        submittedByUserName: authResult.user.name || authResult.user.email || "空间管理员",
      });
    }

    // 创建默认权限
    if (templatePermissions && Object.keys(templatePermissions).length > 0) {
      const permissionsToCreate = Object.entries(templatePermissions)
        .filter(([_, value]) => value === true)
        .map(([componentId]) => ({
          id: crypto.randomUUID(),
          postId: post.id,
          componentId,
          canView: true,
          canEdit: false,
          canDelete: false,
          canExecute: true,
          updatedAt: new Date(),
        }));

      if (permissionsToCreate.length > 0) {
        await prisma.componentpermission.createMany({
          data: permissionsToCreate,
        });
      }
    }

    const responseData = {
      success: true,
      data: {
        id: post.id,
        name: post.name,
        description: post.description,
        color: post.color,
        syncToSystem: Boolean(syncToSystem),
        submission: submissionResult,
      },
      message: syncToSystem
        ? "岗位创建成功，并已同步提报至系统官方岗位库等待审核"
        : "岗位创建成功（仅在当前企业空间内部生效）",
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("创建岗位错误:", error);
    return NextResponse.json(
      { error: "创建岗位失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/**
 * 批量更新空间岗位权限矩阵
 * 真实入库：写入 componentpermission 数据库表，彻底告别模拟延时
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;
    const body = await request.json();
    const { workspaceId, permissionMatrix, orderedPostIds } = body;

    if (!workspaceId || (!permissionMatrix && !orderedPostIds)) {
      return NextResponse.json({ error: "缺少工作空间 ID 或配置数据" }, { status: 400 });
    }

    // 验证操作权限（OWNER 或 ADMIN）
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const userRole = workspace.workspacemember[0]?.role || "MEMBER";
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "无权配置空间权限矩阵，需要管理员权限" }, { status: 403 });
    }

    // 1. 如果传入了岗位排序列表 orderedPostIds，执行排序持久化
    if (Array.isArray(orderedPostIds) && orderedPostIds.length > 0) {
      const allWorkspacePosts = await prisma.workspacepost.findMany({
        where: { workspaceId },
        select: { id: true, name: true, isSystem: true },
      });
      const ownerPost = allWorkspacePosts.find((p) => p.isSystem || p.name === "空间所有者");
      const adminPost = allWorkspacePosts.find(
        (p) => p.id !== ownerPost?.id && (p.name === "空间管理员" || p.name.includes("管理员"))
      );

      // 固定岗位排前二，其余岗位按传入顺序
      const fixedIds = new Set([ownerPost?.id, adminPost?.id].filter(Boolean));
      const validOrderedIds = orderedPostIds.filter(
        (id: string) => !fixedIds.has(id) && allWorkspacePosts.some((p) => p.id === id)
      );
      const remainingIds = allWorkspacePosts
        .map((p) => p.id)
        .filter((id) => !fixedIds.has(id) && !validOrderedIds.includes(id));

      const finalSequence = [
        ...(ownerPost ? [ownerPost.id] : []),
        ...(adminPost ? [adminPost.id] : []),
        ...validOrderedIds,
        ...remainingIds,
      ];

      const baseTime = new Date("2024-01-01T00:00:00.000Z").getTime();
      await prisma.$transaction(
        finalSequence.map((id, index) =>
          prisma.workspacepost.update({
            where: { id },
            data: {
              createdAt: new Date(baseTime + index * 60000),
            },
          })
        )
      );

      if (!permissionMatrix) {
        return NextResponse.json({
          success: true,
          message: "岗位排序已成功保存至数据库",
          orderedCount: finalSequence.length,
        });
      }
    }

    // permissionMatrix 结构：Record<string, string[]> 即 postId -> componentId[]
    const postIds = Object.keys(permissionMatrix);

    // 确保这些 post 确实属于该 workspace
    const validPosts = await prisma.workspacepost.findMany({
      where: { workspaceId, id: { in: postIds } },
      select: { id: true },
    });
    const validPostIdSet = new Set(validPosts.map(p => p.id));

    let updatedCount = 0;

    for (const postId of postIds) {
      if (!validPostIdSet.has(postId)) continue;
      const componentIds: string[] = permissionMatrix[postId] || [];

      // 清除旧的 componentpermission
      await prisma.componentpermission.deleteMany({
        where: { postId },
      });

      // 批量插入新的勾选权限
      if (componentIds.length > 0) {
        const createData = componentIds.map(componentId => ({
          id: crypto.randomUUID(),
          postId,
          componentId,
          canView: true,
          canEdit: false,
          canDelete: false,
          canExecute: true,
          updatedAt: new Date(),
        }));

        await prisma.componentpermission.createMany({
          data: createData,
        });
      }
      updatedCount += componentIds.length;
    }

    return NextResponse.json({
      success: true,
      message: `权限矩阵已成功持久化至数据库（共保存 ${updatedCount} 项组件授权）`,
      updatedPostCount: validPosts.length,
    });
  } catch (error: any) {
    console.error("更新权限矩阵错误:", error);
    return NextResponse.json(
      { error: "保存权限矩阵失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
// ZhiGe Dockyard Custom Post & Permissions API synced successfully
