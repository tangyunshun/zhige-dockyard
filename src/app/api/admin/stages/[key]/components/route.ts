import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * POST /api/admin/stages/[key]/components
 * 为指定阶段批量挂载组件。
 *
 * 业务规则（阶段管理）：
 *  - 一个组件只能挂载到一个阶段（componentcatalog.category 为单值，天然保证"一组件一阶段"）。
 *  - 唯一性校验：若待挂载组件中已有组件属于「其它阶段」，则整批拒绝（400），并返回被占用组件清单，
 *    杜绝同一组件同时挂在多个阶段。
 *  - 仅当组件当前未挂载任何阶段（category 为空）或本就属于该阶段时，才允许挂载/保持。
 */
export async function POST(request: NextRequest) {
  try {
    // 细粒度权限：阶段维护 / 发布
    const permCheck = await requirePlatformPermission(
      request,
      "content:stage_manage",
      "content:stage_publish",
    );
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限维护组件阶段" }, { status: 403 });
    }
    // 管理员鉴权
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 从 URL 路径解析阶段 key（避免 Next 版本间 params 形态差异）：
    // /api/admin/stages/<key>/components
    const stageKey = new URL(request.url).pathname.split("/").filter(Boolean).slice(-2)[0];
    if (!stageKey) {
      return NextResponse.json({ error: "缺少阶段标识" }, { status: 400 });
    }
    const stage = await prisma.componentcategory.findUnique({ where: { key: stageKey } });
    if (!stage) {
      return NextResponse.json({ error: "阶段不存在" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const componentIds: string[] = Array.isArray(body.componentIds) ? body.componentIds : [];
    if (componentIds.length === 0) {
      return NextResponse.json({ error: "未选择任何组件" }, { status: 400 });
    }

    // 取待挂载组件当前归属，做唯一性校验
    const components = await prisma.componentcatalog.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, name: true, category: true },
    });
    const foundIds = new Set(components.map((c) => c.id));
    const missing = componentIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `以下组件不存在：${missing.join(", ")}` },
        { status: 404 },
      );
    }

    // 批量挂载：将组件归属阶段更新为目标阶段。
    // 业务规则：组件归属为单值（category），因此「挂载到新阶段」即「转移到新阶段」，
    // 原所在阶段随之自动腾空——天然保证「一个组件只属于一个阶段」，无需占用校验拦截。
    const updated = await prisma.componentcatalog.updateMany({
      where: { id: { in: componentIds } },
      data: { category: stageKey },
    });

    return NextResponse.json({
      success: true,
      mounted: updated.count,
      message: `已为阶段「${stage.name}」挂载 ${updated.count} 个组件`,
    });
  } catch (error) {
    console.error("Mount components to stage error:", error);
    return NextResponse.json(
      { error: "挂载组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
