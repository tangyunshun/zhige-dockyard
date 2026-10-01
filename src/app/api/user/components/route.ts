import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

function toUserComponentView(c: any, contractLifecycle: string | null = null) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    category: c.category,
    status: c.isPublished ? "PUBLISHED" : "DRAFT",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    usageCount: c.usageCount,
    isPremium: c.isPremium,
    estimatedModelTokens: c.estimatedModelTokens,
    // 合同就绪状态（数据库唯一真源）：前端据此如实展示可执行性，禁止硬编码完成态
    activeContractLifecycle: contractLifecycle,
    hasActiveContract: Boolean(c.activeContractId),
    contractReady: contractLifecycle === "PUBLISHED",
    hasPublishedContract: contractLifecycle === "PUBLISHED",
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const [memberships, favorites] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId: auth.user.id },
        select: { workspaceId: true },
      }),
      prisma.componentfavorite.findMany({
        where: { userId: auth.user.id },
        select: { componentId: true },
      }),
    ]);
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const usages = await prisma.componentusage.findMany({
      where: {
        OR: [{ userId: auth.user.id }, { workspaceId: { in: workspaceIds } }],
      },
      select: { componentId: true },
      distinct: ["componentId"],
    });

    const relevantIds = Array.from(
      new Set([
        ...favorites.map((f) => f.componentId),
        ...usages.map((u) => u.componentId),
      ]),
    );

    let components;
    if (relevantIds.length > 0) {
      components = await prisma.componentcatalog.findMany({
        where: { id: { in: relevantIds } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });
    } else {
      components = await prisma.componentcatalog.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: 100,
      });
    }

    // 合同生命周期（数据库唯一真源）：批量读取激活合同状态，供前端如实展示可执行性
    const activeIds = components
      .map((c) => c.activeContractId)
      .filter((x): x is string => Boolean(x));
    const contractRows = activeIds.length
      ? await prisma.componentcontract.findMany({
          where: { id: { in: activeIds } },
          select: { id: true, lifecycle: true },
        })
      : [];
    const lifecycleMap = new Map(contractRows.map((r) => [r.id, r.lifecycle as string]));

    return NextResponse.json({
      success: true,
      data: components.map((c) =>
        toUserComponentView(c, c.activeContractId ? (lifecycleMap.get(c.activeContractId) ?? null) : null),
      ),
    });
  } catch (error) {
    console.warn("Get user components error:", error);
    return NextResponse.json({ error: "获取组件失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "组件目录由平台后台统一管理，请在“平台后台 > 组件管理”中维护" },
    { status: 403 },
  );
}

export async function DELETE(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "组件目录由平台后台统一管理，请在“平台后台 > 组件管理”中维护" },
    { status: 403 },
  );
}
