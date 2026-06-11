﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { MEMBERSHIP_QUOTAS, MembershipLevel } from "@/constants/roles";

/**
 * 创建工作空间
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
    const { name, type, description, industry, contactEmail, contactPhone } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 验证工作空间类型
    if (type !== "PERSONAL" && type !== "ENTERPRISE") {
      return NextResponse.json({ error: "无效的工作空间类型" }, { status: 400 });
    }

    // 创建企业空间需要检查会员等级配额
    if (type === "ENTERPRISE") {
      const user = authResult.user!;
      const membershipLevel = user.membershipLevel as MembershipLevel;
      const quotas = MEMBERSHIP_QUOTAS[membershipLevel] || MEMBERSHIP_QUOTAS[MembershipLevel.FREE];

      // 统计企业空间数量
      const enterpriseCount = await prisma.workspace.count({
        where: {
          type: "ENTERPRISE",
          OR: [
            { ownerId: userId },
            {
              workspacemember: {
                some: { userId },
              },
            },
          ],
        },
      });

      if (enterpriseCount >= quotas.enterpriseSlots && quotas.enterpriseSlots !== -1) {
        return NextResponse.json(
          { error: "企业空间数量已达上限，请升级会员等级" },
          { status: 403 }
        );
      }
    }

    // 创建工作空间
    const workspace = await prisma.workspace.create({
      data: {
        name,
        type,
        description: description || null,
        industry: industry || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        members: true,
      },
    });

    return NextResponse.json({
      success: true,
      workspace,
      message: "工作空间创建成功",
    });
  } catch (error) {
    console.error("Create workspace error:", error);
    return NextResponse.json({ error: "创建工作空间失败" }, { status: 500 });
  }
}
