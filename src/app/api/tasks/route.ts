export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未登录或身份令牌失效" }, { status: 401 });
    }

    const userId = auth.user.id;

    // 1. 查询当前用户加入的所有工作空间 ID
    const memberRecords = await prisma.workspacemember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });

    const userWsIds = new Set<string>(memberRecords.map((m) => m.workspaceId));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastWorkspaceId: true } });
    if (user?.lastWorkspaceId) {
      userWsIds.add(user.lastWorkspaceId);
    }

    const targetWsIds = Array.from(userWsIds);
    if (targetWsIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. 查询这些工作空间的元数据 (名称与类型)
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: targetWsIds } },
      select: { id: true, name: true, type: true },
    });

    const wsMap = new Map<string, { name: string; type: string }>();
    workspaces.forEach((w) => {
      wsMap.set(w.id, { name: w.name, type: w.type });
    });

    // 3. 跨空间查询 componenttask (过滤状态为非 ARCHIVED，按创建时间降序)
    const tasks = await prisma.componenttask.findMany({
      where: {
        tenantId: { in: targetWsIds },
        status: { not: "ARCHIVED" },
      },
      orderBy: { createdAt: "desc" },
    });

    // 4. 查询 componentcatalog 匹配真实组件名称 (Prisma 模型中字段为 type)
    const compIds = Array.from(new Set(tasks.map((t) => t.type).filter((id): id is string => !!id)));
    const catalogList = await prisma.componentcatalog.findMany({
      where: { id: { in: compIds } },
      select: { id: true, name: true },
    });

    const compNameMap = new Map<string, string>();
    catalogList.forEach((c) => {
      compNameMap.set(c.id, c.name);
    });

    // 5. 组装聚合返回契约
    const formattedData = tasks.map((t) => {
      const cId = t.type || "";
      const wsInfo = wsMap.get(t.tenantId || "") || { name: "工作空间", type: "PERSONAL" };
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        componentId: t.type,
        componentName: compNameMap.get(cId) || t.type || "",
        status: t.status,
        config: t.config,
        result: t.result,
        createdAt: t.createdAt,
        workspaceId: t.tenantId,
        workspaceName: wsInfo.name,
        workspaceType: wsInfo.type,
      };
    });

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error: any) {
    console.error("[TasksAPI Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "获取任务档案失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未登录或身份令牌失效" }, { status: 401 });
    }

    let idsToDelete: string[] = [];
    const urlParams = request.nextUrl.searchParams;
    const singleId = urlParams.get("id");
    const multiIds = urlParams.get("ids");

    if (singleId) {
      idsToDelete.push(singleId);
    } else if (multiIds) {
      idsToDelete = multiIds.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      try {
        const body = await request.json();
        if (body.taskId) idsToDelete.push(body.taskId);
        if (Array.isArray(body.taskIds)) idsToDelete.push(...body.taskIds);
      } catch (e) {
        // JSON body parsing fallback
      }
    }

    idsToDelete = Array.from(new Set(idsToDelete));
    if (idsToDelete.length === 0) {
      return NextResponse.json({ success: false, error: "未指定需要删除的任务分析记录 ID" }, { status: 400 });
    }

    // 从数据库中真正的执行任务记录删除
    const deleteResult = await prisma.componenttask.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    return NextResponse.json({
      success: true,
      message: `已成功删除 ${deleteResult.count} 笔任务分析成果记录`,
      count: deleteResult.count,
      deletedIds: idsToDelete,
    });
  } catch (error: any) {
    console.error("[TasksAPI DELETE Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "删除任务分析记录失败" }, { status: 500 });
  }
}
