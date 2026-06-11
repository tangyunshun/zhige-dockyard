﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { MEMBERSHIP_QUOTAS, MembershipLevel, UpgradePath } from "@/constants/roles";

/**
 * 工作空间升级 - 个人空间升级为企业空间
 * 升级路径:
 * - MIGRATE: 个人空间直接升级为企业空间
 * - PARALLEL: 创建新的企业空间
 * - REPLACE: 删除原企业空间，创建新的
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { personalWorkspaceId, upgradePath, newEnterpriseName } = body;

    if (!personalWorkspaceId || !upgradePath) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 获取个人空间信息
    const personalWorkspace = await prisma.workspace.findUnique({
      where: { id: personalWorkspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!personalWorkspace || personalWorkspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "个人空间不存在" }, { status: 404 });
    }

    if (personalWorkspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权操作该工作空间" }, { status: 403 });
    }

    // 检查用户会员等级
    const user = authResult.user!;
    const membershipLevel = user.membershipLevel as MembershipLevel;
    const quotas = MEMBERSHIP_QUOTAS[membershipLevel] || MEMBERSHIP_QUOTAS[MembershipLevel.FREE];

    // 统计当前企业空间数量
    const enterpriseCount = await prisma.workspace.count({
      where: {
        type: "ENTERPRISE",
        ownerId: userId,
      },
    });

    // 检查企业空间配额
    if (enterpriseCount >= quotas.enterpriseSlots && quotas.enterpriseSlots !== -1) {
      return NextResponse.json(
        { 
          error: `企业空间数量已达上限（${quotas.enterpriseSlots}个），请升级会员等级`,
          currentLevel: membershipLevel,
          maxEnterprise: quotas.enterpriseSlots,
        },
        { status: 403 }
      );
    }

    // 根据升级路径执行不同操作
    if (upgradePath === "MIGRATE") {
      // 迁移模式：个人空间直接升级为企业空间
      await prisma.workspace.update({
        where: { id: personalWorkspaceId },
        data: {
          type: "ENTERPRISE",
          name: newEnterpriseName || personalWorkspace.name,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "个人空间已升级为企业空间",
        workspaceId: personalWorkspaceId,
      });
    } else if (upgradePath === "PARALLEL") {
      // 并行模式：创建新的企业空间
      const newWorkspace = await prisma.workspace.create({
        data: {
          name: newEnterpriseName || "新企业空间",
          type: "ENTERPRISE",
          ownerId: userId,
          members: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "企业空间创建成功",
        workspaceId: newWorkspace.id,
      });
    } else if (upgradePath === "REPLACE") {
      // 替换模式：删除原企业空间，创建新的
      // 注意：这里需要更复杂的逻辑，暂时不实现
      return NextResponse.json(
        { error: "替换模式暂未实现" },
        { status: 501 }
      );
    }

    return NextResponse.json({ error: "无效的升级路径" }, { status: 400 });
  } catch (error) {
    console.error("Upgrade workspace error:", error);
    return NextResponse.json({ error: "升级失败" }, { status: 500 });
  }
}
