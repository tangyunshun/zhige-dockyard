import { NextRequest, NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/security";
import {
  getImmutableContractSnapshot,
  ComponentContractError,
} from "@/lib/component-contract";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/components/[id]/contract-snapshot
 * 获取组件的不可变合同快照
 * 查询参数：?version=1.0.0 (可选，缺省时读取当前激活的生效版本)
 *
 * 核心安全防线与反泄露管控：
 * 1. 后台完整读取：必须要求平台管理员 system:manage 权限，方可读取 promptTemplate、executionPlan、流水线与内部质检策略；
 * 2. 普通前端与匿名用户：仅下发经过严格白名单清洗的公开输入/输出元数据（表单约束、渲染器类型、成果物格式）；
 * 3. 商业机密绝对隔离：promptTemplate、pipeline、内部校验规则、模型策略绝对不下发客户端；
 * 4. 仅允许读取 PUBLISHED 状态的快照，DRAFT 或 ARCHIVED 严格拦截 (409)。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: componentId } = await context.params;
    const { searchParams } = new URL(request.url);
    const version = searchParams.get("version") || undefined;

    const snapshot = await getImmutableContractSnapshot(componentId, version);

    // 检查管理员特权：仅当具备 system:manage 权限时才下发完整内部合同
    const adminCheck = await requirePlatformPermission(request, "system:manage");
    if (adminCheck.authorized) {
      return NextResponse.json({
        success: true,
        data: snapshot,
      });
    }

    // 普通前端 / 匿名访问：白名单清洗敏感字段（绝对剔除 promptTemplate、pipeline、qualityPolicy、billingPolicy）
    const contract = snapshot.contract;
    const publicMetadata = {
      componentId: contract.componentId,
      contractVersion: contract.contractVersion,
      lifecycle: contract.lifecycle,
      publishedAt: contract.publishedAt,
      input: {
        kind: contract.input.kind,
        textConstraints: contract.input.textConstraints
          ? {
              required: contract.input.textConstraints.required,
              minLength: contract.input.textConstraints.minLength,
              maxLength: contract.input.textConstraints.maxLength,
              placeholder: contract.input.textConstraints.placeholder,
            }
          : undefined,
        fileConstraints: contract.input.fileConstraints
          ? {
              required: contract.input.fileConstraints.required,
              minCount: contract.input.fileConstraints.minCount,
              maxCount: contract.input.fileConstraints.maxCount,
              acceptedMimes: contract.input.fileConstraints.acceptedMimes,
              maxSingleFileBytes: contract.input.fileConstraints.maxSingleFileBytes,
              maxTotalBytes: contract.input.fileConstraints.maxTotalBytes,
            }
          : undefined,
        formConstraints: contract.input.formConstraints
          ? {
              fields: contract.input.formConstraints.fields.map((f) => ({
                name: f.name,
                label: f.label,
                type: f.type,
                required: f.required,
                options: f.options,
                defaultValue: f.defaultValue,
              })),
            }
          : undefined,
      },
      output: {
        kind: contract.output.kind,
        artifactMime: contract.output.artifactMime,
        schemaVersion: contract.output.schemaVersion,
        rendererType: contract.output.rendererType,
        previewable: contract.output.previewable,
        downloadable: contract.output.downloadable,
      },
    };

    return NextResponse.json({
      success: true,
      data: {
        snapshotId: snapshot.snapshotId,
        snapshotCreatedAt: snapshot.snapshotCreatedAt,
        contract: publicMetadata,
      },
    });
  } catch (error) {
    if (error instanceof ComponentContractError) {
      let status = 400;
      if (
        error.code === "CONTRACT_NOT_FOUND" ||
        error.code === "NO_PUBLISHED_CONTRACT" ||
        error.code === "NO_ACTIVE_CONTRACT" ||
        error.code === "COMPONENT_NOT_FOUND"
      ) {
        status = 404;
      } else if (
        error.code === "CONTRACT_ARCHIVED_CANNOT_EXECUTE" ||
        error.code === "CONTRACT_DRAFT_CANNOT_EXECUTE"
      ) {
        status = 409;
      }

      return NextResponse.json(
        { success: false, code: error.code, error: error.message, details: error.details },
        { status }
      );
    }
    console.error("GET contract snapshot error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "获取组件合同快照失败" },
      { status: 500 }
    );
  }
}
