﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { randomBytes } from "crypto";

// 生成邀请码
function generateInvitationCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    const body = await request.json();
    const { workspaceId, email, expiresInDays } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 验证工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 验证用户权限
    if (workspace.ownerId !== userId) {
      const member = workspace.members.find(
        (m: any) => m.userId === userId && m.role === "ADMIN",
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
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 默认 7 天有效期

    // 保存邀请码到数据库
    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        invitationCode,
        expiresAt,
        createdBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      invitationCode,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.warn("Generate invitation error:", error);
    return NextResponse.json({ error: "生成邀请码失败" }, { status: 500 });
  }
}
