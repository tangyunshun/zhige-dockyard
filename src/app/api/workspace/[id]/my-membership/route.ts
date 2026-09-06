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

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true, status: true, name: true, quota: true },
  });

  let workspaceStatus = workspace?.status || "ACTIVE";
  const rawQuotaJson = (workspace?.quota as any) || {};
  let disabledUntil = rawQuotaJson.disabledUntil || null;
  let disabledReason = rawQuotaJson.disabledReason || null;
  let appealStatus = rawQuotaJson.appealStatus || "none";

  // 自动到期解封自愈
  if (workspaceStatus === "DISABLED" && disabledUntil) {
    const expireTime = new Date(disabledUntil).getTime();
    if (!isNaN(expireTime) && Date.now() > expireTime) {
      workspaceStatus = "ACTIVE";
      disabledUntil = null;
      disabledReason = null;
      const {
        disabledUntil: d1,
        disabledReason: d2,
        disabledDuration: d3,
        disabledDurationDays: d4,
        disabledAt: d5,
        ...restQuota
      } = rawQuotaJson;

      prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          status: "ACTIVE",
          quota: {
            ...restQuota,
            appealStatus: "none",
          },
        },
      }).catch(() => {});
    }
  }

  const isOwner = workspace?.ownerId === auth.user.id;

  if (member) {
    return NextResponse.json({
      isMember: true,
      workspaceStatus,
      disabledUntil,
      disabledReason,
      appealStatus,
      isOwner,
      member: { role: member.role },
    });
  }

  // 兜底：owner 即使缺失 workspacemember 记录也视为有效成员
  if (isOwner) {
    return NextResponse.json({
      isMember: true,
      workspaceStatus,
      disabledUntil,
      disabledReason,
      appealStatus,
      isOwner: true,
      member: { role: "OWNER" },
    });
  }

  // F-03：确实已被移出空间，返回 W-001 错误码，前端清空空间缓存跳转中控台
  return NextResponse.json(
    { isMember: false, error: "WORKSPACE_REMOVED", code: SESSION_ERROR_CODES.W_001 },
    { status: 403 },
  );
}
