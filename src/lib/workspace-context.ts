/**
 * Workspace Context 校验（PRD 模块 F）
 *
 * F-01：JWT 中只存 AccountId；前端请求 Header 携带 X-Workspace-Id，
 *       系统据此校验用户在当前空间下的有效成员身份。
 * F-02：空间级强制踢出仅删除 workspace:members 映射，不删全局 RT。
 * F-03：访问被移出空间的接口，返回 WORKSPACE_REMOVED，前端清空空间缓存跳转中控台。
 *
 * 说明：PRD 原意在网关层做空间校验，本仓库无独立网关，
 * 故在各 workspace 业务路由内统一调用本函数完成上下文校验。
 */
import { prisma } from "@/lib/prisma";
import { SESSION_ERROR_CODES } from "@/lib/session-constants";

export interface WorkspaceContextResult {
  ok: boolean;
  code?: string; // PRD 统一错误码 W-001
  error?: string;
  member?: { role: string };
}

/**
 * 校验 userId 是否为 workspaceId 的有效成员。
 * 返回 ok=false 且 code=W-001 表示已被移出空间（F-03）。
 */
export async function validateWorkspaceMembership(
  userId: string,
  workspaceId: string | null | undefined,
): Promise<WorkspaceContextResult> {
  if (!workspaceId) {
    // 未指定空间：交由调用方决定（如中控台列表接口允许不带）
    return { ok: true };
  }

  const member = await prisma.workspacemember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true },
  });

  if (!member) {
    return {
      ok: false,
      code: SESSION_ERROR_CODES.W_001,
      error: "WORKSPACE_REMOVED",
    };
  }

  return { ok: true, member: { role: member.role } };
}

/** 从请求 Header 提取 X-Workspace-Id（F-01） */
export function getWorkspaceIdFromRequest(request: Request): string | null {
  const header = request.headers.get("X-Workspace-Id");
  if (header && header.trim().length > 0) return header.trim();
  // 兼容 query / body 中的 workspaceId
  const url = new URL(request.url);
  return url.searchParams.get("workspaceId");
}
