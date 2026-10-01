import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  listComponentContracts,
  createDraftContract,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/components/[id]/contracts
 * 查询指定组件的所有合同版本列表
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId } = await context.params;

    // 读权限校验：允许具备 component:read 或 system:manage 权限的管理人员访问
    const authResult = await requirePlatformPermission(
      request,
      "component:read",
      "system:manage"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const contracts = await listComponentContracts(componentId);

    return NextResponse.json({
      success: true,
      data: {
        componentId,
        total: contracts.length,
        contracts: contracts.map((c) => ({
          id: c.id,
          componentId: c.componentId,
          contractVersion: c.contractVersion,
          lifecycle: c.lifecycle,
          description: c.description,
          publishedAt: c.publishedAt,
          publishedBy: c.publishedBy,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          contractSummary: {
            inputKind: c.contract.input.kind,
            pipelineStepCount: c.contract.materialPipeline?.steps?.length || 0,
            executionStepCount: c.contract.executionPlan?.steps?.length || 0,
            outputKind: c.contract.output.kind,
            rendererType: c.contract.output.rendererType,
            billingMode: c.contract.billingPolicy.mode,
          },
        })),
      },
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      const status =
        error.code === "COMPONENT_NOT_FOUND"
          ? 404
          : error.code === "CONTRACT_VALIDATION_FAILED"
          ? 400
          : 400;
      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("GET component contracts error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "获取组件合同列表失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/components/[id]/contracts
 * 创建新草稿合同 (DRAFT)
 * 权限强制要求：system:manage
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId } = await context.params;

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

    const { contractVersion, contract, description } = body;
    if (!contractVersion || typeof contractVersion !== "string") {
      return NextResponse.json(
        { success: false, code: "MISSING_CONTRACT_VERSION", error: "缺少合法的 contractVersion！" },
        { status: 400 }
      );
    }
    if (!contract || typeof contract !== "object") {
      return NextResponse.json(
        { success: false, code: "MISSING_CONTRACT_BODY", error: "缺少合法的 contract 配置主体！" },
        { status: 400 }
      );
    }

    const created = await createDraftContract({
      componentId,
      contractVersion: contractVersion.trim(),
      contract,
      description: typeof description === "string" ? description.trim() : undefined,
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `组件 [${componentId}] 合同版本 [${contractVersion}] 草稿创建成功！`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (error.code === "COMPONENT_NOT_FOUND") status = 404;
      else if (error.code === "CONTRACT_VERSION_EXISTS") status = 409;
      else if (error.code === "FORBIDDEN_MODEL_BINDING") status = 422;

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("POST draft contract error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "创建草稿合同失败" },
      { status: 500 }
    );
  }
}
