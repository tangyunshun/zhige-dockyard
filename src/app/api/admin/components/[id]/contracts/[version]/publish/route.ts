import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  publishContract,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

/**
 * POST /api/admin/components/[id]/contracts/[version]/publish
 * 发布合同版本（权威强校验、并发安全保护、审计流水）
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

    const published = await publishContract({
      componentId,
      contractVersion,
      publishedBy: userId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: published,
      message: `组件 [${componentId}] 合同版本 [${contractVersion}] 已成功发布上线！历史快照已永久锁定。`,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "CONTRACT_NOT_FOUND") status = 404;
      else if (error.code === "CONTRACT_ALREADY_PUBLISHED") status = 409;
      else if (error.code === "CONCURRENT_PUBLISH_CONFLICT") status = 409;
      else if (error.code === "CONTRACT_ARCHIVED_CANNOT_PUBLISH") status = 400;
      else if (error.code === "FORBIDDEN_MODEL_BINDING") status = 422;

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("POST publish contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "发布组件合同失败" },
      { status: 500 }
    );
  }
}
