import { NextRequest, NextResponse } from "next/server";
import { validateUser, isAdminRole } from "@/lib/auth";
import { requireWorkspaceMembership, getLogicalWorkspaceRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secrets";
import { testByoModelConnection, deriveSuggestedCapabilities } from "@/lib/workspace-byo-model";

/**
 * 规范化 endpoint 用于「同一目的地」判定（凭据绑定语义）：
 * - scheme 区分 http/https（协议降级不得复用旧 key）；
 * - host 大小写不敏感（RFC）；
 * - 路径大小写敏感（不同大小写路径可能对应不同服务/租户）；
 * - 仅消除默认端口差异（https:443、http:80 视为等价），非零默认端口保留；
 * - 不做整体小写、不删除 scheme、不吞掉路径大小写。
 */
function normalizeEndpoint(url: string | null | undefined): string {
  if (!url) return "";
  const s = String(url).trim();
  // [U06] query 参与目的地比较：query 变化（tenant/重复/编码差异）默认视为不同目标，
  // 不得复用旧 key；仅逐字节相同的 query 才等价（偏严格，不扩大授权）。
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^#]*)/.exec(s);
  if (!m) return s; // 非标准 URL：原样比较（偏严格，不跨方案复用）
  const scheme = m[1].toLowerCase();
  let host = m[2].toLowerCase();
  const pathAndQuery = m[3] || "";
  if (scheme === "https") host = host.replace(/:443$/, "");
  else if (scheme === "http") host = host.replace(/:80$/, "");
  return `${scheme}://${host}${pathAndQuery}`;
}

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

    // 未填写密钥时的兜底：仅当本次测试目标与已保存配置「完全一致」（同 endpoint 含逐字节相同 query + 同一协议）
    // 才复用已保存密钥，便于不重输密钥验证已保存配置是否仍连通。
    // 目标变更（新的 baseUrl 或不同协议）必须重新提供该目标的授权凭据，
    // 禁止拿旧 key 发往新目的地（防 SSRF/跨域携带旧 Authorization）。
    if (!apiKey && baseUrl) {
      const row = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
      if (row) {
        const sameDestination =
          normalizeEndpoint(row.baseUrl) === normalizeEndpoint(baseUrl) &&
          (!protocol || protocol === row.protocol);
        if (sameDestination) {
          try {
            apiKey = decryptSecret(row.apiKeyCipher);
          } catch {
            // 解密失败（主密钥不匹配等）→ 维持空密钥，测试将以鉴权失败返回明确提示
          }
        }
      }
    }

    const result = await testByoModelConnection({ baseUrl, protocol, apiKey, modelLabel });
    const suggestedCapabilities = deriveSuggestedCapabilities(result.sampleReply);
    return NextResponse.json({ success: result.ok, ...result, suggestedCapabilities });
  } catch (error) {
    console.error("[byo-model] TEST 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试通道调用异常" }, { status: 500 });
  }
}
