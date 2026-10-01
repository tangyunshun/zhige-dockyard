import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { testDeploymentConnection } from "@/lib/model-registry";

/**
 * 模型注册表「测试通道」：按 deploymentId 解析其所属 provider 的端点与密钥（优先密文、回退环境变量），
 * 真实发一次最小调用验证该部署模型是否可用（不落库）。
 * 路径：POST /api/admin/model-deployments/[id]/test
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
    if (!id) return NextResponse.json({ success: false, error: "缺少 deploymentId" }, { status: 400 });

    const result = await testDeploymentConnection(id);
    return NextResponse.json({ success: result.ok, ...result });
  } catch (error) {
    console.error("[model-deployment] TEST 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试通道调用异常" }, { status: 500 });
  }
}
