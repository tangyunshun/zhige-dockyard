import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership, getLogicalWorkspaceRole } from "@/lib/security";

/**
 * 工作空间维度操作审计日志（前端「空间审计日志」页真实数据源）
 * 从数据库 prisma.position 动态映射岗位中文名，从 prisma.user 动态联表解析用户真名。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const { id: workspaceId } = await params;
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(userId, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "无权访问该工作空间日志" }, { status: 403 });
    }
    const logicalRole = await getLogicalWorkspaceRole(userId, workspaceId);
    const isManager = logicalRole === "ADMIN" || logicalRole === "OWNER";

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const action = searchParams.get("action") || "";
    const userKeyword = searchParams.get("user") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const titleKeyword = searchParams.get("titleKeyword") || searchParams.get("title") || "";

    const where: any = { workspaceId };
    if (action) where.action = action;
    if (userKeyword) {
      where.user = {
        OR: [
          { name: { contains: userKeyword } },
          { email: { contains: userKeyword } },
        ],
      };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // 查寻管理员累计已删除的变更记录条数
    const configKey = `admin_deleted_log_count_${workspaceId}`;
    const deletedConfig = await prisma.systemconfig.findUnique({ where: { key: configKey } }).catch(() => null);
    const adminDeletedLogCount = deletedConfig ? parseInt(deletedConfig.value || "0") : 0;

    // 拉取全量日志记录
    const allLogs = await prisma.operationlog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
    });

    const parseDetails = (raw: any) => {
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch (e) { return {}; }
      }
      return {};
    };

    let filteredLogs = allLogs;
    if (!isManager) {
      filteredLogs = filteredLogs.filter((l: any) => {
        const det = parseDetails(l.details);
        return l.userId === userId || det.uploaderId === userId;
      });
    }

    if (titleKeyword.trim()) {
      const kw = titleKeyword.trim().toLowerCase();
      filteredLogs = filteredLogs.filter((l: any) => {
        const det = parseDetails(l.details);
        const text = [det.title, l.user?.name, l.user?.email, det.reasonDetail, det.comment, det.message]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(kw);
      });
    }

    const total = filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const pagedLogs = filteredLogs.slice(startIndex, startIndex + limit);

    // 数据库动态联表查询 1: 从 prisma.position 表拉取真实 code -> name 映射
    const dbPositions = await prisma.position.findMany({ select: { code: true, name: true } }).catch(() => []);
    const positionMap = new Map(dbPositions.map((p) => [p.code.toUpperCase(), p.name]));

    // 数据库动态联表查询 2: 提取日志中所有 targetUserId，从 prisma.user 表获取真实姓名
    const targetUserIds = Array.from(new Set(allLogs.map((l: any) => {
      const d = parseDetails(l.details);
      return d.targetUserId || d.targetId || null;
    }).filter((id): id is string => Boolean(id))));

    const targetUsers = targetUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: targetUserIds } },
          select: { id: true, name: true, email: true, phone: true }
        }).catch(() => [])
      : [];
    const targetUserMap = new Map(targetUsers.map((u) => [u.id, u.name || u.email || u.phone || "关联成员"]));

    // 动态转换封装带有数据库真实中文名信息的 details
    const enrichedLogs = pagedLogs.map((l: any) => {
      const det = parseDetails(l.details);
      const rawRole = det.newRole || det.role || det.positionCode || "";
      const roleCodeUpper = String(rawRole).trim().toUpperCase();
      // 动态使用数据库 position 表中文名；回退按真实通用中文
      const dbRoleName = positionMap.get(roleCodeUpper) || (
        roleCodeUpper === "OWNER" ? "空间所有者" :
        roleCodeUpper === "ADMIN" ? "空间管理员" :
        roleCodeUpper === "MEMBER" ? "普通成员" :
        roleCodeUpper === "PROJECT_MANAGER" ? "项目经理" :
        roleCodeUpper === "UI_DESIGNER" ? "UI/UX 设计师" :
        roleCodeUpper === "DBA_ARCHITECT" ? "DBA 数据库架构师" :
        roleCodeUpper === "BACKEND_ENGINEER" ? "后端工程师" :
        roleCodeUpper === "FRONTEND_ENGINEER" ? "前端工程师" :
        rawRole
      );

      const targetUserObj = det.targetUserId ? targetUserMap.get(det.targetUserId) : null;
      const resolvedTargetName = det.targetName || det.targetUserName || targetUserObj || (det.targetUserId ? "关联成员" : null);

      return {
        ...l,
        details: {
          ...det,
          newRoleName: dbRoleName,
          roleName: dbRoleName,
          targetUserName: resolvedTargetName,
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: enrichedLogs,
        total,
        page,
        limit,
        totalPages,
        adminDeletedLogCount,
        stats: { total, today: filteredLogs.filter(l => new Date(l.createdAt) >= new Date(new Date().setHours(0,0,0,0))).length },
      },
    });
  } catch (error: any) {
    console.error("Get workspace logs error:", error);
    return NextResponse.json(
      { error: "获取空间日志失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
