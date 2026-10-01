import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { isSupportedModelProtocol, validateModelBaseUrlForRequest, SUPPORTED_MODEL_PROTOCOLS } from "@/lib/model-endpoint";
import { encryptSecret } from "@/lib/crypto-secrets";

/** GET：列出全部模型供应商（不含任何密钥，仅暴露环境变量名） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const rows = await prisma.modelprovider.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    // 暴露运行时密钥配置状态，便于管理员在保存前发现「环境变量未配置」导致的 MODEL_NOT_CONFIGURED
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      protocol: r.protocol,
      baseUrl: r.baseUrl,
      apiKeyEnv: r.apiKeyEnv,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      hasApiKey: !!r.apiKeyCipher,
      apiKeyConfigured: !!r.apiKeyCipher || (!r.apiKeyEnv ? true : !!process.env[r.apiKeyEnv]),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[model-provider] 查询失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询供应商失败" }, { status: 500 });
  }
}

/** POST：新增模型供应商（API Key 不入库，仅记录环境变量名） */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    if (!name) return NextResponse.json({ success: false, error: "供应商名称不能为空" }, { status: 400 });
    if (!baseUrl) return NextResponse.json({ success: false, error: "Base URL 不能为空" }, { status: 400 });
    const protocol =
      typeof body.protocol === "string" && body.protocol.trim()
        ? body.protocol.trim().toUpperCase()
        : "OPENAI_COMPATIBLE";
    if (!isSupportedModelProtocol(protocol)) {
      return NextResponse.json(
        { success: false, error: `暂不支持的对接协议：${protocol}（可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}）` },
        { status: 400 },
      );
    }
    // SSRF 防护：仅 https，禁止本机/内网/链路本地/元数据地址
    const endpoint = await validateModelBaseUrlForRequest(baseUrl);
    if (!endpoint.ok) {
      return NextResponse.json({ success: false, error: endpoint.error }, { status: 400 });
    }
    // 密钥两种录入方式（二选一，密文优先）：
    //  - apiKey：后台直接录入明文，服务端加密落库（apiKeyCipher），无需改环境变量；
    //  - apiKeyEnv：仅记录环境变量名，运行时从服务端环境变量读取（兼容旧配置/本地免密钥留空）。
    const apiKeyEnv = typeof body.apiKeyEnv === "string" ? body.apiKeyEnv.trim() : "";
    const apiKeyPlain = typeof body.apiKey === "string" ? body.apiKey : "";
    const apiKeyCipher = apiKeyPlain ? encryptSecret(apiKeyPlain) : undefined;

    const row = await prisma.modelprovider.create({
      data: {
        id: randomUUID(),
        name,
        protocol,
        baseUrl: endpoint.url,
        apiKeyEnv,
        apiKeyCipher,
        enabled: body.enabled !== false,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      },
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ success: false, error: "供应商名称已存在" }, { status: 409 });
    }
    console.error("[model-provider] 创建失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "创建供应商失败" }, { status: 500 });
  }
}
