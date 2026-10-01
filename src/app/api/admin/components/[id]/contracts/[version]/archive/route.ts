import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  archiveContract,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

/**
 * POST /api/admin/components/[id]/contracts/[version]/archive
 * 归档合同版本
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

    const archived = await archiveContract({
      componentId,
      contractVersion,
      operatorId: userId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: archived,
      message: `组件 [${componentId}] 合同版本 [${contractVersion}] 已成功归档！该版本不再可被作为执行快照。`,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "CONTRACT_NOT_FOUND") status = 404;
      else if (error.code === "CONTRACT_ALREADY_ARCHIVED" || error.code === "ACTIVE_CONTRACT_CANNOT_ARCHIVE") status = 409;

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("POST archive contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "归档组件合同失败" },
      { status: 500 }
    );
  }
}
