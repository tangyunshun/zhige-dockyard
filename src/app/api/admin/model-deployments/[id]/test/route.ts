import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { testDeploymentConnection } from "@/lib/model-registry";

/**
 * 模型注册表「测试通道」：按 deploymentId 解析其所属 provider 的端点与密钥（优先密文、回退环境变量），
 * 真实发一次最小调用验证该部署模型是否可用，并把 health / lastTestedAt 落库（与供应商「测试连接」同口径）。
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

    // ignoreDisabled：后台编辑弹窗内的连通性健康探测属管理员受权诊断，允许对禁用中通道
    // 发起一次最小探测（max_tokens: 1），实现「先测通、再启用」闭环，不受业务门禁阻断。
    const result = await testDeploymentConnection(id, { ignoreDisabled: true });

    // 落库：无论成功失败都记录健康状态与测试时间（部署可能已被删除，忽略落库失败）
    const health = result.ok ? "healthy" : "error";
    await prisma.modeldeployment
      .update({ where: { id }, data: { health, lastTestedAt: new Date() } })
      .catch(() => {});

    await writeAuditLog(auth.user?.id || "", "model_deployment:test", {
      deploymentId: id,
      ok: result.ok,
      health,
    }, null, null, request);

    return NextResponse.json({ success: result.ok, health, ...result });
  } catch (error) {
    console.error("[model-deployment] TEST 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "测试通道调用异常" }, { status: 500 });
  }
}
