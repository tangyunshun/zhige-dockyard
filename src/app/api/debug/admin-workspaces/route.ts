import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 查找 admin 用户
    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: "admin" } },
          { role: { in: ["admin", "super_admin"] } },
          { name: { contains: "admin" } },
        ],
      },
    });

    if (!adminUser) {
      return NextResponse.json({ error: "未找到 admin 用户" }, { status: 404 });
    }

    // 查询 admin 用户的所有企业空间（包括已注销的）
    const allEnterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: adminUser.id,
        type: "ENTERPRISE",
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        createdAt: true,
      },
    });

    // 查询活跃企业空间（排除已注销的）
    const activeEnterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: adminUser.id,
        type: "ENTERPRISE",
        NOT: {
          description: {
            startsWith: "[已注销]",
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
      allEnterpriseWorkspaces: {
        count: allEnterpriseWorkspaces.length,
        workspaces: allEnterpriseWorkspaces,
      },
      activeEnterpriseWorkspaces: {
        count: activeEnterpriseWorkspaces.length,
        workspaces: activeEnterpriseWorkspaces,
      },
    });
  } catch (error) {
    console.error("Query admin workspaces error:", error);
    return NextResponse.json(
      { error: "查询失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
