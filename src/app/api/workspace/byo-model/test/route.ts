import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import { requireWorkspaceMembership, getLogicalWorkspaceRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secrets";
import { testByoModelConnection } from "@/lib/workspace-byo-model";

/**
 * BYO 配置权限：平台管理员（isAdminRole）可代管任意空间；
 * 否则必须是该空间成员，且写操作需 OWNER/ADMIN 角色。
 * 返回非 null 表示已直接响应（拒绝）。
 */
async function assertByoAccess(
  user: { id: string; role?: string | null },
  workspaceId: string,
  requireWrite: boolean,
): Promise<NextResponse | null> {
  if (isAdminRole(user.role)) return null;
  const isMember = await requireWorkspaceMembership(user.id, workspaceId);
  if (!isMember) return NextResponse.json({ error: "无权访问该工作空间" }, { status: 403 });
  if (requireWrite) {
    const role = await getLogicalWorkspaceRole(user.id, workspaceId);
    if (role !== "OWNER" && role !== "ADMIN") {
      return NextResponse.json({ error: "仅空间所有者或管理员可配置自带模型" }, { status: 403 });
    }
  }
  return null;
}

/**
 * 测试通道：真实发一次最小模型调用验证 BYO 端点 + 密钥是否可用（不落库）。
 * 支持「未保存即测」：使用请求体中的临时参数；权限与写操作一致（空间 OWNER/ADMIN 或平台管理员）。
 * 路径：POST /api/workspace/byo-model/test?workspaceId=xxx
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    if (!workspaceId) return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });

    const denied = await assertByoAccess(auth.user, workspaceId, true);
    if (denied) return denied;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const protocol = typeof body.protocol === "string" ? body.protocol.trim() : "OPENAI_COMPATIBLE";
    let apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    const modelLabel = typeof body.label === "string" ? body.label.trim() : "";

    if (!baseUrl) return NextResponse.json({ error: "Base URL 不能为空" }, { status: 400 });

    // 未填写密钥时，回退使用已保存配置的密钥：便于在不重输密钥的情况下验证已保存配置是否仍连通。
    // 仅在该空间已配置 BYO 时生效（权限已在上一步 assertByoAccess 校验）。
    if (!apiKey) {
      const row = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
      if (row) {
        try {
          apiKey = decryptSecret(row.apiKeyCipher);
        } catch {
          // 解密失败（主密钥不匹配等）→ 维持空密钥，测试将以鉴权失败返回明确提示
        }
      }
    }

    const result = await testByoModelConnection({ baseUrl, protocol, apiKey, modelLabel });
    return NextResponse.json({ success: result.ok, ...result });
  } catch (error) {
    console.error("[byo-model] TEST 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试通道调用异常" }, { status: 500 });
  }
}
