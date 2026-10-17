import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  activateContract,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

/**
 * POST /api/admin/components/[id]/contracts/[version]/activate
 * 将指定「已发布」合同版本切换为组件当前生效的执行合同（同事务审计）
 * 权限强制要求：system:manage
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId, version: contractVersion } = await context.params;

    // 核心安全红线：写操作必须强校验 platform:system:manage
    const authResult = await requirePlatformPermission(request, "system:manage");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const userId = authResult.user!.id;

    const activated = await activateContract({
      componentId,
      contractVersion,
      operatorId: userId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: activated,
      message: `组件 [${componentId}] 已切换生效合同版本为 [${contractVersion}]！`,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "CONTRACT_NOT_FOUND") status = 404;
      else if (
        error.code === "CONTRACT_NOT_PUBLISHED_CANNOT_ACTIVATE" ||
        error.code === "CONCURRENT_PUBLISH_CONFLICT"
      )
        status = 409;

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("POST activate contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "激活组件合同失败" },
      { status: 500 }
    );
  }
}
