import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secrets";
import { testByoModelConnection } from "@/lib/workspace-byo-model";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/byo-models/test
 * 测试通道：用表单当前填写的端点/协议/密钥真实发起一次最小调用（不落库、密钥仅内存使用）。
 * 既可在保存前验证，也可用于已创建定义的连通自检。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const protocol = typeof body.protocol === "string" ? body.protocol : "OPENAI_COMPATIBLE";
    let apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    const defId = typeof body.defId === "string" ? body.defId : "";
    if (!apiKey && defId) {
      const def = await prisma.user_byo_model_def.findUnique({
        where: { id: defId },
        select: { ownerUserId: true, apiKeyCipher: true },
      });
      if (
        def &&
        (def.ownerUserId === auth.user.id || auth.user.role === "SUPER_ADMIN" || auth.user.role === "ADMIN") &&
        def.apiKeyCipher
      ) {
        try {
          apiKey = decryptSecret(def.apiKeyCipher);
        } catch {
          // 忽略
        }
      }
    }
    const label = typeof body.label === "string" ? body.label : "byo-test";
    if (!baseUrl) {
      return NextResponse.json({ success: false, error: "请先填写 Base URL 端点地址" }, { status: 400 });
    }
    const result = await testByoModelConnection({ baseUrl, protocol, apiKey, modelLabel: label });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[user/byo-models/test] 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试通道调用失败" }, { status: 500 });
  }
}
