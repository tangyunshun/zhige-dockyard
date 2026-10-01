import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import {
  getPlatformDefaultDeploymentId,
  setPlatformDefaultDeploymentId,
} from "@/lib/model-registry";

/**
 * 平台默认模型部署（管理员后台可配置）
 *
 * 原则：
 *  - 存储于数据库 system_config，**绝不硬编码**、绝不读取环境变量兜底；
 *  - 仅持有 system:manage / model:manage 权限的管理员可写；
 *  - 写入前由领域层强制校验目标部署真实存在，杜绝悬挂默认配置。
 */

/** GET：读取当前平台默认模型部署 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const deploymentId = await getPlatformDefaultDeploymentId();
    const deployment = deploymentId
      ? await prisma.modeldeployment.findUnique({
          where: { id: deploymentId },
          select: {
            id: true,
            providerId: true,
            modelId: true,
            upstreamModel: true,
            displayName: true,
            contextLimit: true,
            enabled: true,
          },
        })
      : null;
    return NextResponse.json({ success: true, deploymentId: deploymentId ?? null, deployment });
  } catch (e) {
    console.error("[admin/model-deployments/default] 读取平台默认模型失败:", e);
    return NextResponse.json({ success: false, error: "读取平台默认模型失败" }, { status: 500 });
  }
}

/** PUT：设置平台默认模型部署（body.deploymentId 传 null 表示清除） */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!("deploymentId" in body)) {
      return NextResponse.json(
        { success: false, error: "缺少 deploymentId 字段（传 null 表示清除平台默认模型）" },
        { status: 400 },
      );
    }
    const raw = body.deploymentId;
    if (raw !== null && typeof raw !== "string") {
      return NextResponse.json({ success: false, error: "deploymentId 必须为字符串或 null" }, { status: 400 });
    }
    const next = typeof raw === "string" ? raw.trim() : null;
    await setPlatformDefaultDeploymentId(next && next.length > 0 ? next : null);
    const after = await getPlatformDefaultDeploymentId();
    return NextResponse.json({ success: true, deploymentId: after ?? null });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    // 领域校验失败（如目标部署不存在）返回 400，其余按服务端错误处理
    if (err.status === 400) {
      return NextResponse.json({ success: false, error: err.message || "平台默认模型配置非法" }, { status: 400 });
    }
    console.error("[admin/model-deployments/default] 设置平台默认模型失败:", e);
    return NextResponse.json({ success: false, error: "设置平台默认模型失败" }, { status: 500 });
  }
}

/** DELETE：清除平台默认模型（等价的显式清除动作） */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    await setPlatformDefaultDeploymentId(null);
    return NextResponse.json({ success: true, deploymentId: null });
  } catch (e) {
    console.error("[admin/model-deployments/default] 清除平台默认模型失败:", e);
    return NextResponse.json({ success: false, error: "清除平台默认模型失败" }, { status: 500 });
  }
}
