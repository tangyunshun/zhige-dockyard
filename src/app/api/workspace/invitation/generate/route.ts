import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// 生成邀请码
function generateInvitationCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!userId) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, email, expiresInDays } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 验证用户是否是空间所有者或管理员
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    if (workspace.ownerId !== userId) {
      const member = workspace.members.find(
        (m) => m.userId === userId && m.role === "ADMIN",
      );
      if (!member) {
        return NextResponse.json(
          { error: "无权生成邀请码" },
          { status: 403 },
        );
      }
    }

    // 生成邀请码
    const invitationCode = generateInvitationCode();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        code: invitationCode,
        createdBy: userId,
        email: email || null,
        expiresAt,
      },
    });

    // 生成邀请链接
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/workspace-hub?invitationCode=${invitationCode}`;

    return NextResponse.json({
      success: true,
      invitation: {
        code: invitation.code,
        workspaceId: invitation.workspaceId,
        workspaceName: workspace.name,
        expiresAt: invitation.expiresAt,
        invitationUrl,
      },
    });
  } catch (error) {
    console.error("生成邀请码失败:", error);
    return NextResponse.json(
      { error: "生成邀请码失败" },
      { status: 500 },
    );
  }
}
