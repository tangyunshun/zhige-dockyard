import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import crypto from "crypto";
import { getMembershipTokenLimit, UNLIMITED_TOKEN, isUnlimitedTokenLimit } from "@/lib/quota-token";
import { grantNewUserGift, recordMembershipBaseGrant } from "@/lib/credit-service";

// 与 /api/workspace/list 自愈创建逻辑保持一致的配额初始化：
// tokenLimit 一律从 membershiplevel 表读取真实值（不再写死 FREE=10000/GOLD=50000/其它=100000），
// membershipLevelId 指向真实会员等级记录。
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
  // tokenLimit 一律从 membershiplevel 表读取真实值，不再写死档位数值
  const tokenLimit = Number(await getMembershipTokenLimit(membershipLevel));

  await prisma.workspacequota.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId,
      membershipLevelId: mlId,
      tokenBalance: BigInt(tokenLimit),
      updatedAt: new Date(),
    },
  });

  // 会员基础额度补记账：quota 已直接写入 tokenLimit，补齐 grant+ledger 保持对账一致
  if (tokenLimit > 0) {
    await recordMembershipBaseGrant({
      workspaceId,
      workspaceName: null,
      workspaceType: "PERSONAL",
      points: tokenLimit,
      idempotencyKey: `MEMBERSHIP_BASE:${workspaceId}`,
      remark: "自愈补建空间配额时的会员基础算力额度",
    }).catch((e) => console.warn("[create-personal] 会员基础额度补记账警告:", e));
  }
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
      } else if (Number(existingQuota.tokenBalance) <= 0 && (user.membershipLevel || "FREE") === "FREE") {
        await prisma.workspacequota.update({
          where: { id: existingQuota.id },
          data: {
            tokenBalance: BigInt(100),
            updatedAt: new Date(),
          },
        });
        console.log("WorkspaceQuota 存量 0 算力自愈赠送 100 点成功");
        // 自愈赠送部分补记账（grant+ledger），保持与「账户实际余额」对账一致
        const topUpPoints = 100 - Number(existingQuota.tokenBalance);
        if (topUpPoints > 0) {
          await recordMembershipBaseGrant({
            workspaceId: existingWorkspace.id,
            workspaceName: existingWorkspace.name,
            workspaceType: "PERSONAL",
            points: topUpPoints,
            idempotencyKey: `MEMBERSHIP_TOPUP:${existingWorkspace.id}:${Date.now()}`,
            remark: "FREE 空间余额为 0 自愈赠送 100 点",
          }).catch((e) => console.warn("[create-personal] 自愈赠送补记账警告:", e));
        }
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

    // 会员基础额度（事务内初始化配额、事务外补记账均需引用，避免作用域断裂）
    const membershipLevelForCreate = user.membershipLevel || "FREE";
    const membershipBaseTokenLimit = await getMembershipTokenLimit(membershipLevelForCreate);

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
      const membershipLevel = membershipLevelForCreate;
      let ml = await tx.membershiplevel.findUnique({
        where: { id: membershipLevel },
      });
      if (!ml) {
        ml = await tx.membershiplevel.findFirst();
      }
      const mlId = ml?.id || "FREE";
      const tierTokenLimit = membershipBaseTokenLimit;
      // 免费赠送 100 算力点统一由 credit-service 以「分桶 + 流水」方式发放（见下方 grantNewUserGift），
      // 此处仅按会员等级初始化基础额度，不再叠加，避免重复赠送。
      const tokenBalance = isUnlimitedTokenLimit(tierTokenLimit)
        ? UNLIMITED_TOKEN
        : tierTokenLimit;

      await tx.workspacequota.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          membershipLevelId: mlId,
          tokenBalance,
          updatedAt: now,
        },
      });

      console.log("WorkspaceQuota 创建成功，tierTokenLimit:", tierTokenLimit);

      // 更新用户的 lastWorkspaceId
      await tx.user.update({
        where: { id: userId },
        data: {
          lastWorkspaceId: workspace.id,
        },
      });

      console.log("个人空间创建完成", workspace.id);
    });

    // 会员基础额度补记账：quota 已直接写入 tokenBalance，补齐 grant+ledger 保持对账一致
    await recordMembershipBaseGrant({
      workspaceId,
      workspaceName,
      workspaceType: "PERSONAL",
      points: Number(membershipBaseTokenLimit),
      idempotencyKey: `MEMBERSHIP_BASE:${workspaceId}`,
      remark: "创建个人空间时的会员基础算力额度",
      createdAt: now,
    }).catch((e) => console.warn("[create-personal] 会员基础额度补记账非致命提示:", e));

    // 新用户赠送 100 算力点：写入个人空间专属分桶（3 个月有效）+ 入账流水（幂等）
    await grantNewUserGift({
      userId,
      workspaceId,
      workspaceName,
      userEmail: user.email || null,
    }).catch((e) => console.warn("[create-personal] 赠送新用户算力点非致命提示:", e));

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
