import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import crypto from "crypto";

// 与 /api/workspace/list 自愈创建逻辑保持一致的配额初始化：
// FREE=10000、GOLD=50000、其余等级=100000，membershipLevelId 指向真实会员等级记录。
async function ensureWorkspaceQuota(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membershipLevel: true },
  });
  const membershipLevel = user?.membershipLevel || "FREE";

  let ml = await prisma.membershiplevel.findUnique({
    where: { id: membershipLevel },
  });
  if (!ml) {
    ml = await prisma.membershiplevel.findFirst();
  }
  const mlId = ml?.id || "FREE";
  const tokenLimit =
    membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;

  await prisma.workspacequota.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId,
      membershipLevelId: mlId,
      tokenBalance: BigInt(tokenLimit),
      updatedAt: new Date(),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // 统一鉴权（与 /api/workspace/list 保持一致）：
    // 优先使用中间件注入并验签过的 x-user-id；缺失时通过 validateUser 校验
    // Authorization Bearer JWT 或 Cookie auth_token JWT（明文 userId 一律拒绝）。
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authResult = await validateUser(
        request.headers.get("authorization"),
        request,
      );
      if (!authResult.valid) {
        return NextResponse.json(
          { message: "未授权" },
          { status: 401 },
        );
      }
      userId = authResult.user!.id;
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        membershipLevel: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 },
      );
    }

    // 检查是否已存在个人空间
    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        ownerId: userId,
        type: "PERSONAL",
      },
    });

    if (existingWorkspace) {
      // 检查是否存在 workspacemember 记录
      const existingMember = await prisma.workspacemember.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: existingWorkspace.id,
          },
        },
      });

      // 如果没有 workspacemember 记录，创建它
      if (!existingMember) {
        console.log("Workspace 存在但 WorkspaceMember 缺失，正在创建 member 记录");
        try {
          await prisma.workspacemember.create({
            data: {
              id: crypto.randomUUID(),
              userId,
              workspaceId: existingWorkspace.id,
              role: "OWNER",
              joinedAt: new Date(),
            },
          });
          console.log("WorkspaceMember 补创建成功");
        } catch (memberError) {
          console.error("补创建 WorkspaceMember 失败:", memberError);
          throw memberError;
        }
      }

      // 自愈：已存在个人空间但没有配额时补创建，禁止"有空间无配额"状态
      const existingQuota = await prisma.workspacequota.findUnique({
        where: { workspaceId: existingWorkspace.id },
      });
      if (!existingQuota) {
        console.log("Workspace 存在但 WorkspaceQuota 缺失，正在补创建配额");
        await ensureWorkspaceQuota(userId, existingWorkspace.id);
        console.log("WorkspaceQuota 补创建成功");
      }

      // 如果已存在个人空间，直接返回
      return NextResponse.json({
        workspace: {
          id: existingWorkspace.id,
          name: existingWorkspace.name,
          type: existingWorkspace.type,
        },
        message: "个人空间已存在",
      });
    }

    // 创建工作空间名称
    const workspaceName = `个人空间 - ${user.name || user.phone || user.email}`;
    const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    console.log("创建个人空间 userId:", userId);

    // 事务化创建：workspace + workspacemember + workspacequota + lastWorkspaceId 原子提交，
    // 任一步失败整体回滚，杜绝"个人空间已创建但没有配额"的脏数据。
    await prisma.$transaction(async (tx) => {
      // 创建 workspace
      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: workspaceName,
          type: "PERSONAL",
          ownerId: userId,
          description: `${user.name || "用户"}的个人工作空间`,
          createdAt: now,
          updatedAt: now,
        },
      });

      console.log("Workspace 创建成功:", workspace.id);

      // 创建 WorkspaceMember 记录
      const memberId = `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await tx.workspacemember.create({
        data: {
          id: memberId,
          userId,
          workspaceId: workspace.id,
          role: "OWNER",
          joinedAt: now,
        },
      });

      console.log("WorkspaceMember 创建成功:", memberId);

      // 同步创建 WorkspaceQuota 配额（与 /api/workspace/list 自愈创建逻辑一致，
      // 按用户 membershipLevel 初始化 tokenBalance）
      const membershipLevel = user.membershipLevel || "FREE";
      let ml = await tx.membershiplevel.findUnique({
        where: { id: membershipLevel },
      });
      if (!ml) {
        ml = await tx.membershiplevel.findFirst();
      }
      const mlId = ml?.id || "FREE";
      const tokenLimit =
        membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;

      await tx.workspacequota.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          membershipLevelId: mlId,
          tokenBalance: BigInt(tokenLimit),
          updatedAt: now,
        },
      });

      console.log("WorkspaceQuota 创建成功，tokenLimit:", tokenLimit);

      // 更新用户的 lastWorkspaceId
      await tx.user.update({
        where: { id: userId },
        data: {
          lastWorkspaceId: workspace.id,
        },
      });

      console.log("个人空间创建完成", workspace.id);
    });

    return NextResponse.json({
      workspace: {
        id: workspaceId,
        name: workspaceName,
        type: "PERSONAL",
      },
    });
  } catch (error) {
    console.error("Create personal workspace error:", error);
    return NextResponse.json(
      { message: "创建个人空间失败" },
      { status: 500 },
    );
  }
}
