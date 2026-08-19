import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SESSION_ERROR_CODES, VALIDATE_ERROR_TO_SESSION_CODE } from "@/lib/session-constants";

// 查询当前用户在指定工作空间的成员身份，供前端"空间级别踢出"检测（PRD F-03）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    const reason = auth.error || "UNAUTHORIZED";
    const code = VALIDATE_ERROR_TO_SESSION_CODE[reason] || reason;
    return NextResponse.json(
      { error: reason, code },
      { status: code === SESSION_ERROR_CODES.W_001 ? 403 : 401 },
    );
  }
  const { id: workspaceId } = await params;

  const member = await prisma.workspacemember.findFirst({
    where: { workspaceId, userId: auth.user.id },
  });

  if (member) {
    return NextResponse.json({ isMember: true, member: { role: member.role } });
  }

  // 兜底：owner 即使缺失 workspacemember 记录也视为有效成员（与 /api/workspace/list 的
  // "防止 workspacemember 记录缺失" 逻辑保持一致），避免 owner 被误判为"已移出空间"
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (workspace && workspace.ownerId === auth.user.id) {
    return NextResponse.json({ isMember: true, member: { role: "OWNER" } });
  }

  // F-03：确实已被移出空间，返回 W-001 错误码，前端清空空间缓存跳转中控台
  return NextResponse.json(
    { isMember: false, error: "WORKSPACE_REMOVED", code: SESSION_ERROR_CODES.W_001 },
    { status: 403 },
  );
}
