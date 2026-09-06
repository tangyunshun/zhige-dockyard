import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * GET /api/admin/stages
 * 获取所有阶段信息
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || ""; // "active" | "inactive"
    const componentCount = searchParams.get("componentCount") || ""; // "0" | "gt0"
    const createDateStart = searchParams.get("createDateStart") || "";
    const createDateEnd = searchParams.get("createDateEnd") || "";

    const skip = (page - 1) * limit;
    
    // 获取所有阶段配置
    const allRecords = await prisma.componenttask.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // 过滤出阶段记录
    let stageRecords = allRecords.filter(
      (record) => (record.config as any)?.isStageConfig === true,
    );

    // 搜索过滤
    if (search) {
      stageRecords = stageRecords.filter((record) =>
        record.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 状态过滤
    if (status) {
      const isActive = status === "active";
      stageRecords = stageRecords.filter((record) => record.isPublished === isActive);
    }

    // 创建日期过滤
    if (createDateStart || createDateEnd) {
      stageRecords = stageRecords.filter((record) => {
        const recordDate = new Date(record.createdAt);
        if (createDateStart && recordDate < new Date(createDateStart)) {
          return false;
        }
        if (createDateEnd) {
          const endDate = new Date(createDateEnd);
          endDate.setHours(23, 59, 59, 999);
          if (recordDate > endDate) {
            return false;
          }
        }
        return true;
      });
    }

    // 统计每个阶段的组件数量
    const nonStageRecords = allRecords.filter(
      (record) => (record.config as any)?.isStageConfig !== true,
    );
    
    const typeCountMap = new Map<string, number>();
    nonStageRecords.forEach((record) => {
      const currentCount = typeCountMap.get(record.type) || 0;
      typeCountMap.set(record.type, currentCount + 1);
    });

    // 构建阶段列表
    let filteredStages = stageRecords.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description || "",
      sortOrder: record.sortOrder,
      isActive: record.isPublished,
      componentCount: typeCountMap.get(record.type) || 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));

    // 组件数量过滤
    if (componentCount) {
      if (componentCount === "0") {
        filteredStages = filteredStages.filter((s) => s.componentCount === 0);
      } else if (componentCount === "gt0") {
        filteredStages = filteredStages.filter((s) => s.componentCount > 0);
      }
    }

    // 统计全局真实指标（不受当前条件和分页截断影响）
    const allStageRecords = allRecords.filter(
      (record) => (record.config as any)?.isStageConfig === true,
    );
    const summary = {
      totalStages: allStageRecords.length,
      activeStages: allStageRecords.filter((r) => r.isPublished).length,
      inactiveStages: allStageRecords.filter((r) => !r.isPublished).length,
      totalComponents: nonStageRecords.length,
    };

    // 趋势与分布分析聚合 (供 Tab 2 阶段多维趋势与分布分析)
    const timeRange = searchParams.get("timeRange") || "halfYear"; // "week" | "month" | "halfYear" | "year" | "custom"
    const analyticsStart = searchParams.get("analyticsStart");
    const analyticsEnd = searchParams.get("analyticsEnd");

    // 计算各阶段组件分布
    const stageDistribution = allStageRecords.map((st) => {
      const count = typeCountMap.get(st.type) || 0;
      const percentage = nonStageRecords.length > 0
        ? Math.round((count / nonStageRecords.length) * 100)
        : 0;
      return {
        stageId: st.id,
        stageName: st.name,
        description: st.description || "",
        sortOrder: st.sortOrder,
        componentCount: count,
        percentage,
        isActive: st.isPublished,
        // 健康度/活跃等级判定
        activityLevel: count > 5 ? "HIGH" : count > 0 ? "NORMAL" : "IDLE",
      };
    }).sort((a, b) => b.componentCount - a.componentCount);

    // 多维关键分析指标
    const emptyStages = stageDistribution.filter((s) => s.componentCount === 0);
    const topStage = stageDistribution.length > 0 ? stageDistribution[0] : null;
    const activeRate = allStageRecords.length > 0
      ? Math.round((allStageRecords.filter((r) => r.isPublished).length / allStageRecords.length) * 100)
      : 0;

    const metrics = {
      activeRate, // 阶段启用率 %
      topStageName: topStage ? topStage.stageName : "暂无",
      topStageCount: topStage ? topStage.componentCount : 0,
      topStagePercentage: topStage ? topStage.percentage : 0,
      emptyStageCount: emptyStages.length, // 尚无组件挂载的阶段数
      avgComponentsPerStage: allStageRecords.length > 0
        ? Number((nonStageRecords.length / allStageRecords.length).toFixed(1))
        : 0,
    };

    // 计算时间趋势点
    const now = new Date();
    const trendBuckets: { label: string; start: Date; end: Date }[] = [];

    if (timeRange === "week") {
      // 本周：按 7 天切分
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        trendBuckets.push({ label, start, end });
      }
    } else if (timeRange === "month") {
      // 本月：按近 30 天切分 6 个时间区间（每 5 天一组）
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 5 * 24 * 60 * 60 * 1000);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
        trendBuckets.push({ label, start, end });
      }
    } else if (timeRange === "year") {
      // 本年度：12 个月切分
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextM = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        trendBuckets.push({ label, start: d, end: nextM });
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
      // 默认近半年：最近 6 个月切分
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextM = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        trendBuckets.push({ label, start: d, end: nextM });
      }
    }

    const trendPoints = trendBuckets.map((bucket) => {
      const bucketComponents = nonStageRecords.filter((rec) => {
        const recDate = new Date(rec.createdAt);
        return recDate >= bucket.start && recDate < bucket.end;
      });

      const stageBreakdown: Record<string, number> = {};
      allStageRecords.slice(0, 6).forEach((st) => {
        stageBreakdown[st.name] = bucketComponents.filter((r) => r.type === st.type).length;
      });

      return {
        label: bucket.label,
        total: bucketComponents.length,
        ...stageBreakdown,
      };
    });

    // 分页
    const total = filteredStages.length;
    const stages = filteredStages.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      data: {
        stages,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary,
        analytics: {
          metrics,
          distribution: stageDistribution,
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

// POST - 创建阶段
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, sortOrder, isPublished } = body;

    if (!name) {
      return NextResponse.json({ error: "缺少阶段名称" }, { status: 400 });
    }

    // 创建阶段配置
    const stage = await prisma.componenttask.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description,
        type: name, // 阶段类型与名称相同
        config: {
          isStageConfig: true,
        },
        sortOrder: sortOrder || 0,
        isPublished: isPublished ?? true,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: stage,
      message: "创建阶段成功",
    });
  } catch (error) {
    console.error("Create stage error:", error);
    return NextResponse.json(
      { error: "创建阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// 统一更新阶段逻辑（支持 PUT 和 PATCH）
async function handleUpdateStage(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let stageId = searchParams.get("id");

    const body = await request.json().catch(() => ({}));
    if (!stageId && body.id) {
      stageId = body.id;
    }

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段 ID" }, { status: 400 });
    }

    const { name, description, sortOrder, isPublished, isActive } = body;

    // 兼容 isActive 和 isPublished
    const targetPublished = isActive !== undefined ? isActive : isPublished;

    const stage = await prisma.componenttask.update({
      where: { id: stageId },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        type: name || undefined, // 如果名称改变，类型也改变
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
        isPublished: targetPublished !== undefined ? Boolean(targetPublished) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: stage,
      message: "更新阶段成功",
    });
  } catch (error) {
    console.error("Update stage error:", error);
    return NextResponse.json(
      { error: "更新阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// PUT - 更新阶段
export async function PUT(request: NextRequest) {
  return handleUpdateStage(request);
}

// PATCH - 更新阶段（支持部分字段及状态开关）
export async function PATCH(request: NextRequest) {
  return handleUpdateStage(request);
}

// DELETE - 删除阶段
export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const stageId = searchParams.get("id");

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段 ID" }, { status: 400 });
    }

    await prisma.componenttask.delete({
      where: { id: stageId },
    });

    return NextResponse.json({
      success: true,
      message: "删除阶段成功",
    });
  } catch (error) {
    console.error("Delete stage error:", error);
    return NextResponse.json(
      { error: "删除阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
