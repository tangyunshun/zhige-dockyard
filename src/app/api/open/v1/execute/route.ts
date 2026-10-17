import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { checkOpenApiRateLimit } from "@/lib/open-api-rate-limit";
import { runStudioPost, buildProductionDeps } from "@/app/api/studio/handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/open/v1/execute
 * 开放平台组件执行端点（业务闭环）。
 *
 * 鉴权：Authorization: Bearer <API_KEY> 或 x-api-key: <API_KEY>
 * 执行逻辑：100% 复用页面执行核心 runStudioPost(..., buildProductionDeps())，
 *   仅通过依赖注入把「会话 userId」替换为「API Key 解析出的 userId」，
 *   不复制任何估价/押金/真实模型/结算/退款逻辑（这些由算账/押金状态机统一裁决）。
 *
 * 渠道标记：pointledger 无 sourceType 字段、consumePoints 也无该入参，
 *   故不直接给流水打 OPEN_API 标记（避免触碰算账中心内部）；
 *   改为在 componenttask.config.channel 记录 "OPEN_API"，并写一条 OPEN_API_EXECUTE 审计，
 *   对账时以 taskId 关联 componenttask(where channel=OPEN_API) ↔ pointledger 即可区分渠道。
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "无效或缺失的 API Key" },
      { status: 401 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // 限流：API Key 维度（阈值见 open-api-rate-limit.ts，可经 systemconfig 配置）
  const rate = await checkOpenApiRateLimit(auth.keyId);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: `当前 API Key 每分钟请求上限为 ${rate.limit}，请稍后重试`,
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "请求体必须为合法 JSON" },
      { status: 400 },
    );
  }

  const { workspaceId, componentId, taskName, inputMaterial, inputSource, formData } = body;
  if (!workspaceId || !componentId) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "缺少必填字段 workspaceId 或 componentId" },
      { status: 400 },
    );
  }

  // 越权校验：API Key 所属用户必须是该工作空间成员（与页面执行同口径；
  // runStudioPost 内部还会再次校验成员/岗位/禁用态，此处提供清晰的 403 前置拦截）。
  const isMember = await requireWorkspaceMembership(auth.userId, workspaceId);
  if (!isMember) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "API Key 所属用户不属于该工作空间，无组件执行权限",
      },
      { status: 403 },
    );
  }

  // 构造与页面 simulate 同构的请求体（action 固定为 simulate）
  const simBody = {
    action: "simulate",
    workspaceId,
    componentId,
    taskName: typeof taskName === "string" ? taskName : null,
    inputMaterial: typeof inputMaterial === "string" ? inputMaterial : null,
    inputSource: inputSource && typeof inputSource === "object" ? inputSource : null,
    formData: formData && typeof formData === "object" && !Array.isArray(formData) ? formData : null,
  };

  // 依赖注入边界：用 API Key 解析出的 userId 覆盖会话 userId，其余执行依赖全部复用真实单例
  const deps = {
    ...buildProductionDeps(),
    getUserId: async () => auth.userId,
  };

  const simReq = new NextRequest(new URL(request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(simBody),
  });

  const resp = await runStudioPost(simReq, deps);
  const data = (await resp.json().catch(() => ({}))) as Record<string, any>;

  // 结算挂起（202）或成功（200）：构造开放接口响应形状并补渠道标记
  const task = (data.task || {}) as Record<string, any>;
  const taskId: string | undefined = task.id || (typeof data.taskId === "string" ? data.taskId : undefined);

  const openData: Record<string, any> = {
    success: true,
    taskId,
    status: task.status || (resp.status === 202 ? "SETTLEMENT_PENDING" : undefined),
    estimatedPoints: data.estimatedPoints ?? null,
    depositPoints: data.depositPoints ?? null,
    actualPoints: data.actualPoints ?? null,
    executionMode: data.executionMode ?? null,
    contractVersion: data.contractVersion ?? null,
    artifacts: data.artifacts ?? null,
    usage: data.usage ?? null,
    poll: taskId
      ? {
          method: "GET",
          url: `/api/open/v1/tasks/${taskId}`,
          note: "模型调用可能超过客户端 HTTP 超时，请用此端点轮询进度与结果",
        }
      : undefined,
  };

  if (taskId) {
    await tagOpenApiChannel(taskId, {
      userId: auth.userId,
      keyId: auth.keyId,
      keyName: auth.keyName,
      componentId,
      workspaceId,
      status: String(openData.status ?? ""),
      ip,
    });
  }

  if (resp.status === 202) {
    return NextResponse.json(openData, { status: 202 });
  }
  if (data.success === true) {
    return NextResponse.json(openData, { status: 200 });
  }

  // 业务错误：沿用算账/执行核心返回的稳定 code（如 POINTS_INSUFFICIENT / COMPONENT_CONTRACT_NOT_READY）
  const errCode = typeof data.code === "string" ? data.code : mapStatusToError(resp.status);
  return NextResponse.json(
    { error: errCode, message: data.error || data.message || "组件执行失败" },
    { status: resp.status },
  );
}

function mapStatusToError(status: number): string {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "EXECUTION_FAILED";
  }
}

/**
 * 渠道标记 + 审计（尽力而为，失败不影响主执行结果）。
 * - componenttask.config.channel = "OPEN_API"（幂等：写入常量）；
 * - operationlog 以 opapi_<taskId> 为幂等键，避免重复审计。
 */
async function tagOpenApiChannel(
  taskId: string,
  meta: {
    userId: string;
    keyId: string;
    keyName: string;
    componentId: string;
    workspaceId: string;
    status: string;
    ip: string;
  },
): Promise<void> {
  try {
    const cur = await prisma.componenttask.findUnique({
      where: { id: taskId },
      select: { config: true },
    });
    const merged = {
      ...(typeof cur?.config === "object" && cur?.config ? (cur.config as object) : {}),
      channel: "OPEN_API",
    };
    await prisma.componenttask.update({
      where: { id: taskId },
      data: { config: merged as any },
    });
  } catch (e) {
    console.warn("[open/v1/execute] channel 标记失败(不影响执行):", (e as Error)?.message);
  }

  try {
    await prisma.operationlog.create({
      data: {
        id: `opapi_${taskId}`,
        userId: meta.userId,
        action: "OPEN_API_EXECUTE",
        resource: "ComponentTask",
        details: {
          taskId,
          keyId: meta.keyId,
          keyName: meta.keyName,
          componentId: meta.componentId,
          workspaceId: meta.workspaceId,
          status: meta.status,
        },
        ipAddress: meta.ip,
        createdAt: new Date(),
      },
    });
  } catch (e) {
    console.warn("[open/v1/execute] 审计写入失败(不影响执行):", (e as Error)?.message);
  }
}
