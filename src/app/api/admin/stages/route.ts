import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 统一管理员鉴权：返回 null 表示通过，否则返回错误响应
 */
async function requireAdmin(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/admin/stages
 * 获取所有阶段分类（真实数据源：component_category 表），并统计每个分类下的组件数。
 */
export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";

    const skip = (page - 1) * limit;

    // 真实数据源：组件分类表（阶段分类）
    const categories = await prisma.componentcategory.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // 统计每个分类下的组件数量（component_catalog.category = component_category.key）
    const grouped = await prisma.componentcatalog.groupBy({
      by: ["category"],
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    grouped.forEach((g) => countMap.set(g.category, g._count._all));

    const totalComponents = await prisma.componentcatalog.count();

    // 搜索过滤（按名称）
    let filtered = categories;
    if (search) {
      const kw = search.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(kw));
    }

    const buildStage = (cat: {
      key: string; name: string; color: string; range: string;
      sortOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date;
    }) => ({
      id: cat.key,
      key: cat.key,
      name: cat.name,
      color: cat.color,
      range: cat.range,
      description: "",
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      componentCount: countMap.get(cat.key) || 0,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    });

    const stages = filtered.map(buildStage);
    const total = stages.length;
    const paged = stages.slice(skip, skip + limit);

    const activeCount = categories.filter((c) => c.isActive).length;
    const summary = {
      totalStages: categories.length,
      activeStages: activeCount,
      inactiveStages: categories.length - activeCount,
      totalComponents,
    };

    // 分布分析：每个阶段的组件数 / 占比 / 活跃等级
    const distribution = stages
      .map((s) => {
        const percentage = totalComponents > 0 ? Math.round((s.componentCount / totalComponents) * 100) : 0;
        return {
          stageId: s.id,
          stageName: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
          color: s.color,
          range: s.range,
          componentCount: s.componentCount,
          percentage,
          isActive: s.isActive,
          activityLevel: s.componentCount > 5 ? "HIGH" : s.componentCount > 0 ? "NORMAL" : "IDLE",
        };
      })
      .sort((a, b) => b.componentCount - a.componentCount);

    const emptyStages = distribution.filter((s) => s.componentCount === 0);
    const topStage = distribution.length > 0 ? distribution[0] : null;
    const metrics = {
      activeRate: categories.length > 0 ? Math.round((activeCount / categories.length) * 100) : 0,
      topStageName: topStage ? topStage.stageName : "暂无",
      topStageCount: topStage ? topStage.componentCount : 0,
      topStagePercentage: topStage ? topStage.percentage : 0,
      emptyStageCount: emptyStages.length,
      avgComponentsPerStage: categories.length > 0 ? Number((totalComponents / categories.length).toFixed(1)) : 0,
    };

    // 时间趋势：基于 component_catalog 的 createdAt 按分类分桶
    const timeRange = searchParams.get("timeRange") || "halfYear";
    const analyticsStart = searchParams.get("analyticsStart");
    const analyticsEnd = searchParams.get("analyticsEnd");

    const now = new Date();
    const trendBuckets: { label: string; start: Date; end: Date }[] = [];

    if (timeRange === "week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const end = new Date(d); end.setHours(23, 59, 59, 999);
        trendBuckets.push({ label, start, end });
      }
    } else if (timeRange === "month") {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 5 * 24 * 60 * 60 * 1000);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
        trendBuckets.push({ label, start, end });
      }
    } else if (timeRange === "year") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextM = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        trendBuckets.push({ label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, start: d, end: nextM });
      }
    } else if (timeRange === "custom" && analyticsStart && analyticsEnd) {
      const sDate = new Date(analyticsStart);
      const eDate = new Date(analyticsEnd);
      const diffDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (24 * 60 * 60 * 1000)));
      const step = Math.max(1, Math.floor(diffDays / 6));
      for (let i = 0; i < 6; i++) {
        const curStart = new Date(sDate.getTime() + i * step * 24 * 60 * 60 * 1000);
        const curEnd = new Date(sDate.getTime() + (i + 1) * step * 24 * 60 * 60 * 1000);
        trendBuckets.push({
          label: `${curStart.getMonth() + 1}/${curStart.getDate()}`,
          start: curStart,
          end: curEnd,
        });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextM = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        trendBuckets.push({ label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, start: d, end: nextM });
      }
    }

    const allComps = await prisma.componentcatalog.findMany({
      select: { category: true, createdAt: true },
    });

    const trendPoints = trendBuckets.map((bucket) => {
      const bucketComps = allComps.filter((c) => {
        const recDate = new Date(c.createdAt);
        return recDate >= bucket.start && recDate < bucket.end;
      });
      // 有组件时，标签显示该桶内最新组件的实际日期，避免桶起始日期与真实数据日期偏差
      let label = bucket.label;
      if (bucketComps.length > 0) {
        const latestTs = Math.max(...bucketComps.map((c) => new Date(c.createdAt).getTime()));
        const latest = new Date(latestTs);
        label = `${latest.getMonth() + 1}/${latest.getDate()}`;
      }
      const stageBreakdown: Record<string, number> = {};
      stages.slice(0, 6).forEach((s) => {
        stageBreakdown[s.name] = bucketComps.filter((c) => c.category === s.key).length;
      });
      return {
        label,
        total: bucketComps.length,
        ...stageBreakdown,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        stages: paged,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary,
        analytics: {
          metrics,
          distribution,
          trend: trendPoints,
        },
      },
    });
  } catch (error) {
    console.error("Get stages error:", error);
    return NextResponse.json(
      { error: "获取阶段列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// POST - 创建阶段分类
export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const body = await request.json();
    const { name, color, range, sortOrder, key, isActive } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "缺少阶段分类名称" }, { status: 400 });
    }

    // key 作为主键，未提供时自动生成
    let categoryKey = (key && key.trim()) || "";
    if (!categoryKey) {
      categoryKey = `CAT_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    }

    const existing = await prisma.componentcategory.findUnique({ where: { key: categoryKey } });
    if (existing) {
      return NextResponse.json({ error: "阶段分类标识已存在，请更换" }, { status: 409 });
    }

    const created = await prisma.componentcategory.create({
      data: {
        key: categoryKey,
        name: name.trim(),
        color: color || "#3182ce",
        range: range || "",
        sortOrder: sortOrder || 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return NextResponse.json({
      success: true,
      data: created,
      message: "创建阶段分类成功",
    });
  } catch (error) {
    console.error("Create stage error:", error);
    return NextResponse.json(
      { error: "创建阶段分类失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// 统一更新阶段逻辑（支持 PUT 和 PATCH）
async function handleUpdateStage(request: NextRequest) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    let stageId = searchParams.get("id");

    const body = await request.json().catch(() => ({}));
    if (!stageId && body.id) {
      stageId = body.id;
    }

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段分类 ID" }, { status: 400 });
    }

    const { name, color, range, sortOrder, isActive } = body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;
    if (range !== undefined) data.range = range;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    // 启用/停用切换：启用(isActive=true)或禁用(isActive=false)
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.componentcategory.update({
      where: { key: stageId },
      data,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "更新阶段分类成功",
    });
  } catch (error) {
    console.error("Update stage error:", error);
    return NextResponse.json(
      { error: "更新阶段分类失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// PUT - 更新阶段分类
export async function PUT(request: NextRequest) {
  return handleUpdateStage(request);
}

// PATCH - 更新阶段分类
export async function PATCH(request: NextRequest) {
  return handleUpdateStage(request);
}

// DELETE - 删除阶段分类（名下仍有组件时禁止删除）
export async function DELETE(request: NextRequest) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const stageId = searchParams.get("id");

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段分类 ID" }, { status: 400 });
    }

    const count = await prisma.componentcatalog.count({ where: { category: stageId } });
    if (count > 0) {
      return NextResponse.json(
        { error: `该分类下仍有 ${count} 个组件，请先清空关联组件后再删除` },
        { status: 400 }
      );
    }

    await prisma.componentcategory.delete({ where: { key: stageId } });

    return NextResponse.json({
      success: true,
      message: "删除阶段分类成功",
    });
  } catch (error) {
    console.error("Delete stage error:", error);
    return NextResponse.json(
      { error: "删除阶段分类失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
