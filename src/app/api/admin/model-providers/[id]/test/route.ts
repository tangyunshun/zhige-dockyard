import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { testProviderConnection } from "@/lib/model-registry";

/**
 * 供应商「测试连接」：按 providerId 解析其端点与密钥（优先密文、回退环境变量），
 * 真实发一次最小调用验证该供应商总闸是否可用（Base URL 可达 + API Key 有效 + 鉴权通过），
 * 并把 health / lastTestedAt 落库。
 * 路径：POST /api/admin/model-providers/[id]/test
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: "缺少 providerId" }, { status: 400 });

    // ignoreDisabled：管理员诊断供应商连通性属受权操作，允许对禁用中供应商发起最小探测，
    // 实现「先测通、再启用」闭环（与模型部署测试通道一致）。
    const result = await testProviderConnection(id, { ignoreDisabled: true });

    // 落库：无论成功失败都记录健康状态与测试时间（health 语义由调用方统一写入）
    const health = result.ok ? "healthy" : "error";
    await prisma.modelprovider
      .update({ where: { id }, data: { health, lastTestedAt: new Date() } })
      .catch(() => {
        // 供应商可能已被删除，忽略落库失败（不影响返回测试结果）
      });

    return NextResponse.json({ success: result.ok, health, ...result });
  } catch (error) {
    console.error("[model-provider] TEST 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试连接调用异常" }, { status: 500 });
  }
}
