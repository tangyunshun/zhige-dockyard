import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import { deleteDraftContract, ComponentContractError } from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

/**
 * POST /api/admin/components/[id]/contracts/[version]/delete
 * 删除草稿合同版本（仅 DRAFT 可删；已发布 / 已归档不可删）
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

    const deleted = await deleteDraftContract({
      componentId,
      contractVersion,
      operatorId: userId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: deleted,
      message: `组件 [${componentId}] 草稿版本 [${contractVersion}] 已删除！`,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "CONTRACT_NOT_FOUND") status = 404;
      else if (
        error.code === "CONTRACT_NOT_DRAFT_CANNOT_DELETE" ||
        error.code === "ACTIVE_CONTRACT_CANNOT_DELETE"
      ) {
        status = 409;
      }

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("POST delete contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "删除草稿合同失败" },
      { status: 500 }
    );
  }
}
