import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 加入企业空间
 * 通过邀请码或邀请 ID 加入企业空间
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
    const { inviteCode, invitationId } = body;

    // 通过邀请码加入企业空间
    if (inviteCode) {
      // 验证邀请码格式
      if (inviteCode.length !== 6) {
        return NextResponse.json({ error: "邀请码格式错误" }, { status: 400 });
      }

      // 查找企业空间
      const workspace = await prisma.workspace.findFirst({
        where: {
          type: "ENTERPRISE",
          inviteCode: inviteCode,
        },
      });

      if (!workspace) {
        return NextResponse.json({ error: "邀请码无效" }, { status: 404 });
      }

      // 检查用户是否已是成员
      const existingMember = await prisma.workspacemember.findFirst({
        where: {
          workspaceId: workspace.id,
          userId: userId,
        },
      });

      if (existingMember) {
        return NextResponse.json({ error: "您已经是该企业空间的成员" }, { status: 400 });
      }

      // 创建成员关系
      const member = await prisma.workspacemember.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId: workspace.id,
          role: "MEMBER",
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "加入企业空间成功",
        member,
      });
    }

    // 通过邀请 ID 加入
    if (invitationId) {
      const invitation = await prisma.workspaceinvitation.findUnique({
        where: { id: invitationId },
      });

      if (!invitation) {
        return NextResponse.json({ error: "邀请不存在" }, { status: 404 });
      }

      if (invitation.email !== authResult.user!.email) {
        return NextResponse.json({ error: "该邀请不属于您" }, { status: 403 });
      }

      if (invitation.expiresAt && new Date() > invitation.expiresAt) {
        return NextResponse.json({ error: "邀请已过期" }, { status: 400 });
      }

      // 检查是否已是成员
      const existingMember = await prisma.workspacemember.findFirst({
        where: {
          workspaceId: invitation.workspaceId,
          userId,
        },
      });

      if (existingMember) {
        return NextResponse.json({ error: "您已经是该企业空间的成员" }, { status: 400 });
      }

      // 创建成员关系
      const member = await prisma.workspacemember.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId: invitation.workspaceId,
          role: invitation.role || "MEMBER",
          updatedAt: new Date(),
        },
      });

      // 标记邀请为已使用
      await prisma.workspaceinvitation.update({
        where: { id: invitationId },
        data: {
          usedAt: new Date(),
          status: "USED",
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "加入企业空间成功",
        member,
      });
    }

    return NextResponse.json({ error: "缺少邀请码或邀请 ID" }, { status: 400 });
  } catch (error) {
    console.error("Join workspace error:", error);
    return NextResponse.json({ error: "加入企业空间失败" }, { status: 500 });
  }
}
