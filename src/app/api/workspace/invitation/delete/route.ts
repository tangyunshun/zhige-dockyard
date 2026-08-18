import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 2. 解析请求体
    const body = await request.json();
    const { invitationId, action } = body; // action: 'revoke' | 'delete'

    if (!invitationId) {
      return NextResponse.json({ error: "缺少邀请记录 ID" }, { status: 400 });
    }

    // 3. 查找该邀请记录及其关联的 workspaces
    const invitation = await prisma.workspaceinvitation.findUnique({
      where: { id: invitationId },
      include: {
        workspace: {
          include: {
            workspacemember: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "邀请记录不存在" }, { status: 404 });
    }

    // 4. 验证当前用户是否有管理权限（必须是该空间的所有者或管理员）
    const isOwner = invitation.workspace.ownerId === userId;
    const isAdmin = invitation.workspace.workspacemember.some(
      (m: any) => m.userId === userId && m.role === "ADMIN"
    );

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "您没有权限管理此邀请记录" },
        { status: 403 }
      );
    }

    // 5. 根据 action 执行作废或物理删除
    if (action === "revoke") {
      await prisma.workspaceinvitation.update({
        where: { id: invitationId },
        data: {
          status: "REVOKED",
          expiresAt: new Date(Date.now() - 1000), // 立即过期失效
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({
        success: true,
        message: "邀请记录已成功作废",
      });
    } else {
      // 物理删除
      await prisma.workspaceinvitation.delete({
        where: { id: invitationId },
      });
      return NextResponse.json({
        success: true,
        message: "邀请记录已成功删除",
      });
    }
  } catch (error) {
    console.error("Manage invitation error:", error);
    return NextResponse.json({ error: "操作邀请记录失败" }, { status: 500 });
  }
}
