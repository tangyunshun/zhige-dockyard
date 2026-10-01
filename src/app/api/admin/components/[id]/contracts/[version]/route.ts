import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  getComponentContract,
  updateDraftContract,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string; version: string }>;
}

/**
 * GET /api/admin/components/[id]/contracts/[version]
 * 获取指定版本的完整合同详情
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId, version: contractVersion } = await context.params;

    // 读权限校验
    const authResult = await requirePlatformPermission(
      request,
      "component:read",
      "system:manage"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const record = await getComponentContract(componentId, contractVersion);
    if (!record) {
      return NextResponse.json(
        {
          success: false,
          code: "CONTRACT_NOT_FOUND",
          error: `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: record,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status: 400 }
      );
    }
    console.error("GET component contract detail error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "获取合同详情失败" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/components/[id]/contracts/[version]
 * 仅允许修改 DRAFT 状态合同！
 * 权限强制要求：system:manage
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId, version: contractVersion } = await context.params;

    // 核心安全红线：写操作必须强校验 platform:system:manage
    const authResult = await requirePlatformPermission(request, "system:manage");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST_BODY", error: "请求体必须为合法 JSON 对象！" },
        { status: 400 }
      );
    }

    const { contract, description } = body;
    if (!contract || typeof contract !== "object") {
      return NextResponse.json(
        { success: false, code: "MISSING_CONTRACT_BODY", error: "缺少待更新的 contract 配置！" },
        { status: 400 }
      );
    }

    const updated = await updateDraftContract({
      componentId,
      contractVersion,
      contract,
      description: typeof description === "string" ? description.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `组件 [${componentId}] 合同版本 [${contractVersion}] 草稿更新成功！`,
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "CONTRACT_NOT_FOUND") status = 404;
      else if (error.code === "CONTRACT_IMMUTABLE") status = 409;
      else if (error.code === "FORBIDDEN_MODEL_BINDING") status = 422;

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("PATCH draft contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "更新草稿合同失败" },
      { status: 500 }
    );
  }
}
