import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 获取用户可分享的企业空间列表
    const workspaces = await prisma.workspace.findMany({
      where: {
        type: "ENTERPRISE",
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
                role: "ADMIN",
              },
            },
          },
        ],
      },
      include: {
        members: {
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
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    console.error("Get shareable workspaces error:", error);
    return NextResponse.json({ error: "获取可分享空间列表失败" }, { status: 500 });
  }
}
