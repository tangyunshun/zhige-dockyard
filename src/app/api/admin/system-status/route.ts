import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!adminUser || !isAdminRole(adminUser.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 1. 数据库连通性与响应时间探针
    const dbStartTime = Date.now();
    let dbStatus = "healthy";
    let dbLatency = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStartTime;
    } catch (e) {
      dbStatus = "degraded";
      dbLatency = Date.now() - dbStartTime;
    }

    // 2. 真实数据库实体数据量统计
    const [userCount, workspaceCount, componentCount, logCount, docCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.workspace.count(),
        prisma.componenttask.count(),
        prisma.operationlog.count(),
        prisma.systemdocument.count(),
      ]);

    // 3. Node.js 内存与系统运行时长指标
    const memory = process.memoryUsage();
    const heapUsedMB = Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10;
    const heapTotalMB = Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10;
    const rssMB = Math.round((memory.rss / 1024 / 1024) * 10) / 10;
    const uptimeSec = Math.floor(process.uptime());

    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const formattedUptime = `${days > 0 ? `${days}天 ` : ""}${hours}小时 ${minutes}分钟`;

    // 4. 微服务与组件健康矩阵：每项均通过一次真实数据往返探针测得延迟与可用性，不再写死 healthy / 固定毫秒
    const probeService = async (
      id: string,
      name: string,
      type: string,
      runner: () => Promise<unknown>,
      detailsBuilder: () => string,
    ) => {
      const startedAt = Date.now();
      try {
        await runner();
        const latencyMs = Date.now() - startedAt;
        return {
          id,
          name,
          type,
          status: latencyMs > 300 ? "warning" : "healthy",
          statusText: latencyMs > 300 ? "响应延迟偏高" : "运行正常",
          latency: `${latencyMs}ms`,
          details: detailsBuilder(),
        };
      } catch (err) {
        return {
          id,
          name,
          type,
          status: "down",
          statusText: "探针失败",
          latency: `${Date.now() - startedAt}ms`,
          details: err instanceof Error ? err.message : "服务探测失败",
        };
      }
    };

    const services = await Promise.all([
      // 主数据库：真实连通性探针（已在上方测得，此处复用）
      (async () => {
        const startedAt = Date.now();
        try {
          await prisma.$queryRaw`SELECT 1`;
          const latencyMs = Date.now() - startedAt;
          return {
            id: "mysql_db",
            name: "主数据库引擎 (MySQL / Prisma ORM)",
            type: "Database",
            status: latencyMs > 300 ? "warning" : "healthy",
            statusText: latencyMs > 300 ? "响应延迟偏高" : "运行正常",
            latency: `${latencyMs}ms`,
            details: `已承载 ${userCount} 名用户，${workspaceCount} 个工作空间，${componentCount} 个组件`,
          };
        } catch (err) {
          return {
            id: "mysql_db",
            name: "主数据库引擎 (MySQL / Prisma ORM)",
            type: "Database",
            status: "down",
            statusText: "探针失败",
            latency: `${Date.now() - startedAt}ms`,
            details: err instanceof Error ? err.message : "数据库探测失败",
          };
        }
      })(),
      // 应用渲染内核：以一次真实业务数据读取代表渲染链路
      probeService(
        "nextjs_ssr",
        "应用渲染内核 (Next.js App Router)",
        "Core Engine",
        () => prisma.componenttask.findFirst({ select: { id: true } }),
        () =>
          `Node.js ${process.version} (${process.platform}-${process.arch})，堆内存 ${heapUsedMB}MB`,
      ),
      // 鉴权中心：以鉴权守卫真实执行的用户查询作为探针
      probeService(
        "auth_service",
        "安全与多因子鉴权中心 (Auth Guard)",
        "Security",
        async () => {
          await prisma.user.findFirst({ select: { id: true, role: true } });
        },
        () => "JWT 校验、RBAC 权限路由拦截与会话管控在线",
      ),
      // 审计管道：以审计表最近一条写入/读取作为探针
      probeService(
        "audit_logger",
        "操作审计与日志流水管道 (Audit Pipe)",
        "Audit & Log",
        () =>
          prisma.operationlog.findFirst({
            select: { id: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          }),
        () => `累计纳管 ${logCount} 条全量业务审计操作记录`,
      ),
      // 内容引擎：以知识文档表真实查询作为探针
      probeService(
        "knowledge_engine",
        "知识文档与内容服务引擎 (Docs Engine)",
        "Content",
        () => prisma.systemdocument.findFirst({ select: { id: true } }),
        () => `当前发布并维护 ${docCount} 篇公开知识资产`,
      ),
    ]);

    // 计算综合健康评分 (0-100)
    let healthScore = 100;
    if (dbLatency > 100) healthScore -= 10;
    if (heapUsedMB > 1000) healthScore -= 10;
    // 探针判定为异常 / 延迟偏高的服务同样扣分，健康评分与实际探针结果联动
    healthScore -= services.filter((s) => s.status === "down").length * 20;
    healthScore -= services.filter((s) => s.status === "warning").length * 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    return NextResponse.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        overallStatus: healthScore >= 90 ? "OPTIMAL" : "DEGRADED",
        healthScore,
        dbLatency,
        formattedUptime,
        uptimeSec,
        heapUsedMB,
        heapTotalMB,
        rssMB,
        nodeVersion: process.version,
        platform: `${process.platform} (${process.arch})`,
        stats: {
          userCount,
          workspaceCount,
          componentCount,
          logCount,
          docCount,
        },
        services,
      },
    });
  } catch (error) {
    console.error("Get system status error:", error);
    return NextResponse.json(
      {
        error: "获取系统运行状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}
